"use client"

import type { ReactNode } from "react"
import Sidebar from "./Sidebar"
import Header from "./Header"
import type { DendronNote, RepoInfo } from "../types"
import styles from "./WikiLayout.module.css"
import { useState } from "react"
import { CacheService } from "../services/CacheService"

interface WikiLayoutProps {
  notes: DendronNote[]
  currentNote: DendronNote | null
  onNoteSelect: (note: DendronNote) => void
  searchTerm: string
  onSearchChange: (term: string) => void
  repoInfo: RepoInfo | null
  onBackToProgress?: () => void
  cacheInfo?: { timestamp?: number; source?: string }
  children: ReactNode
}

export default function WikiLayout({
  notes,
  currentNote,
  onNoteSelect,
  searchTerm,
  onSearchChange,
  repoInfo,
  onBackToProgress,
  cacheInfo,
  children,
}: WikiLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  // Add a cache info display and refresh button in the header
  const handleRefreshData = async () => {
    // Clear cache and reload
    const cacheService = new CacheService()
    await cacheService.init()
    await cacheService.clearCache()
    window.location.reload()
  }

  return (
    <div className={styles.layout}>
      <Header
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        repoInfo={repoInfo}
        onBackToProgress={onBackToProgress}
        cacheInfo={cacheInfo}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />
      <div className={styles.main}>
        <Sidebar
          notes={notes}
          currentNote={currentNote}
          onNoteSelect={onNoteSelect}
          collapsed={!sidebarOpen}
          onToggle={handleToggleSidebar}
        />
        <main className={`${styles.content} ${!sidebarOpen ? styles.expanded : ""}`}>{children}</main>
      </div>
    </div>
  )
}
