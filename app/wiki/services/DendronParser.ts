import type { GitHubFile } from "./GitHubService"
import type { DendronNote, RepoInfo } from "../types"
import type { TaskProgress, ProgressCallback } from "./GitHubService"
import { CacheService } from "./CacheService"
import { WorkerPool } from "./WorkerPool"

export class DendronParser {
  private cacheService = new CacheService()
  private workerPool: WorkerPool | null = null

  async parseNotes(
    files: GitHubFile[],
    githubService: any,
    repoInfo: RepoInfo,
    onProgress?: ProgressCallback,
  ): Promise<DendronNote[]> {
    const tasks: TaskProgress[] = [
      { id: "check-notes-cache", name: "Checking notes cache", status: "pending" },
      { id: "init-workers", name: "Initializing workers", status: "pending" },
      { id: "parse-files", name: "Parsing markdown files", status: "pending", progress: 0 },
      { id: "organize-notes", name: "Organizing note hierarchy", status: "pending" },
    ]

    const updateProgress = () => {
      onProgress?.(tasks)
    }

    try {
      // Task 0: Check if we have cached notes
      tasks[0].status = "running"
      tasks[0].message = "Checking for cached notes..."
      updateProgress()

      await this.cacheService.init()
      const cachedNotes = await this.cacheService.getNotes()

      if (cachedNotes && cachedNotes.length > 0) {
        tasks[0].status = "completed"
        tasks[0].message = `Found ${cachedNotes.length} cached notes`
        updateProgress()

        // Skip remaining tasks
        tasks.slice(1).forEach((task) => {
          task.status = "completed"
          task.message = "Skipped (using cache)"
          task.progress = 100
        })
        updateProgress()

        return cachedNotes
      }

      tasks[0].status = "completed"
      tasks[0].message = "No cached notes found, parsing files"
      updateProgress()

      // Task 1: Initialize workers
      tasks[1].status = "running"
      tasks[1].message = "Setting up parallel processing..."
      updateProgress()

      let useWorkers = false
      try {
        // Check if we're in a browser environment and workers are supported
        if (typeof Worker !== "undefined" && typeof window !== "undefined") {
          this.workerPool = new WorkerPool("/markdown-parser.worker.js")
          const stats = this.workerPool.getStats()

          tasks[1].status = "completed"
          tasks[1].message = `Initialized ${stats.totalWorkers} workers for parallel processing`
          useWorkers = true
        } else {
          throw new Error("Workers not supported in this environment")
        }
      } catch (error) {
        console.warn("Failed to initialize workers, falling back to main thread:", error)
        tasks[1].status = "completed"
        tasks[1].message = "Using main thread processing (workers unavailable)"
        useWorkers = false
      }
      updateProgress()

      // Task 2: Parse files
      tasks[2].status = "running"
      tasks[2].message = useWorkers ? "Starting parallel parsing..." : "Starting main thread parsing..."
      updateProgress()

      const notes = await this.parseFilesInParallel(files, tasks[2], updateProgress, useWorkers)

      tasks[2].status = "completed"
      tasks[2].message = `Parsed ${notes.length} notes`
      tasks[2].progress = 100
      updateProgress()

      // Task 3: Organize notes
      tasks[3].status = "running"
      tasks[3].message = "Building note hierarchy..."
      updateProgress()

      await this.delay(200)

      const sortedNotes = notes.sort((a, b) => a.title.localeCompare(b.title))

      tasks[3].status = "completed"
      tasks[3].message = `Organized ${sortedNotes.length} notes`
      updateProgress()

      // Cache the parsed notes
      await this.cacheService.cacheNotes(sortedNotes)

      return sortedNotes
    } catch (error) {
      throw error
    } finally {
      // Clean up workers
      if (this.workerPool) {
        this.workerPool.terminate()
        this.workerPool = null
      }
    }
  }

  private async parseFilesInParallel(
    files: GitHubFile[],
    progressTask: TaskProgress,
    updateProgress: () => void,
    useWorkers: boolean,
  ): Promise<DendronNote[]> {
    const notes: DendronNote[] = []
    const totalFiles = files.length
    let completedFiles = 0

    if (useWorkers && this.workerPool) {
      // Use Web Workers for parallel processing
      const batchSize = 10 // Process files in batches to avoid overwhelming the UI

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize)

        // Process batch in parallel
        const batchPromises = batch.map(async (file) => {
          if (!file.content) return null

          try {
            const response = await this.workerPool!.execute({
              file: {
                name: file.name,
                path: file.path,
                content: file.content,
              },
            })

            return response.note || null
          } catch (error) {
            console.warn(`Failed to parse ${file.name} in worker:`, error)
            // Fallback to main thread parsing
            return this.parseNoteMainThread(file)
          }
        })

        const batchResults = await Promise.all(batchPromises)
        const validNotes = batchResults.filter((note): note is DendronNote => note !== null)
        notes.push(...validNotes)

        completedFiles += batch.length
        const progress = Math.round((completedFiles / totalFiles) * 100)

        progressTask.progress = progress
        progressTask.message = `Parsed ${completedFiles} of ${totalFiles} files (${this.workerPool.getStats().totalWorkers} workers)`
        updateProgress()

        // Small delay to allow UI updates
        if (i + batchSize < files.length) {
          await this.delay(50)
        }
      }
    } else {
      // Fallback to main thread processing
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const progress = Math.round(((i + 1) / totalFiles) * 100)

        progressTask.message = `Parsing files ${i + 1} of ${totalFiles} (main thread)...`
        progressTask.progress = progress
        updateProgress()

        if (file.content) {
          const note = this.parseNoteMainThread(file)
          if (note) {
            notes.push(note)
          }
        }

        // Small delay for UX
        if (i % 10 === 0) {
          await this.delay(50)
        }
      }
    }

    return notes
  }

  private parseNoteMainThread(file: GitHubFile): DendronNote | null {
    if (!file.content) return null

    const { frontmatter, content } = this.parseFrontmatter(file.content)

    // Extract slug from filename (remove .md extension)
    const slug = file.name.replace(".md", "")

    // Extract title from frontmatter or use slug
    const title = frontmatter.title || this.slugToTitle(slug)

    return {
      slug,
      title,
      content,
      frontmatter,
      path: file.path,
    }
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, any>; content: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
      return { frontmatter: {}, content }
    }

    const [, frontmatterText, bodyContent] = match
    const frontmatter: Record<string, any> = {}

    // Parse YAML-like frontmatter
    frontmatterText.split("\n").forEach((line) => {
      const colonIndex = line.indexOf(":")
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim()
        const value = line.substring(colonIndex + 1).trim()

        // Handle arrays (tags, etc.)
        if (value.startsWith("[") && value.endsWith("]")) {
          frontmatter[key] = value
            .slice(1, -1)
            .split(",")
            .map((item) => item.trim().replace(/['"]/g, ""))
            .filter((item) => item.length > 0)
        } else {
          frontmatter[key] = value.replace(/['"]/g, "")
        }
      }
    })

    return { frontmatter, content: bodyContent }
  }

  private slugToTitle(slug: string): string {
    return slug
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" › ")
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
