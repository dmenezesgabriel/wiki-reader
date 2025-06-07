"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import WikiLayout from "./components/WikiLayout"
import MarkdownRenderer from "./components/MarkdownRenderer"
import TaskProgress from "./components/TaskProgress"
import { GitHubService, type TaskProgress as TaskProgressType } from "./services/GitHubService"
import { LocalFileService } from "./services/LocalFileService"
import { DendronParser } from "./services/DendronParser"
import { CacheService } from "./services/CacheService"
import type { DendronNote, RepoInfo } from "./types"
import styles from "./wiki.module.css"

export default function WikiPage() {
  const [notes, setNotes] = useState<DendronNote[]>([])
  const [currentNote, setCurrentNote] = useState<DendronNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingComplete, setLoadingComplete] = useState(false)
  const [error, setError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null)
  const [tasks, setTasks] = useState<TaskProgressType[]>([])
  const [showWiki, setShowWiki] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{ timestamp?: number; source?: string }>({})
  const router = useRouter()

  useEffect(() => {
    const loadRepository = async () => {
      try {
        // Get repository info from localStorage
        const storedRepo = localStorage.getItem("dendron-repo")
        if (!storedRepo) {
          router.push("/")
          return
        }

        const repo: RepoInfo = JSON.parse(storedRepo)
        setRepoInfo(repo)

        // Determine source and load files accordingly
        if (repo.source === "github") {
          await loadFromGitHub(repo)
        } else if (repo.source === "local") {
          await loadFromLocal()
        } else {
          throw new Error("Unknown repository source")
        }

        // Mark all tasks as completed
        setTasks((prevTasks) =>
          prevTasks.map((task) => ({
            ...task,
            status: task.status === "running" ? "completed" : task.status,
          })),
        )

        // Set loading complete but don't navigate automatically
        setLoadingComplete(true)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load repository"
        setError(errorMessage)
        console.error("Repository loading error:", err)

        // Mark all running tasks as error
        setTasks((prevTasks) =>
          prevTasks.map((task) => ({
            ...task,
            status: task.status === "running" ? "error" : task.status,
            error: task.status === "running" ? errorMessage : task.error,
          })),
        )
      } finally {
        setLoading(false)
      }
    }

    const loadFromGitHub = async (repo: any) => {
      // Fetch repository contents with progress tracking
      const githubService = new GitHubService()
      const files = await githubService.getRepositoryFiles(repo.owner, repo.repo, (progressTasks) => {
        setTasks([...progressTasks])
      })

      // Check if we're using cached data
      const cacheService = new CacheService()
      await cacheService.init()
      const cacheMetadata = await cacheService.getCacheMetadata("github", repo.owner, repo.repo)
      if (cacheMetadata) {
        setCacheInfo({
          timestamp: cacheMetadata.timestamp,
          source: "GitHub API",
        })
      }

      // Parse Dendron notes with progress tracking
      const dendronParser = new DendronParser()
      const parsedNotes = await dendronParser.parseNotes(files, githubService, repo, (progressTasks) => {
        setTasks((prevTasks) => {
          // Find tasks that aren't already in the list
          const newTasks = progressTasks.filter(
            (newTask) => !prevTasks.some((existingTask) => existingTask.id === newTask.id),
          )
          return [...prevTasks, ...newTasks]
        })
      })

      setNotes(parsedNotes)

      // Set initial note (root or first note)
      const rootNote = parsedNotes.find((note) => note.slug === "root") || parsedNotes[0]
      if (rootNote) {
        setCurrentNote(rootNote)
      }
    }

    const loadFromLocal = async () => {
      // Load local files with progress tracking
      const localFileService = new LocalFileService()
      const files = await localFileService.getLocalFiles((progressTasks) => {
        setTasks([...progressTasks])
      })

      // Parse Dendron notes
      const dendronParser = new DendronParser()
      const parsedNotes = await dendronParser.parseNotes(files, null, null, (progressTasks) => {
        setTasks((prevTasks) => {
          // Find tasks that aren't already in the list
          const newTasks = progressTasks.filter(
            (newTask) => !prevTasks.some((existingTask) => existingTask.id === newTask.id),
          )
          return [...prevTasks, ...newTasks]
        })
      })

      setNotes(parsedNotes)

      // Set initial note (root or first note)
      const rootNote = parsedNotes.find((note) => note.slug === "root") || parsedNotes[0]
      if (rootNote) {
        setCurrentNote(rootNote)
      }
    }

    loadRepository()
  }, [router])

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleRetry = async () => {
    setError("")
    setLoading(true)
    setLoadingComplete(false)
    setShowWiki(false)
    setTasks([])

    // Clear cache if retry is requested
    const cacheService = new CacheService()
    await cacheService.init()
    await cacheService.clearCache()

    // Trigger reload
    window.location.reload()
  }

  const handleOpenWiki = () => {
    setShowWiki(true)
  }

  const handleBackToProgress = () => {
    setShowWiki(false)
  }

  // Add a cache control button to the UI
  const handleClearCache = async () => {
    try {
      const cacheService = new CacheService()
      await cacheService.init()
      await cacheService.clearCache()
      alert("Cache cleared successfully. Reload the page to fetch fresh data.")
    } catch (error) {
      console.error("Failed to clear cache:", error)
      alert("Failed to clear cache: " + (error instanceof Error ? error.message : "Unknown error"))
    }
  }

  // Show wiki interface if user clicked "Open Wiki"
  if (showWiki && !loading && !error) {
    return (
      <WikiLayout
        notes={filteredNotes}
        currentNote={currentNote}
        onNoteSelect={setCurrentNote}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        repoInfo={repoInfo}
        onBackToProgress={handleBackToProgress}
        cacheInfo={cacheInfo}
      >
        {currentNote && <MarkdownRenderer note={currentNote} notes={notes} onNoteSelect={setCurrentNote} />}
      </WikiLayout>
    )
  }

  // Show loading progress
  if (loading || loadingComplete || error) {
    const allTasksCompleted = tasks.length > 0 && tasks.every((task) => task.status === "completed")
    const hasErrors = tasks.some((task) => task.status === "error") || error

    return (
      <div className={styles.loading}>
        <div className={styles.loadingHeader}>
          <h2>{loading ? "Loading Knowledge Base" : hasErrors ? "Loading Failed" : "Loading Complete"}</h2>
          {repoInfo && (
            <p className={styles.repoName}>
              {repoInfo.source === "github" ? `${repoInfo.owner}/${repoInfo.repo}` : "Local Repository"}
            </p>
          )}
        </div>

        <TaskProgress tasks={tasks} showAll={!loading} />

        {error && (
          <div className={styles.errorMessage}>
            <h3>Error Details</h3>
            <pre>{error}</pre>
          </div>
        )}

        {/* Show action buttons when loading is complete */}
        {!loading && (
          <div className={styles.actionButtons}>
            {allTasksCompleted && !hasErrors && (
              <button onClick={handleOpenWiki} className={styles.openWikiButton}>
                🚀 Open Knowledge Base ({notes.length} notes loaded)
              </button>
            )}

            <div className={styles.secondaryActions}>
              <button onClick={handleRetry} className={styles.retryButton}>
                🔄 Try Again
              </button>
              <button onClick={() => router.push("/")} className={styles.backButton}>
                ← Go Back
              </button>
              <button onClick={handleClearCache} className={styles.clearCacheButton}>
                🗑️ Clear Cache
              </button>
            </div>
          </div>
        )}

        {/* Show summary when complete */}
        {loadingComplete && !error && (
          <div className={styles.summary}>
            <h3>📊 Loading Summary</h3>
            <div className={styles.summaryStats}>
              <div className={styles.stat}>
                <span className={styles.statNumber}>{notes.length}</span>
                <span className={styles.statLabel}>Notes Loaded</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>{tasks.filter((t) => t.status === "completed").length}</span>
                <span className={styles.statLabel}>Tasks Completed</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statNumber}>
                  {notes.reduce((acc, note) => acc + Object.keys(note.frontmatter).length, 0)}
                </span>
                <span className={styles.statLabel}>Metadata Fields</span>
              </div>
            </div>

            {notes.length > 0 && (
              <div className={styles.notePreview}>
                <h4>📝 Available Notes</h4>
                <div className={styles.noteList}>
                  {notes.slice(0, 5).map((note) => (
                    <div key={note.slug} className={styles.noteItem}>
                      <span className={styles.noteTitle}>{note.title}</span>
                      <span className={styles.noteSlug}>{note.slug}</span>
                    </div>
                  ))}
                  {notes.length > 5 && (
                    <div className={styles.noteItem}>
                      <span className={styles.noteMore}>... and {notes.length - 5} more notes</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {repoInfo && (hasErrors || loadingComplete) && (
          <div className={styles.repoInfo}>
            <h3>📁 Repository Info</h3>
            {repoInfo.source === "github" ? (
              <>
                <p>
                  <strong>Source:</strong> GitHub Repository
                </p>
                <p>
                  <strong>Owner:</strong> {repoInfo.owner}
                </p>
                <p>
                  <strong>Repository:</strong> {repoInfo.repo}
                </p>
                <p>
                  <strong>URL:</strong>{" "}
                  <a href={repoInfo.url} target="_blank" rel="noopener noreferrer">
                    {repoInfo.url}
                  </a>
                </p>
                {cacheInfo.timestamp && (
                  <p>
                    <strong>Cache:</strong> Using data from {new Date(cacheInfo.timestamp).toLocaleString()}
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  <strong>Source:</strong> Local Files
                </p>
                <p>
                  <strong>Markdown Files:</strong> {repoInfo.fileCount || notes.length}
                </p>
                {repoInfo.totalFiles && repoInfo.totalFiles > (repoInfo.fileCount || 0) && (
                  <p>
                    <strong>Total Files:</strong> {repoInfo.totalFiles} (filtered to {repoInfo.fileCount} markdown
                    files)
                  </p>
                )}
                <p>
                  <strong>Storage:</strong> Browser-only (no uploads)
                </p>
                <p>
                  <strong>Filtered:</strong> Excluded .git, node_modules, and Dendron system files
                </p>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
