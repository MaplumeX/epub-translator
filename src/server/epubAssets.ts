import fs from "node:fs";
import JSZip from "jszip";

// Only allowlisted image media types may be served from source.epub, and SVG assets carry a strict CSP,
// preventing untrusted EPUB payloads from executing scripts under the local workbench origin.
// See ADR 2026-11-24-continuous-chapter-reader.

const ALLOWED_IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

interface CachedZipEntry {
  mtimeMs: number;
  size: number;
  zip: JSZip;
}

export class EpubAssetCache {
  private readonly maxEntries: number;
  private readonly cache = new Map<string, CachedZipEntry>();

  constructor(maxEntries = 4) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  async loadZip(bookId: string, sourcePath: string): Promise<JSZip | null> {
    if (!fs.existsSync(sourcePath)) {
      this.cache.delete(bookId);
      return null;
    }

    const stat = fs.statSync(sourcePath);
    const existing = this.cache.get(bookId);
    if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
      // Refresh LRU recency
      this.cache.delete(bookId);
      this.cache.set(bookId, existing);
      return existing.zip;
    }

    const buffer = fs.readFileSync(sourcePath);
    const zip = await JSZip.loadAsync(buffer);
    this.cache.delete(bookId);
    this.cache.set(bookId, { mtimeMs: stat.mtimeMs, size: stat.size, zip });

    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    return zip;
  }

  invalidate(bookId: string): void {
    this.cache.delete(bookId);
  }
}

export function normalizeAssetZipPath(rawPath: string): string | null {
  if (!rawPath || rawPath.includes("\0") || rawPath.includes("\\")) {
    return null;
  }

  const rawSegments = rawPath.split("/");
  const cleanSegments: string[] = [];

  for (const seg of rawSegments) {
    if (!seg) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return null;
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      return null;
    }
    cleanSegments.push(decoded);
  }

  return cleanSegments.length > 0 ? cleanSegments.join("/") : null;
}

export function getAllowedAssetMime(zipPath: string): string | null {
  const dotIdx = zipPath.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const ext = zipPath.slice(dotIdx).toLowerCase();
  return ALLOWED_IMAGE_MIME_BY_EXT[ext] ?? null;
}
