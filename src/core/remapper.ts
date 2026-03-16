import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Remap all paths in JSONL and JSON files within a session directory.
 * Uses global string replacement (same strategy as cc-go-on).
 */
export async function remapPaths(
  sessionDir: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  if (sourcePath === targetPath) return

  const files = await collectFiles(sessionDir, ['.jsonl', '.json'])

  for (const filePath of files) {
    let content = await readFile(filePath, 'utf-8')

    // Replace forward-slash version: /home/alice/project → /workspace
    content = replaceAll(content, sourcePath, targetPath)

    // Replace escaped backslash version in JSON: D:\\\\NEOCORTICA → /workspace
    // (In raw JSON file, backslash is doubled: D:\\NEOCORTICA in JS = D:\\\\NEOCORTICA in file)
    if (sourcePath.includes('\\')) {
      const doubleEscaped = sourcePath.replace(/\\/g, '\\\\')
      content = replaceAll(content, doubleEscaped, targetPath)
    }

    // Also handle forward-slashified Windows path: D:/NEOCORTICA → /workspace
    if (sourcePath.includes('\\')) {
      const forwardSlashed = sourcePath.replace(/\\/g, '/')
      content = replaceAll(content, forwardSlashed, targetPath)
    }

    await writeFile(filePath, content)
  }
}

function replaceAll(content: string, search: string, replace: string): string {
  // Escape special regex chars in search string
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.replace(new RegExp(escaped, 'g'), replace)
}

async function collectFiles(
  dir: string,
  extensions: string[]
): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath, extensions))
    } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }

  return results
}
