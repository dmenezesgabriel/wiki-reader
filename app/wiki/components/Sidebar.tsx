"use client"
import { useState, useMemo } from "react"
import type React from "react"

import type { DendronNote, TreeNode } from "../types"
import styles from "./Sidebar.module.css"

interface SidebarProps {
  notes: DendronNote[]
  currentNote: DendronNote | null
  onNoteSelect: (note: DendronNote) => void
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ notes, currentNote, onNoteSelect, collapsed, onToggle }: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]))

  // Build hierarchical tree structure from flat notes array
  const treeStructure = useMemo(() => {
    const root: TreeNode = {
      name: "root",
      fullPath: "",
      type: "folder",
      children: [],
      isExpanded: true,
      level: 0,
    }

    // Sort notes by slug for consistent ordering
    const sortedNotes = [...notes].sort((a, b) => a.slug.localeCompare(b.slug))

    sortedNotes.forEach((note) => {
      const parts = note.slug.split(".")
      let currentNode = root

      // Navigate/create the folder structure
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const isLastPart = i === parts.length - 1
        const fullPath = parts.slice(0, i + 1).join(".")

        let existingChild = currentNode.children.find((child) => child.name === part)

        if (!existingChild) {
          existingChild = {
            name: part,
            fullPath,
            type: isLastPart ? "file" : "folder",
            children: [],
            level: i + 1,
            ...(isLastPart && { note }),
          }
          currentNode.children.push(existingChild)
        }

        // If this is the last part, ensure it's marked as a file with the note
        if (isLastPart) {
          existingChild.type = "file"
          existingChild.note = note
        }

        currentNode = existingChild
      }
    })

    // Sort children: folders first, then files, both alphabetically
    const sortChildren = (node: TreeNode) => {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      node.children.forEach(sortChildren)
    }

    sortChildren(root)
    return root
  }, [notes])

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
      } else {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

  // Update the renderTreeNode function to correctly count all descendants
  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.fullPath)
    const hasChildren = node.children.length > 0
    const isCurrentNote = currentNote?.slug === node.note?.slug

    // Count all descendant files recursively
    const countDescendantFiles = (node: TreeNode): number => {
      let count = node.type === "file" ? 1 : 0
      for (const child of node.children) {
        count += countDescendantFiles(child)
      }
      return count
    }

    const fileCount = node.type === "folder" ? countDescendantFiles(node) : 0

    if (node.type === "file" && node.note) {
      return (
        <div key={node.fullPath} className={styles.fileItem} style={{ paddingLeft: `${node.level * 8}px` }}>
          <button
            onClick={() => onNoteSelect(node.note!)}
            className={`${styles.fileButton} ${isCurrentNote ? styles.active : ""}`}
            title={node.note.title}
          >
            <span className={styles.fileIcon}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.fileIconSvg}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </span>
            <span className={styles.fileName}>{node.name}</span>
            {node.note.frontmatter.tags && (
              <span className={styles.fileTagCount}>
                {Array.isArray(node.note.frontmatter.tags) ? node.note.frontmatter.tags.length : 1}
              </span>
            )}
          </button>
        </div>
      )
    }

    if (node.type === "folder") {
      return (
        <div key={node.fullPath} className={styles.folderItem}>
          <button
            onClick={() => toggleFolder(node.fullPath)}
            className={styles.folderButton}
            style={{ paddingLeft: `${node.level * 8}px` }}
          >
            <span className={`${styles.folderIcon} ${isExpanded ? styles.expanded : ""}`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.folderIconSvg}
              >
                {isExpanded ? (
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                ) : (
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                )}
              </svg>
            </span>
            <span className={styles.folderName}>{node.name}</span>
            {hasChildren && <span className={styles.folderToggle}>{isExpanded ? "▾" : "▸"}</span>}
            {fileCount > 0 && <span className={styles.folderCount}>{fileCount}</span>}
          </button>
          {isExpanded && hasChildren && (
            <div className={styles.folderChildren}>{node.children.map(renderTreeNode)}</div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && <div className={styles.mobileOverlay} onClick={onToggle} />}

      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <button onClick={onToggle} className={styles.burgerMenu}>
              <span className={styles.burgerLine}></span>
              <span className={styles.burgerLine}></span>
              <span className={styles.burgerLine}></span>
            </button>
            <h2 className={styles.title}>File Explorer</h2>
          </div>
          <div className={styles.stats}>
            <span className={styles.noteCount}>{notes.length} notes</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.treeContainer}>{treeStructure.children.map(renderTreeNode)}</div>
        </nav>

        {/* Collapse/Expand All Controls */}
        <div className={styles.controls}>
          <button
            onClick={() => {
              const allFolderPaths = new Set<string>()
              const collectFolderPaths = (node: TreeNode) => {
                if (node.type === "folder" && node.children.length > 0) {
                  allFolderPaths.add(node.fullPath)
                }
                node.children.forEach(collectFolderPaths)
              }
              collectFolderPaths(treeStructure)
              setExpandedFolders(allFolderPaths)
            }}
            className={styles.controlButton}
          >
            📂 Expand All
          </button>
          <button onClick={() => setExpandedFolders(new Set(["root"]))} className={styles.controlButton}>
            📁 Collapse All
          </button>
        </div>
      </aside>
    </>
  )
}
