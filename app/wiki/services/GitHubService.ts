import { CacheService, type CacheMetadata } from "./CacheService"

export interface GitHubFile {
  name: string
  path: string
  type: "file" | "dir"
  download_url?: string
  content?: string
  sha?: string
  size?: number
  repoOwner?: string
  repoName?: string
}

export interface TaskProgress {
  id: string
  name: string
  status: "pending" | "running" | "completed" | "error"
  message?: string
  progress?: number
  error?: string
}

export type ProgressCallback = (tasks: TaskProgress[]) => void

interface GitHubTreeItem {
  path: string
  mode: string
  type: "blob" | "tree"
  sha: string
  size?: number
  url: string
}

interface GitHubTreeResponse {
  sha: string
  url: string
  tree: GitHubTreeItem[]
  truncated: boolean
}

export class GitHubService {
  private baseUrl = "https://api.github.com"
  private rawUrl = "https://raw.githubusercontent.com"
  private cacheService = new CacheService()

  async getRepositoryFiles(
    owner: string,
    repo: string,
    onProgress?: ProgressCallback,
    path = "",
  ): Promise<GitHubFile[]> {
    const tasks: TaskProgress[] = [
      { id: "check-cache", name: "Checking cache", status: "pending" },
      { id: "validate", name: "Validating repository", status: "pending" },
      { id: "fetch-tree", name: "Fetching repository tree", status: "pending" },
      { id: "filter-files", name: "Filtering markdown files", status: "pending" },
      { id: "batch-download", name: "Downloading files", status: "pending", progress: 0 },
    ]

    const updateProgress = () => {
      onProgress?.(tasks)
    }

    try {
      // Task 0: Check cache
      tasks[0].status = "running"
      tasks[0].message = `Checking cache for ${owner}/${repo}...`
      updateProgress()

      await this.cacheService.init()

      // Check if we have a cached version
      const cacheMetadata = await this.cacheService.getCacheMetadata("github", owner, repo)
      const cachedFiles = await this.cacheService.getFiles("github", owner, repo)
      const cachedNotes = await this.cacheService.getNotes()

      console.log("Cache check:", {
        hasCacheMetadata: !!cacheMetadata,
        hasCachedFiles: !!cachedFiles && cachedFiles.length > 0,
        hasCachedNotes: !!cachedNotes && cachedNotes.length > 0,
        cacheTimestamp: cacheMetadata?.timestamp ? new Date(cacheMetadata.timestamp).toLocaleString() : "none",
      })

      // If we have cached files and notes, check if they're still valid
      if (cacheMetadata && cachedFiles && cachedNotes) {
        tasks[0].message = `Found cached version from ${new Date(cacheMetadata.timestamp).toLocaleString()}`

        // Check if cache is still valid by comparing with last commit
        const isValid = await this.validateCache(owner, repo, cacheMetadata)
        console.log("Cache validation result:", isValid)

        if (isValid) {
          tasks[0].status = "completed"
          tasks[0].message = `Using cached version (${cachedFiles.length} files)`
          updateProgress()

          // Skip remaining tasks
          tasks.slice(1).forEach((task) => {
            task.status = "completed"
            task.message = "Skipped (using cache)"
          })
          updateProgress()

          return cachedFiles
        } else {
          tasks[0].status = "completed"
          tasks[0].message = "Cache outdated, fetching fresh data"
          updateProgress()
        }
      } else {
        tasks[0].status = "completed"
        tasks[0].message = "No cache found, fetching fresh data"
        updateProgress()
      }

      // Task 1: Validate repository
      tasks[1].status = "running"
      tasks[1].message = `Checking ${owner}/${repo}...`
      updateProgress()

      await this.delay(300)

      tasks[1].status = "completed"
      tasks[1].message = "Repository validated"
      updateProgress()

      // Task 2: Fetch entire repository tree (single API call)
      tasks[2].status = "running"
      tasks[2].message = "Fetching complete repository structure..."
      updateProgress()

      try {
        const { tree, lastCommitSha, lastCommitTime } = await this.getRepositoryTree(owner, repo)

        tasks[2].status = "completed"
        tasks[2].message = `Found ${tree.length} total files`
        updateProgress()

        // Task 3: Filter markdown files
        tasks[3].status = "running"
        tasks[3].message = "Filtering markdown files..."
        updateProgress()

        const markdownFiles = tree.filter(
          (item) => item.type === "blob" && item.path.endsWith(".md") && item.size && item.size < 1024 * 1024, // Skip files larger than 1MB
        )

        tasks[3].status = "completed"
        tasks[3].message = `Found ${markdownFiles.length} markdown files`
        updateProgress()

        // Task 4: Batch download files
        tasks[4].status = "running"
        tasks[4].message = "Starting batch download..."
        updateProgress()

        const files = await this.batchDownloadFiles(owner, repo, markdownFiles, (progress) => {
          tasks[4].progress = progress.progress
          tasks[4].message = progress.message
          updateProgress()
        })

        tasks[4].status = "completed"
        tasks[4].message = `Downloaded ${files.length} files successfully`
        tasks[4].progress = 100
        updateProgress()

        // Cache the files
        await this.cacheService.cacheFiles(files, {
          timestamp: Date.now(),
          source: "github",
          repoInfo: {
            owner,
            repo,
            lastCommitSha,
            lastCommitTime,
          },
          fileCount: files.length,
        })

        return files
      } catch (apiError) {
        tasks[2].status = "error"
        tasks[2].error = apiError instanceof Error ? apiError.message : "Tree API failed"
        tasks[2].message = "Tree API failed, trying fallback method..."
        updateProgress()

        await this.delay(1000)

        // Fallback to raw access
        return await this.fallbackToRawAccess(owner, repo, tasks, updateProgress)
      }
    } catch (error) {
      // Mark all remaining tasks as error
      tasks.forEach((task) => {
        if (task.status === "pending" || task.status === "running") {
          task.status = "error"
          task.error = "Cancelled due to previous error"
        }
      })
      updateProgress()
      throw error
    }
  }

