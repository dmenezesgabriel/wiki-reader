import { remark } from "remark"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import { visit } from "unist-util-visit"
import type { Node } from "unist"
import type { Text } from "mdast"
import type { DendronNote } from "../types"

// Define types for our custom nodes
interface HashtagNode extends Node {
  type: "hashtag"
  value: string
  tag: string
}

interface TextNode extends Text {
  type: "text"
  value: string
}

interface MermaidNode extends Node {
  type: "code"
  lang: string
  value: string
}

// Custom remark plugin to process hashtags
function remarkHashtags() {
  return (tree: Node) => {
    visit(tree, "text", (node: TextNode, index: number | null, parent: any) => {
      if (!node.value || typeof node.value !== "string" || index === null || !parent) return

      // Find hashtags in the text using a more comprehensive regex
      const hashtagRegex = /#([a-zA-Z0-9_-]+)/g
      const text = node.value
      const matches = Array.from(text.matchAll(hashtagRegex))

      if (matches.length === 0) return

      const newNodes: (TextNode | HashtagNode)[] = []
      let lastIndex = 0

      matches.forEach((match) => {
        const matchIndex = match.index!
        const fullMatch = match[0]
        const tagName = match[1]

        // Add text before hashtag if any
        if (matchIndex > lastIndex) {
          newNodes.push({
            type: "text",
            value: text.slice(lastIndex, matchIndex),
          })
        }

        // Add hashtag node
        newNodes.push({
          type: "hashtag",
          value: fullMatch,
          tag: tagName,
        })

        lastIndex = matchIndex + fullMatch.length
      })

      // Add remaining text if any
      if (lastIndex < text.length) {
        newNodes.push({
          type: "text",
          value: text.slice(lastIndex),
        })
      }

      // Replace the original text node with our new nodes
      if (newNodes.length > 1) {
        parent.children.splice(index, 1, ...newNodes)
        return index + newNodes.length
      }
    })
  }
}

// Custom plugin to handle mermaid code blocks
function remarkMermaid() {
  return (tree: Node) => {
    visit(tree, "code", (node: MermaidNode, index: number | null, parent: any) => {
      if (node.lang === "mermaid" && index !== null && parent) {
        // Generate a unique ID for this mermaid diagram
        const mermaidId = `mermaid-${Math.random().toString(36).substring(2, 11)}`

        // Replace the code block with a custom mermaid element
        const mermaidElement = {
          type: "html",
          value: `<div class="mermaid-diagram" data-chart="${encodeURIComponent(node.value)}" data-id="${mermaidId}"></div>`,
        }

        parent.children[index] = mermaidElement
      }
    })
  }
}

export class MarkdownProcessor {
  private notes: DendronNote[] = []

  constructor(notes: DendronNote[]) {
    this.notes = notes
  }

  async processMarkdown(content: string, currentNote: DendronNote): Promise<string> {
    // First, replace transclusions with placeholder markers
    const { processedContent, transclusionMap } = this.preprocessTransclusions(content)

    // Process wiki links
    const withWikiLinks = this.processWikiLinks(processedContent)

    // Process with remark
    let html: string
    try {
      const processor = remark()
        .use(remarkMermaid) // Handle mermaid diagrams
        .use(remarkHashtags) // Add our custom hashtag plugin
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })

