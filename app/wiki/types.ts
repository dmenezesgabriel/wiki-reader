export interface DendronNote {
  slug: string
  title: string
  content: string
  frontmatter: Record<string, any>
  path: string
}

export interface RepoInfo {
  owner: string
  repo: string
  url: string
  source?: string
  fileCount?: number
  totalFiles?: number
}

export interface TreeNode {
  name: string
  fullPath: string
  type: "folder" | "file"
  children: TreeNode[]
  note?: DendronNote
  isExpanded?: boolean
  level: number
}