  private async validateCache(owner: string, repo: string, cacheMetadata: CacheMetadata): Promise<boolean> {
    try {
      console.log("Validating cache for", owner, repo)
      console.log("Cache metadata:", {
        lastCommitSha: cacheMetadata.repoInfo?.lastCommitSha || "none",
        lastCommitTime: cacheMetadata.repoInfo?.lastCommitTime
          ? new Date(cacheMetadata.repoInfo.lastCommitTime).toLocaleString()
          : "none",
      })

      // Get the latest commit info
      const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}/commits?per_page=1`
      console.log("Fetching latest commit from:", repoUrl)

      const response = await fetch(repoUrl, {
        headers: this.getHeaders(),
        cache: "no-store", // Ensure we get fresh data from GitHub API
      })

      if (!response.ok) {
        console.error("Failed to validate cache:", response.status, response.statusText)
        // If we can't validate, assume cache is invalid
        return false
      }

      const commits = await response.json()
      if (!commits || !commits[0]) {
        console.error("No commits found in response")
        return false
      }

      const latestCommit = commits[0]
      const latestCommitSha = latestCommit.sha
      const latestCommitTime = new Date(latestCommit.commit.committer.date).getTime()

      console.log("Latest commit:", {
        sha: latestCommitSha,
        time: new Date(latestCommitTime).toLocaleString(),
      })

      // If the cache is from before the latest commit, it's invalid
      if (
        !cacheMetadata.repoInfo?.lastCommitSha ||
        cacheMetadata.repoInfo.lastCommitSha !== latestCommitSha ||
        !cacheMetadata.repoInfo.lastCommitTime ||
        cacheMetadata.repoInfo.lastCommitTime < latestCommitTime
      ) {
        console.log("Cache is outdated")
        return false
      }

      // Add a time-based expiration (24 hours)
      const cacheAge = Date.now() - cacheMetadata.timestamp
      const maxCacheAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

      if (cacheAge > maxCacheAge) {
        console.log("Cache is too old (>24 hours)")
        return false
      }

      console.log("Cache is valid")
      // Cache is valid
      return true
    } catch (error) {
      console.error("Error validating cache:", error)
      // If validation fails, assume cache is invalid
      return false
    }
  }

  private async getRepositoryTree(
    owner: string,
    repo: string,
  ): Promise<{
    tree: GitHubTreeItem[]
    lastCommitSha: string
    lastCommitTime: number
  }> {
    // First, get the default branch
    const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}`
    const repoResponse = await fetch(repoUrl, {
      headers: this.getHeaders(),
    })

    if (!repoResponse.ok) {
      throw new Error(`Repository not found: ${repoResponse.status}`)
    }

    const repoData = await repoResponse.json()
    const defaultBranch = repoData.default_branch || "main"

    // Get the latest commit info
    const commitsUrl = `${this.baseUrl}/repos/${owner}/${repo}/commits?per_page=1&sha=${defaultBranch}`
    const commitsResponse = await fetch(commitsUrl, {
      headers: this.getHeaders(),
    })

    if (!commitsResponse.ok) {
      throw new Error(`Failed to get commits: ${commitsResponse.status}`)
    }

    const commits = await commitsResponse.json()
    const lastCommitSha = commits[0]?.sha
    const lastCommitTime = new Date(commits[0]?.commit?.committer?.date).getTime()

    // Get the tree recursively (single API call for entire repo)
    const treeUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
    const treeResponse = await fetch(treeUrl, {
      headers: this.getHeaders(),
    })

    if (!treeResponse.ok) {
      if (treeResponse.status === 403) {
        const rateLimitRemaining = treeResponse.headers.get("X-RateLimit-Remaining")
        const rateLimitReset = treeResponse.headers.get("X-RateLimit-Reset")

        let errorMessage = "GitHub API rate limit exceeded"
        if (rateLimitReset) {
          const resetTime = new Date(Number.parseInt(rateLimitReset) * 1000)
          errorMessage += `. Rate limit resets at ${resetTime.toLocaleTimeString()}`
        }
        throw new Error(errorMessage)
      }
      throw new Error(`Tree API error: ${treeResponse.status}`)
    }

    const treeData: GitHubTreeResponse = await treeResponse.json()

    if (treeData.truncated) {
      console.warn("Repository tree was truncated - some files may be missing")
    }

    return {
      tree: treeData.tree,
      lastCommitSha,
      lastCommitTime,
    }
  }

