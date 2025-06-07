"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./MermaidRenderer.module.css"

interface MermaidRendererProps {
  chart: string
  id?: string
}

export default function MermaidRenderer({
  chart,
  id = `mermaid-${Math.random().toString(36).substring(2, 11)}`,
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [svg, setSvg] = useState<string>("")

  useEffect(() => {
    let isMounted = true

    const renderMermaid = async () => {
      try {
        setLoading(true)
        setError(null)

        console.log("Rendering Mermaid diagram:", chart) // Debug log

        // Dynamically import mermaid
        const mermaid = (await import("mermaid")).default

        // Initialize mermaid with configuration
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          fontFamily: "inherit",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
          sequence: {
            useMaxWidth: true,
          },
          gantt: {
            useMaxWidth: true,
          },
        })

        if (isMounted) {
          // Clean the chart content
          const cleanChart = chart.trim()

          if (!cleanChart) {
            throw new Error("Empty diagram content")
          }

          console.log("Clean chart content:", cleanChart) // Debug log

          // Render the diagram
          const { svg: renderedSvg } = await mermaid.render(id, cleanChart)

          console.log("Rendered SVG:", renderedSvg) // Debug log

          if (isMounted) {
            setSvg(renderedSvg)
          }
        }
      } catch (err) {
        console.error("Mermaid rendering error:", err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to render diagram")
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    renderMermaid()

    return () => {
      isMounted = false
    }
  }, [chart, id])

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <span>Rendering diagram...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.error}>
        <h4>Diagram Rendering Error</h4>
        <pre>{error}</pre>
        <details>
          <summary>Diagram Source</summary>
          <pre className={styles.source}>{chart}</pre>
        </details>
      </div>
    )
  }

  return (
    <div className={styles.diagram}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}