      const result = await processor.process(withWikiLinks)
      html = String(result)
    } catch (error) {
      console.error("Remark processing failed, using fallback:", error)
      html = this.fallbackMarkdownProcessor(withWikiLinks)
    }

    // Post-process HTML
    html = this.postProcessHtml(html)

    // Finally, replace transclusion placeholders with actual HTML
    html = await this.insertTransclusions(html, transclusionMap)

    return html
  }

  private preprocessTransclusions(content: string): {
    processedContent: string
    transclusionMap: Map<string, { slug: string; header?: string }>
  } {
    const transclusionMap = new Map<string, { slug: string; header?: string }>()
    let counter = 0

    const processedContent = content.replace(/!\[\[([^\]#]+)(?:#([^\]]+))?\]\]/g, (match, slug, header) => {
      const placeholder = `TRANSCLUSION_PLACEHOLDER_${counter}`
      transclusionMap.set(placeholder, { slug, header })
      counter++
      return placeholder
    })

    return { processedContent, transclusionMap }
  }

  private async insertTransclusions(
    html: string,
    transclusionMap: Map<string, { slug: string; header?: string }>,
  ): Promise<string> {
    let processedHtml = html

    for (const [placeholder, { slug, header }] of transclusionMap) {
      const transclusionHtml = await this.createTransclusionHtml(slug, header)
      processedHtml = processedHtml.replace(placeholder, transclusionHtml)
    }

    return processedHtml
  }

  private async createTransclusionHtml(slug: string, header?: string): Promise<string> {
    const transcludedNote = this.notes.find((n) => n.slug === slug)

    if (!transcludedNote) {
      return `<div class="transclusion-block transclusion-error">
        <div class="transclusion-header">
          <span class="transclusion-source">⚠️ Note not found</span>
        </div>
        <div class="transclusion-content">
          <p>The note "${slug}" could not be found.</p>
        </div>
      </div>`
    }

    let transcludedContent = transcludedNote.content
    const transcludedTitle = transcludedNote.title

    // Remove frontmatter from transcluded content
    transcludedContent = transcludedContent.replace(/^---\n[\s\S]*?\n---\n/, "")

    // If a header is specified, extract only that section
    if (header) {
      const headerResult = this.findAndExtractHeader(transcludedContent, header)

      if (!headerResult.found) {
        return `<div class="transclusion-block transclusion-error">
          <div class="transclusion-header">
            <span class="transclusion-source">⚠️ Header not found</span>
          </div>
          <div class="transclusion-content">
            <p>The header "${header}" was not found in "${transcludedNote.title}".</p>
            <details>
              <summary>Available headers:</summary>
              <ul>
                ${this.getAvailableHeaders(transcludedContent)
                  .map((h) => `<li>${h}</li>`)
                  .join("")}
              </ul>
            </details>
          </div>
        </div>`
      }

      transcludedContent = headerResult.content
    }

    // Process the transcluded markdown content to HTML
    const processedTranscludedContent = await this.processTranscludedMarkdown(transcludedContent)

    // Extract tags from the original transcluded content - but don't process them as hashtags here
    const tagMatches = transcludedContent.match(/#[\w-]+/g) || []
    const tags = tagMatches.map((tag) => tag.substring(1)) // Remove # prefix

    // Build the transclusion HTML - ensure it's all on one line to avoid markdown processing issues
    return `<div class="transclusion-block" data-source-slug="${slug}"><div class="transclusion-header"><span class="transclusion-source">From ${transcludedTitle}</span><button class="transclusion-link" data-slug="${slug}">Go to text →</button></div><div class="transclusion-content">${processedTranscludedContent}</div>${
      tags.length > 0
        ? `<div class="transclusion-tags">${tags.map((tag) => `<span class="transclusion-tag">#${tag}</span>`).join("")}</div>`
        : ""
    }</div>`
  }

  private async processTranscludedMarkdown(content: string): Promise<string> {
    try {
      // Don't remove hashtags from transcluded content - let them be processed
      if (!content.trim()) {
        return "<p><em>No content</em></p>"
      }

      // Process the markdown content with hashtag support
      const processor = remark()
        .use(remarkMermaid) // Handle mermaid diagrams
        .use(remarkHashtags)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })

      const result = await processor.process(content)
      let html = String(result).trim()

      // Remove wrapping <p> tags if the content is a single paragraph
      if (html.startsWith("<p>") && html.endsWith("</p>") && html.split("<p>").length === 2) {
        html = html.slice(3, -4)
      }

      return html
    } catch (error) {
      console.error("Error processing transcluded markdown:", error)
      // Fallback to simple processing
      return content ? this.fallbackMarkdownProcessor(content) : "<p><em>No content</em></p>"
    }
  }

  private findAndExtractHeader(content: string, targetHeader: string): { found: boolean; content: string } {
    // Normalize the target header for comparison
    const normalizedTarget = this.normalizeHeaderText(targetHeader)

    // Find all headers in the content (any level from # to ######)
    const headerRegex = /^(#{1,6})\s*(.+)$/gm
    let match
    const headers: Array<{ level: number; text: string; position: number; fullMatch: string }> = []

    while ((match = headerRegex.exec(content)) !== null) {
      const headerText = match[2].trim()
      // Skip if this looks like a tag line (starts with #)
      if (!headerText.startsWith("#")) {
        headers.push({
          level: match[1].length,
          text: headerText,
          position: match.index,
          fullMatch: match[0],
        })
      }
    }

    // Find the matching header using flexible matching
    const matchingHeader = headers.find((h) => {
      const normalizedHeaderText = this.normalizeHeaderText(h.text)
      return normalizedHeaderText === normalizedTarget
    })

    if (!matchingHeader) {
      return { found: false, content: "" }
    }

    // Find the end position (next header of same or higher level)
    const nextHeader = headers.find((h) => h.position > matchingHeader.position && h.level <= matchingHeader.level)

    const startPos = matchingHeader.position
    const endPos = nextHeader ? nextHeader.position : content.length

    const extractedContent = content.substring(startPos, endPos).trim()

    return { found: true, content: extractedContent }
  }

  private normalizeHeaderText(text: string): string {
    return text
      .toLowerCase() // Convert to lowercase
      .trim() // Remove leading/trailing whitespace
      .replace(/[^\w\s-]/g, "") // Keep letters, numbers, spaces, and hyphens
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, "") // Remove leading and trailing hyphens
  }

  private getAvailableHeaders(content: string): string[] {
    const headerRegex = /^(#{1,6})\s*(.+)$/gm
    const headers: string[] = []
    let match

    while ((match = headerRegex.exec(content)) !== null) {
      const headerText = match[2].trim()
      // Skip if this looks like a tag line
      if (!headerText.startsWith("#")) {
        const level = match[1].length
        const indent = "  ".repeat(level - 1)
        headers.push(`${indent}${match[1]} ${headerText}`)
      }
    }

    return headers.length > 0 ? headers : ["No headers found"]
  }

  private processWikiLinks(content: string): string {
    // Convert wiki links to custom format for post-processing
    return content.replace(/\[\[([^\]#]+)(?:#([^\]]+))?\]\]/g, (match, slug, header) => {
      const linkedNote = this.notes.find((n) => n.slug === slug)
      const displayText = linkedNote ? linkedNote.title : slug
      const fullSlug = header ? `${slug}#${header}` : slug

      return `<wikilink data-slug="${slug}" data-header="${header || ""}" data-exists="${!!linkedNote}">${displayText}${header ? ` › ${header}` : ""}</wikilink>`
    })
  }

  private postProcessHtml(html: string): string {
    // Convert custom wikilink tags to proper HTML
    return html.replace(
      /<wikilink data-slug="([^"]*)" data-header="([^"]*)" data-exists="([^"]*)">(.*?)<\/wikilink>/g,
      (match, slug, header, exists, text) => {
        if (exists === "true") {
          return `<button class="wikilink" data-slug="${slug}" data-header="${header}">${text}</button>`
        } else {
          return `<span class="deadlink">${text}</span>`
        }
      },
    )
  }

  private fallbackMarkdownProcessor(content: string): string {
    // Simple fallback markdown processor with hashtag support
    let processed = content
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      .replace(/`(.*?)`/gim, "<code>$1</code>")

    // Process hashtags in fallback mode
    processed = processed.replace(/#([a-zA-Z0-9_-]+)/g, (match, tag) => {
      return `<span class="hashtag" data-tag="${tag}">${match}</span>`
    })

    // Handle mermaid blocks in fallback
    processed = processed.replace(/```mermaid\n([\s\S]*?)\n```/g, (match, chart) => {
      const mermaidId = `mermaid-${Math.random().toString(36).substring(2, 11)}`
      return `<div class="mermaid-diagram" data-chart="${encodeURIComponent(chart.trim())}" data-id="${mermaidId}"></div>`
    })

    return processed.replace(/\n\n/gim, "</p><p>").replace(/\n/gim, "<br>").replace(/^/, "<p>").replace(/$/, "</p>")
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  getBacklinks(noteSlug: string): DendronNote[] {
    return this.notes.filter(
      (n) => n.slug !== noteSlug && (n.content.includes(`[[${noteSlug}]]`) || n.content.includes(`![[${noteSlug}]]`)),
    )
  }
}