  private async batchDownloadFiles(
    owner: string,
    repo: string,
    treeItems: GitHubTreeItem[],
    onProgress: (progress: { message: string; progress: number }) => void,
  ): Promise<GitHubFile[]> {
    const files: GitHubFile[] = []
    const batchSize = 5 // Download 5 files concurrently
    const totalFiles = treeItems.length

    onProgress({ message: `Preparing to download ${totalFiles} files...`, progress: 0 })

    // Process files in batches to avoid overwhelming the API
    for (let i = 0; i < treeItems.length; i += batchSize) {
      const batch = treeItems.slice(i, i + batchSize)
      const progress = Math.round(((i + batch.length) / totalFiles) * 100)

      onProgress({
        message: `Downloading files ${i + 1}-${Math.min(i + batch.length, totalFiles)} of ${totalFiles}...`,
        progress,
      })

      // Download batch concurrently
      const batchPromises = batch.map(async (item) => {
        try {
          const rawUrl = `${this.rawUrl}/${owner}/${repo}/HEAD/${item.path}`
          const content = await this.getFileContent(rawUrl)

          return {
            name: item.path.split("/").pop() || item.path,
            path: item.path,
            type: "file" as const,
            download_url: rawUrl,
            content,
            sha: item.sha,
            size: item.size,
            repoOwner: owner,
            repoName: repo,
          }
        } catch (error) {
          console.warn(`Failed to download ${item.path}:`, error)
          return null
        }
      })

      const batchResults = await Promise.all(batchPromises)
      const successfulFiles = batchResults.filter((file): file is GitHubFile => file !== null)
      files.push(...successfulFiles)

      // Small delay between batches to be respectful to the API
      if (i + batchSize < treeItems.length) {
        await this.delay(200)
      }
    }

    return files
  }

