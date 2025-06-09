export interface CacheMetadata {
  timestamp: number
  source: "github" | "local"
  repoInfo?: {
    owner: string
    repo: string
    lastCommitSha?: string
    lastCommitTime?: number
  }
  fileCount: number
}

export class CacheService {
  private dbName = "dendron-wiki-cache"
  private dbVersion = 1
  private db: IDBDatabase | null = null
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  async init(): Promise<void> {
    if (!this.isBrowser) {
      console.log("CacheService: Not in a browser environment, IndexedDB operations disabled.");
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = (event) => {
        console.error("IndexedDB error:", event)
        reject(new Error("Failed to open IndexedDB"))
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object stores
        if (!db.objectStoreNames.contains("files")) {
          db.createObjectStore("files", { keyPath: "path" })
        }

        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "slug" })
        }
      }
    })
  }

  async cacheFiles(files: any[], metadata: CacheMetadata): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["files", "metadata"], "readwrite")
        const fileStore = transaction.objectStore("files")
        const metadataStore = transaction.objectStore("metadata")

        // Store metadata
        metadataStore.put({
          id:
            metadata.source === "github"
              ? `github-${metadata.repoInfo?.owner}-${metadata.repoInfo?.repo}`
              : "local-files",
          ...metadata,
        })

        // Store files
        files.forEach((file) => {
          fileStore.put(file)
        })

        transaction.oncomplete = () => {
          resolve()
        }

        transaction.onerror = (event) => {
          reject(new Error("Transaction failed"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  async cacheNotes(notes: any[]): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["notes"], "readwrite")
        const noteStore = transaction.objectStore("notes")

        // Clear existing notes
        noteStore.clear()

        // Store notes
        notes.forEach((note) => {
          noteStore.put(note)
        })

        transaction.oncomplete = () => {
          resolve()
        }

        transaction.onerror = (event) => {
          reject(new Error("Transaction failed"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  // Fix the getFiles method to properly retrieve files from cache
  async getFiles(source: "github" | "local", owner?: string, repo?: string): Promise<any[] | null> {
    if (!this.isBrowser) {
      return Promise.resolve(null);
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["files", "metadata"], "readonly")
        const metadataStore = transaction.objectStore("metadata")
        const fileStore = transaction.objectStore("files")

        // Get metadata to check if cache exists
        const metadataKey = source === "github" ? `github-${owner}-${repo}` : "local-files"
        const metadataRequest = metadataStore.get(metadataKey)

        metadataRequest.onsuccess = () => {
          const metadata = metadataRequest.result
          if (!metadata) {
            console.log(`No cache metadata found for ${metadataKey}`)
            resolve(null) // No cache found
            return
          }

          console.log(`Found cache metadata for ${metadataKey}:`, {
            timestamp: new Date(metadata.timestamp).toLocaleString(),
            fileCount: metadata.fileCount,
          })

          // Get all files
          const files: any[] = []
          const filesRequest = fileStore.openCursor()

          filesRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result
            if (cursor) {
              // For GitHub, we need to check if the file belongs to the specified repo
              if (source === "github") {
                if (cursor.value.repoOwner === owner && cursor.value.repoName === repo) {
                  files.push(cursor.value)
                }
              } else {
                // For local files, we include all files
                files.push(cursor.value)
              }
              cursor.continue()
            } else {
              console.log(`Retrieved ${files.length} files from cache`)
              resolve(files.length > 0 ? files : null)
            }
          }

          filesRequest.onerror = (event) => {
            console.error("Error retrieving files from cache:", event)
            reject(new Error("Failed to retrieve files from cache"))
          }
        }

        metadataRequest.onerror = (event) => {
          console.error("Error retrieving metadata from cache:", event)
          reject(new Error("Failed to retrieve metadata from cache"))
        }
      } catch (error) {
        console.error("Error in getFiles:", error)
        reject(error)
      }
    })
  }

  async getNotes(): Promise<any[] | null> {
    if (!this.isBrowser) {
      return Promise.resolve(null);
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["notes"], "readonly")
        const noteStore = transaction.objectStore("notes")

        // Get all notes
        const notesRequest = noteStore.getAll()

        notesRequest.onsuccess = () => {
          const notes = notesRequest.result
          resolve(notes.length > 0 ? notes : null)
        }

        notesRequest.onerror = () => {
          reject(new Error("Failed to retrieve notes from cache"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  async getCacheMetadata(source: "github" | "local", owner?: string, repo?: string): Promise<CacheMetadata | null> {
    if (!this.isBrowser) {
      return Promise.resolve(null);
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["metadata"], "readonly")
        const metadataStore = transaction.objectStore("metadata")

        // Get metadata
        const metadataKey = source === "github" ? `github-${owner}-${repo}` : "local-files"
        const metadataRequest = metadataStore.get(metadataKey)

        metadataRequest.onsuccess = () => {
          const metadata = metadataRequest.result
          resolve(metadata || null)
        }

        metadataRequest.onerror = () => {
          reject(new Error("Failed to retrieve metadata from cache"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  async clearCache(): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(["files", "metadata", "notes"], "readwrite")

        transaction.objectStore("files").clear()
        transaction.objectStore("metadata").clear()
        transaction.objectStore("notes").clear()

        transaction.oncomplete = () => {
          resolve()
        }

        transaction.onerror = () => {
          reject(new Error("Failed to clear cache"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}
