"use client"

import type { RepoInfo } from "../types"
import { Menu, X } from "lucide-react";
import styles from "./Header.module.css"

interface HeaderProps {
  searchTerm: string
  onSearchChange: (term: string) => void
  repoInfo: RepoInfo | null
  onBackToProgress?: () => void
  cacheInfo?: { timestamp?: number; source?: string }
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export default function Header({
  searchTerm,
  onSearchChange,
  repoInfo,
  onBackToProgress,
  cacheInfo,
  sidebarOpen,
  onToggleSidebar,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.leftSection}>
          <button onClick={onToggleSidebar} className={styles.hamburgerButton}>
            {sidebarOpen ? <X /> : <Menu />}
          </button>
          <div className={styles.brand}>
            <h1 className={styles.title}>📚 Dendron Wiki</h1>
            {repoInfo && (
              <span className={styles.repo}>
                {repoInfo.source === "github" ? `${repoInfo.owner}/${repoInfo.repo}` : "Local Repository"}
                {cacheInfo?.timestamp && (
                  <span
                    className={styles.cacheInfo}
                    title={`Data loaded from cache created on ${new Date(cacheInfo.timestamp).toLocaleString()}`}
                  >
                    (cached)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.searchInput}
          />
          <span className={styles.searchIcon}>🔍</span>
        </div>

        {onBackToProgress && (
          <button onClick={onBackToProgress} className={styles.backButton}>
            ← Back to Progress
          </button>
        )}
      </div>
    </header>
  )
}
