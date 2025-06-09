"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { formatDate } from "../lib/dateUtils" // Import formatDate
import { MarkdownProcessor } from "../services/MarkdownProcessor"
import type { DendronNote } from "../types"
import styles from "./MarkdownRenderer.module.css"
import MermaidRenderer from "./MermaidRenderer"

interface MarkdownRendererProps {
  note: DendronNote
  notes: DendronNote[]
  onNoteSelect: (note: DendronNote) => void
}

export default function MarkdownRenderer({ note, notes, onNoteSelect }: MarkdownRendererProps) {
  const [processedContent, setProcessedContent] = useState("")
  const [loading, setLoading] = useState(true)

  const processor = useMemo(() => new MarkdownProcessor(notes), [notes])

  const backlinks = useMemo(() => {
    return processor.getBacklinks(note.slug)
  }, [processor, note.slug])

  useEffect(() => {
    const processContent = async () => {
      setLoading(true)
      try {
        const html = await processor.processMarkdown(note.content, note)
        console.log("Processed HTML:", html) // Debug log to see what's being generated
        console.log("Original content:", note.content) // Debug log to see original content
        setProcessedContent(html)
      } catch (error) {
        console.error("Error processing markdown:", error)
        setProcessedContent(`<p>Error rendering content: ${error}</p>`)
      } finally {
        setLoading(false)
      }
    }

    processContent()
  }, [note.content, processor, note])

  // Replace mermaid placeholders with actual components after content is set
  useEffect(() => {
    if (!loading && processedContent) {
      const mermaidElements = document.querySelectorAll(".mermaid-diagram")

      mermaidElements.forEach((element) => {
        const chartData = element.getAttribute("data-chart")
        const diagramId = element.getAttribute("data-id")

        if (chartData && diagramId) {
          try {
            const decodedChart = decodeURIComponent(chartData)
            console.log("Found mermaid diagram:", decodedChart) // Debug log

            // Create a container for the React component
            const container = document.createElement("div")
            container.className = styles.mermaidContainer

            // Replace the placeholder with the container
            element.parentNode?.replaceChild(container, element)

            // Import React and ReactDOM dynamically to render the component
            import("react").then((React) => {
              import("react-dom/client").then((ReactDOM) => {
                const root = ReactDOM.createRoot(container)
                root.render(
                  React.createElement(MermaidRenderer, {
                    chart: decodedChart,
                    id: diagramId,
                  }),
                )
              })
            })
          } catch (error) {
            console.error("Error processing mermaid diagram:", error)
            element.innerHTML = `<div class="mermaid-error">Error: ${error}</div>`
          }
        }
      })
    }
  }, [loading, processedContent])

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    if (target.classList.contains("wikilink")) {
      const slug = target.getAttribute("data-slug")
      const linkedNote = notes.find((n) => n.slug === slug)
      if (linkedNote) {
        onNoteSelect(linkedNote)
      }
    }

    if (target.classList.contains("transclusion-link")) {
      const slug = target.getAttribute("data-slug")
      const linkedNote = notes.find((n) => n.slug === slug)
      if (linkedNote) {
        onNoteSelect(linkedNote)
      }
    }

    // Handle hashtag clicks for potential filtering
    if (target.classList.contains("hashtag")) {
      const tag = target.getAttribute("data-tag")
      if (tag) {
        // You can implement tag filtering here
        console.log(`Clicked on tag: ${tag}`)
        // Example: onTagFilter?.(tag)
      }
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Processing markdown...</p>
      </div>
    )
  }

  return (
    <article className={styles.article}>
      {/* Frontmatter */}
      {Object.keys(note.frontmatter).length > 0 && (
        <div className={styles.frontmatter}>
          <h4>Metadata</h4>
          <dl className={styles.metadataList}>
            {Object.entries(note.frontmatter).map(([key, value]) => (
              <div key={key} className={styles.metadataItem}>
                <dt>{key}:</dt>
                <dd>
                  {Array.isArray(value) ? (
                    <div className={styles.tags}>
                      {value.map((item, index) => (
                        <span key={index} className={styles.tag}>
                          {String(item)}
                        </span>
                      ))}
                    </div>
                  ) : (key === "created" || key === "updated") && typeof value === "number" ? (
                    formatDate(value)
                  ) : (
                    String(value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Note title */}
      <header className={styles.header}>
        <h1 className={styles.title}>{note.title}</h1>
        <div className={styles.slug}>{note.slug}</div>
      </header>

      {/* Note content */}
      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: processedContent }}
        onClick={handleClick}
        data-debug="content-container"
      />

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <section className={styles.backlinks}>
          <h3>Backlinks</h3>
          <ul className={styles.backlinkList}>
            {backlinks.map((backlink) => (
              <li key={backlink.slug}>
                <button onClick={() => onNoteSelect(backlink)} className={styles.backlinkButton}>
                  🔗 {backlink.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
