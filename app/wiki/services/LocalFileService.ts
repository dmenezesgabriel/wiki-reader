export interface LocalFile {
  name: string
  path: string
  type: "file" | "dir"
  content?: string
  size?: number
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

export class LocalFileService {
  async getLocalFiles(onProgress?: ProgressCallback): Promise<LocalFile[]> {
    const tasks: TaskProgress[] = [
      { id: "check-directory", name: "Accessing directory", status: "pending" },
      { id: "read-files", name: "Reading file contents", status: "pending", progress: 0 },
      { id: "process-files", name: "Processing markdown files", status: "pending" },
    ]

    const updateProgress = () => {
      onProgress?.(tasks)
    }

    try {
      // Task 1: Check directory access
      tasks[0].status = "running"
      tasks[0].message = "Checking directory access method..."
      updateProgress()

      await this.delay(300)

      // Check if we have a directory handle from the main page
      // @ts-ignore
      const dirHandle = window.selectedDirectoryHandle

      if (dirHandle) {
        tasks[0].status = "completed"
        tasks[0].message = `Accessing directory: ${dirHandle.name}`
        updateProgress()

        // Task 2: Read files using directory handle
        tasks[1].status = "running"
        tasks[1].message = "Reading directory contents..."
        updateProgress()

        const files = await this.getFilesFromDirectoryHandle(dirHandle, tasks, updateProgress)

        tasks[1].status = "completed"
        tasks[1].message = `Read ${files.length} files from directory`
        tasks[1].progress = 100
        updateProgress()

        // Task 3: Process files
        tasks[2].status = "running"
        tasks[2].message = "Processing markdown files..."
        updateProgress()

        await this.delay(300)

        const markdownFiles = files.filter((file) => file.name.endsWith(".md"))

        tasks[2].status = "completed"
        tasks[2].message = `Found ${markdownFiles.length} markdown files`
        updateProgress()

        return markdownFiles
      } else if ("showDirectoryPicker" in window) {
        // Fallback: prompt user to select directory again
        tasks[0].status = "running"
        tasks[0].message = "Prompting for directory selection..."
        updateProgress()

        try {
          // @ts-ignore
          const newDirHandle = await window.showDirectoryPicker({
            id: "dendron-wiki",
            mode: "read",
            startIn: "documents",
          })

          tasks[0].status = "completed"
          tasks[0].message = `Selected directory: ${newDirHandle.name}`
          updateProgress()

          // Continue with the selected directory
          tasks[1].status = "running"
          tasks[1].message = "Reading directory contents..."
          updateProgress()

          const files = await this.getFilesFromDirectoryHandle(newDirHandle, tasks, updateProgress)

          tasks[1].status = "completed"
          tasks[1].message = `Read ${files.length} files from directory`
          tasks[1].progress = 100
          updateProgress()

          tasks[2].status = "running"
          tasks[2].message = "Processing markdown files..."
          updateProgress()

          await this.delay(300)

          const markdownFiles = files.filter((file) => file.name.endsWith(".md"))

          tasks[2].status = "completed"
          tasks[2].message = `Found ${markdownFiles.length} markdown files`
          updateProgress()

          return markdownFiles
        } catch (error) {
          throw new Error("Directory selection cancelled or failed")
        }
      } else {
        // Browser doesn't support File System Access API
        tasks[0].status = "error"
        tasks[0].error = "File System Access API not supported"
        tasks[0].message = "Creating demo content instead"
        updateProgress()

        await this.delay(500)

        // Skip task 2
        tasks[1].status = "completed"
        tasks[1].message = "File reading skipped for demo"
        tasks[1].progress = 100
        updateProgress()

        // Task 3: Create demo content
        tasks[2].status = "running"
        tasks[2].message = "Creating demo content..."
        updateProgress()

        await this.delay(300)

        const demoFiles = this.createDemoFiles()

        tasks[2].status = "completed"
        tasks[2].message = `Created ${demoFiles.length} demo files`
        updateProgress()

        return demoFiles
      }
    } catch (error) {
      // Mark all remaining tasks as error
      tasks.forEach((task) => {
        if (task.status === "pending" || task.status === "running") {
          task.status = "error"
          task.error = error instanceof Error ? error.message : "Unknown error"
        }
      })
      updateProgress()
      throw error
    }
  }

  private async getFilesFromDirectoryHandle(
    dirHandle: any,
    tasks: TaskProgress[],
    updateProgress: () => void,
    path = "",
  ): Promise<LocalFile[]> {
    const files: LocalFile[] = []

    // Directories to skip
    const skipDirectories = new Set([
      ".git",
      "node_modules",
      ".vscode",
      ".idea",
      "dist",
      "build",
      ".next",
      ".dendron",
      "__pycache__",
      ".DS_Store",
    ])

    // Files to skip
    const skipFiles = new Set([
      ".dendron.port",
      ".dendron.ws",
      ".dendron.cache.json",
      ".gitignore",
      ".gitattributes",
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "tsconfig.json",
      ".DS_Store",
      "Thumbs.db",
    ])

    // Get all entries in the directory
    for await (const [name, handle] of dirHandle.entries()) {
      const filePath = path ? `${path}/${name}` : name

      if (handle.kind === "file") {
        // Skip unwanted files
        if (skipFiles.has(name) || name.startsWith(".")) {
          continue
        }

        // Only process markdown files to avoid loading large binary files
        if (name.endsWith(".md")) {
          tasks[1].message = `Reading ${filePath}...`
          updateProgress()

          try {
            const file = await handle.getFile()
            const content = await file.text()

            files.push({
              name,
              path: filePath,
              type: "file",
              content,
              size: file.size,
            })
          } catch (error) {
            console.warn(`Failed to read file ${filePath}:`, error)
          }
        }
      } else if (handle.kind === "directory") {
        // Skip unwanted directories
        if (skipDirectories.has(name) || name.startsWith(".")) {
          continue
        }

        // Recursively process subdirectories
        tasks[1].message = `Exploring directory ${filePath}...`
        updateProgress()

        const subFiles = await this.getFilesFromDirectoryHandle(handle, tasks, updateProgress, filePath)
        files.push(...subFiles)
      }
    }

    return files
  }

  private createDemoFiles(): LocalFile[] {
    return [
      {
        name: "root.md",
        path: "root.md",
        type: "file",
        content: `---
id: root
title: Root
desc: "Root of the local demo vault"
updated: ${Date.now()}
created: ${Date.now()}
---

# Local Dendron Demo

Welcome to the local Dendron demo! This is a demonstration of how the Dendron wiki works with local files.

## Features

- **Local File Access**: Load files directly from your computer
- **No Uploads**: Everything stays on your device
- **Offline Support**: Works without an internet connection
- **Privacy First**: No data is sent to any servers

## Navigation

- [[welcome]]
- [[features]]
- [[transclusion-demo]]

#local #demo #dendron
`,
      },
      {
        name: "welcome.md",
        path: "welcome.md",
        type: "file",
        content: `---
id: welcome
title: Welcome
desc: "Welcome to the local Dendron demo"
updated: ${Date.now()}
created: ${Date.now()}
---

# Welcome

This is a welcome page for the local Dendron demo.

## Getting Started

To use your own files:
1. Go back to the home page
2. Select "Local Files" tab
3. Choose your Dendron vault folder
4. Click "Load Knowledge Base"

## How It Works

When you select a folder, the app reads your markdown files directly in the browser.
No data is uploaded to any server - everything stays on your device.

#welcome #local
`,
      },
      {
        name: "features.md",
        path: "features.md",
        type: "file",
        content: `---
id: features
title: Features
desc: "Features of the local Dendron demo"
updated: ${Date.now()}
created: ${Date.now()}
---

# Features

## Local File Support

- Read files directly from your computer
- No uploads to any servers
- Works offline
- Privacy-focused

## Markdown Support

- **Bold text**
- *Italic text*
- ~~Strikethrough~~
- \`Inline code\`
- [Links](https://example.com)
- Lists (like this one!)

## Code Blocks

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Tables

| Feature | Supported |
|---------|-----------|
| Local files | ✅ |
| Transclusion | ✅ |
| Wiki links | ✅ |
| Backlinks | ✅ |

#features
`,
      },
      {
        name: "transclusion-demo.md",
        path: "transclusion-demo.md",
        type: "file",
        content: `---
id: transclusion-demo
title: Transclusion Demo
desc: "Demonstration of transclusion in Dendron"
updated: ${Date.now()}
created: ${Date.now()}
---

# Transclusion Demo

This page demonstrates how transclusion works in Dendron.

## Welcome Section

![[welcome#getting-started]]

## Features Section

![[features#markdown-support]]

## Root Section

![[root#features]]

#transclusion #demo
`,
      },
    ]
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
