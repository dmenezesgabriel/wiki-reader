"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import styles from "./page.module.css"

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState("")
  const [githubToken, setGithubToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loadMethod, setLoadMethod] = useState<"github" | "local">("github")
  const router = useRouter()
  const [selectedDirectory, setSelectedDirectory] = useState<any>(null)
  const [isFileSystemAccessSupported, setIsFileSystemAccessSupported] = useState(false)

  // Check File System Access API support on component mount
  useEffect(() => {
    setIsFileSystemAccessSupported("showDirectoryPicker" in window)
  }, [])

  const handleSelectDirectory = async () => {
    if (!isFileSystemAccessSupported) {
      setError("File System Access API is not supported in this browser")
      return
    }

    try {
      // @ts-ignore - TypeScript doesn't know about showDirectoryPicker yet
      const dirHandle = await window.showDirectoryPicker({
        id: "dendron-wiki-vault",
        mode: "read",
        startIn: "documents",
      })

      setSelectedDirectory(dirHandle)
      setError("") // Clear any previous errors
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled the picker
        return
      }
      setError("Failed to select directory: " + (err instanceof Error ? err.message : "Unknown error"))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      if (loadMethod === "github") {
        // Validate GitHub URL
        const urlPattern = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/.*)?$/
        const match = repoUrl.match(urlPattern)

        if (!match) {
          throw new Error("Please enter a valid GitHub repository URL")
        }

        const [, owner, repo] = match

        // Store repository info and token in localStorage
        localStorage.setItem("dendron-repo", JSON.stringify({ owner, repo, url: repoUrl, source: "github" }))

        if (githubToken.trim()) {
          localStorage.setItem("github-token", githubToken.trim())
        } else {
          localStorage.removeItem("github-token")
        }
      } else if (loadMethod === "local") {
        // Check if directory was selected
        if (!selectedDirectory) {
          throw new Error("Please select a directory first")
        }

        // Store directory handle reference
        localStorage.setItem(
          "dendron-repo",
          JSON.stringify({
            name: selectedDirectory.name,
            source: "local",
            directorySelected: true,
          }),
        )

        // Store the directory handle for the wiki page to use
        // Note: We can't serialize the handle, so we'll pass it through a different mechanism
        sessionStorage.setItem("directory-handle-available", "true")

        // Store the handle in a global variable that the wiki page can access
        // @ts-ignore
        window.selectedDirectoryHandle = selectedDirectory
      }

      // Navigate to wiki
      router.push("/wiki")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Dendron Wiki</h1>
        <p className={styles.subtitle}>Transform your Dendron vault into a beautiful, searchable knowledge base</p>
      </div>

      <div className={styles.formContainer}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${loadMethod === "github" ? styles.activeTab : ""}`}
            onClick={() => setLoadMethod("github")}
          >
            <span className={styles.tabIcon}>🌐</span>
            GitHub Repository
          </button>
          <button
            className={`${styles.tab} ${loadMethod === "local" ? styles.activeTab : ""}`}
            onClick={() => setLoadMethod("local")}
          >
            <span className={styles.tabIcon}>💻</span>
            Local Files
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {loadMethod === "github" && (
            <div className={styles.inputGroup}>
              <label htmlFor="repoUrl" className={styles.label}>
                GitHub Repository URL
              </label>
              <input
                id="repoUrl"
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/dendron-vault"
                className={styles.input}
                required={loadMethod === "github"}
              />
            </div>
          )}

          {loadMethod === "local" && (
            <div className={styles.inputGroup}>
              <label className={styles.label}>Select Folder</label>
              <div className={styles.directoryPickerWrapper}>
                <button
                  type="button"
                  onClick={handleSelectDirectory}
                  className={styles.directoryPickerButton}
                  disabled={!isFileSystemAccessSupported}
                >
                  <span className={styles.folderIcon}>📁</span>
                  {selectedDirectory ? (
                    <div className={styles.selectedDirectory}>
                      <strong>{selectedDirectory.name}</strong>
                      <span className={styles.directoryHint}>Directory selected</span>
                    </div>
                  ) : (
                    <div className={styles.directoryPrompt}>
                      <strong>Choose Dendron Vault Folder</strong>
                      <span className={styles.directoryHint}>
                        {isFileSystemAccessSupported
                          ? "Click to open your file system and select your vault folder"
                          : "File System Access API not supported in this browser"}
                      </span>
                    </div>
                  )}
                </button>

                {!isFileSystemAccessSupported && (
                  <div className={styles.browserSupport}>
                    <p>⚠️ Your browser doesn't support the File System Access API.</p>
                    <p>Please use Chrome, Edge, or another Chromium-based browser for local file access.</p>
                    <details className={styles.supportDetails}>
                      <summary>Supported browsers</summary>
                      <ul>
                        <li>✅ Google Chrome 86+</li>
                        <li>✅ Microsoft Edge 86+</li>
                        <li>✅ Opera 72+</li>
                        <li>❌ Firefox (not yet supported)</li>
                        <li>❌ Safari (not yet supported)</li>
                      </ul>
                    </details>
                  </div>
                )}
              </div>
            </div>
          )}

          {loadMethod === "github" && (
            <div className={styles.advancedToggle}>
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className={styles.toggleButton}>
                ⚙️ Advanced Options {showAdvanced ? "▼" : "▶"}
              </button>
            </div>
          )}

          {loadMethod === "github" && showAdvanced && (
            <div className={styles.advancedOptions}>
              <div className={styles.inputGroup}>
                <label htmlFor="githubToken" className={styles.label}>
                  GitHub Personal Access Token (Optional)
                </label>
                <input
                  id="githubToken"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className={styles.input}
                />
                <div className={styles.inputHint}>
                  Provides higher rate limits (5000 requests/hour vs 60).
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    Create token
                  </a>
                </div>
              </div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? "Loading..." : "Load Knowledge Base"}
          </button>
        </form>

        <div className={styles.features}>
          <h2>🚀 Load From Anywhere</h2>
          <ul>
            <li>
              🌐 <strong>GitHub Repository</strong>: Load directly from any public GitHub repo
            </li>
            <li>
              💻 <strong>Local Files</strong>: Use your own files without uploading anything
            </li>
            <li>
              🔒 <strong>Privacy First</strong>: All processing happens in your browser
            </li>
            <li>
              🔄 <strong>Offline Support</strong>: Work with your notes without an internet connection
            </li>
          </ul>

          <h2>✨ Features</h2>
          <ul>
            <li>📝 Full markdown rendering with Dendron syntax</li>
            <li>🔗 Automatic backlink detection and navigation</li>
            <li>📋 Transclusion support for embedding content</li>
            <li>🏷️ Frontmatter processing and metadata display</li>
            <li>🔍 Real-time search across all notes</li>
            <li>🌳 Hierarchical note organization</li>
            <li>📱 Responsive design for all devices</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
