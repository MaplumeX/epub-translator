import type { BookRecord } from "../../core/types.js";

// Hash-based reader routing preserves query params (?state=...&theme=...) used by preview/shoot audits
// and keeps page reloads on the active book without requiring server-side route rewrites.
// See ADR 2026-11-24-book-library-management.

export type LibraryStatusFilter = "all" | "in_progress" | "completed" | "failed";
export type LibrarySortBy = "updated" | "title" | "progress";

export function parseBookIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/book\/([^/?#]+)$/);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

export function buildBookHash(bookId: string | null): string {
  if (!bookId) return "";
  return `#/book/${encodeURIComponent(bookId)}`;
}

export function isBookActiveJob(book: BookRecord): boolean {
  return book.status === "translating" || book.status === "prescanning";
}

export function isBookCompleted(book: BookRecord): boolean {
  if (isBookActiveJob(book)) return false;
  if (book.status === "completed") return true;
  return (
    book.totalSegments > 0 &&
    book.translatedSegments >= book.totalSegments &&
    book.failedSegments === 0
  );
}

export function getBookProgressPercent(book: BookRecord): number {
  if (book.totalSegments <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((book.translatedSegments / book.totalSegments) * 100)));
}

export function matchesStatusFilter(book: BookRecord, filter: LibraryStatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return isBookCompleted(book);
    case "failed":
      return book.failedSegments > 0 || book.status === "error";
    case "in_progress":
      return !isBookCompleted(book);
  }
}

export function countBooksByFilter(books: BookRecord[]): Record<LibraryStatusFilter, number> {
  const counts: Record<LibraryStatusFilter, number> = {
    all: books.length,
    in_progress: 0,
    completed: 0,
    failed: 0,
  };
  for (const book of books) {
    if (isBookCompleted(book)) {
      counts.completed += 1;
    } else {
      counts.in_progress += 1;
    }
    if (book.failedSegments > 0 || book.status === "error") {
      counts.failed += 1;
    }
  }
  return counts;
}

export function filterAndSortBooks(
  books: BookRecord[],
  options: {
    query: string;
    statusFilter: LibraryStatusFilter;
    sortBy: LibrarySortBy;
  },
): BookRecord[] {
  const needle = options.query.trim().toLowerCase();

  const filtered = books.filter((book) => {
    if (!matchesStatusFilter(book, options.statusFilter)) return false;
    if (!needle) return true;
    const haystack = [book.translatedTitle ?? "", book.title, book.author, book.sourceFilename]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (options.sortBy === "title") {
      const aName = a.translatedTitle || a.title;
      const bName = b.translatedTitle || b.title;
      return aName.localeCompare(bName, "zh-Hans-CN", { sensitivity: "base" });
    }
    if (options.sortBy === "progress") {
      const diff = getBookProgressPercent(b) - getBookProgressPercent(a);
      if (diff !== 0) return diff;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return sorted;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUpdatedAt(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffMs = Math.max(0, nowMs - ts);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return iso.slice(0, 10);
}
