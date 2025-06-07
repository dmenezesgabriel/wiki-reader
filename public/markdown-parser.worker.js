// Web Worker for parsing markdown files in parallel
// Note: This file is in public/ directory and uses regular JavaScript (not TypeScript/ES modules)

// Parse frontmatter from markdown content
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: {}, content }
  }

  const [, frontmatterText, bodyContent] = match
  const frontmatter = {}

  // Parse YAML-like frontmatter
  frontmatterText.split("\n").forEach((line) => {
    const colonIndex = line.indexOf(":")
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()

      // Handle arrays (tags, etc.)
      if (value.startsWith("[") && value.endsWith("]")) {
        frontmatter[key] = value
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim().replace(/['"]/g, ""))
          .filter((item) => item.length > 0)
      } else {
        frontmatter[key] = value.replace(/['"]/g, "")
      }
    }
  })

  return { frontmatter, content: bodyContent }
}

// Convert slug to title
function slugToTitle(slug) {
  return slug
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" › ")
}

// Parse a single note
function parseNote(file) {
  try {
    if (!file.content) return null

    const { frontmatter, content } = parseFrontmatter(file.content)

    // Extract slug from filename (remove .md extension)
    const slug = file.name.replace(".md", "")

    // Extract title from frontmatter or use slug
    const title = frontmatter.title || slugToTitle(slug)

    return {
      slug,
      title,
      content,
      frontmatter,
      path: file.path,
    }
  } catch (error) {
    console.error(`Error parsing note ${file.name}:`, error)
    return null
  }
}

// Handle messages from main thread
self.onmessage = (e) => {
  const { id, file } = e.data

  try {
    const note = parseNote(file)

    const response = {
      id,
      success: true,
      note: note || undefined,
    }

    self.postMessage(response)
  } catch (error) {
    const response = {
      id,
      success: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    }

    self.postMessage(response)
  }
}
