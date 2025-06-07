"use client"
import MermaidRenderer from "./MermaidRenderer"
import styles from "./MermaidDiagram.module.css"

interface MermaidDiagramProps {
  chart: string
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  return (
    <div className={styles.mermaidWrapper}>
      <MermaidRenderer chart={chart} />
    </div>
  )
}