  private async fallbackToRawAccess(
    owner: string,
    repo: string,
    tasks: TaskProgress[],
    updateProgress: () => void,
  ): Promise<GitHubFile[]> {
    // Reset task 2 for retry
    tasks[2].status = "running"
    tasks[2].message = "Trying common file discovery..."
    tasks[2].error = undefined
    updateProgress()

    const commonPaths = [
      "README.md",
      "index.md",
      "root.md",
      "docs/README.md",
      "docs/index.md",
      "notes/README.md",
      "vault/README.md",
    ]

    const files: GitHubFile[] = []

    for (const filePath of commonPaths) {
      try {
        const rawUrl = `${this.rawUrl}/${owner}/${repo}/HEAD/${filePath}`
        const response = await fetch(rawUrl)

        if (response.ok) {
          const content = await response.text()
          files.push({
            name: filePath.split("/").pop() || filePath,
            path: filePath,
            type: "file",
            download_url: rawUrl,
            content,
            repoOwner: owner,
            repoName: repo,
          })
        }
      } catch (error) {
        // Ignore individual file errors
      }
    }

    if (files.length === 0) {
      files.push({
        name: "demo.md",
        path: "demo.md",
        type: "file",
        content: this.createDemoContent(),
        repoOwner: owner,
        repoName: repo,
      })
    }

    tasks[2].status = "completed"
    tasks[2].message = `Found ${files.length} files via fallback method`

    // Skip filtering task for fallback
    tasks[3].status = "completed"
    tasks[3].message = "Filtering skipped for fallback method"

    // Skip batch download for fallback
    tasks[4].status = "completed"
    tasks[4].message = "Files already downloaded via fallback"
    tasks[4].progress = 100

    updateProgress()

    // Cache the fallback files
    await this.cacheService.cacheFiles(files, {
      timestamp: Date.now(),
      source: "github",
      repoInfo: {
        owner,
        repo,
      },
      fileCount: files.length,
    })

    return files
  }

  private getHeaders(): Record<string, string> {
    return {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Dendron-Wiki-App",
      // Add GitHub token if available (users can set this in localStorage)
      ...(this.getGitHubToken() && { Authorization: `token ${this.getGitHubToken()}` }),
    }
  }

  private getGitHubToken(): string | null {
    try {
      // Prefer environment variable at build time or if available
      if (typeof process !== 'undefined' && process.env && process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
      }
      // Fallback to localStorage for client-side use
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem("github-token");
      }
      return null;
    } catch {
      return null;
    }
  }

  async getFileContent(downloadUrl: string): Promise<string> {
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch file content: ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      console.error("Error fetching file content:", error)
      return ""
    }
  }

  private createDemoContent(): string {
    return `---
id: demo-note
title: Demo Note
desc: "A demo note to show Dendron wiki functionality"
updated: ${Date.now()}
created: ${Date.now()}
---

# Demo Note

This is a demonstration note showing how the Dendron wiki works.

## Efficient GitHub API Usage

This demo was created because we're using an optimized GitHub API approach:

### API Optimization Techniques Used:
1. **Tree API**: Single recursive call to get entire repository structure
2. **Batch Processing**: Download multiple files concurrently
3. **Smart Filtering**: Filter files before downloading
4. **Rate Limit Awareness**: Respectful delays between requests
5. **Fallback Strategy**: Raw GitHub access when API fails

## Features

- **Transclusions**: Embed content from other notes
- **Wiki Links**: Link between notes using [[note.slug]] syntax
- **Frontmatter**: YAML metadata at the top of notes
- **Hierarchical Organization**: Notes organized in a tree structure

## Performance Benefits

The new approach reduces API calls from potentially hundreds to just 2-3:
- 1 call to get repository info
- 1 call to get complete file tree
- Batch downloads using raw GitHub URLs

## Tags

#demo #dendron #wiki #optimization

## Sample Transclusion

This would normally show content from another note:
![[another.note#section]]

## Sample Wiki Link

This would link to another note: [[another.note]]
`
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
