import { describe, expect, it } from "vitest";
import { api } from "../../src/web/api/client.js";
import {
  PREVIEW_BOOKS,
  PREVIEW_CHAPTERS,
  PREVIEW_GLOSSARY,
  PREVIEW_PROVIDERS,
  PREVIEW_SEGMENTS,
} from "../../src/web/previewData.js";
import {
  buildBookHash,
  countBooksByFilter,
  filterAndSortBooks,
  formatFileSize,
  formatUpdatedAt,
  parseBookIdFromHash,
} from "../../src/web/utils/library.js";

describe("Workbench frontend contracts and realistic state fixtures", () => {
  it("constructs export URLs for both bilingual and translated_only modes", () => {
    expect(api.getExportUrl("book-123", "bilingual")).toBe("/api/books/book-123/export?mode=bilingual");
    expect(api.getExportUrl("book-123", "translated_only")).toBe(
      "/api/books/book-123/export?mode=translated_only",
    );
  });

  it("provides realistic non-placeholder domain fixtures covering multi-book library and segment states", () => {
    expect(PREVIEW_BOOKS.length).toBeGreaterThanOrEqual(3);
    expect(PREVIEW_BOOKS.every((b) => b.chapterCount > 0)).toBe(true);
    expect(PREVIEW_CHAPTERS.length).toBeGreaterThanOrEqual(4);
    expect(PREVIEW_PROVIDERS.some((p) => p.isActive)).toBe(true);
    expect(PREVIEW_GLOSSARY.length).toBeGreaterThanOrEqual(3);

    const statuses = new Set(PREVIEW_SEGMENTS.map((s) => s.status));
    expect(statuses.has("translated")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
    expect(statuses.has("pending")).toBe(true);

    // Ensure no placeholder Lorem ipsum copy leaks into fixtures
    const serialized = JSON.stringify({ PREVIEW_BOOKS, PREVIEW_CHAPTERS, PREVIEW_SEGMENTS });
    expect(serialized.toLowerCase()).not.toContain("lorem ipsum");
  });

  it("parses and builds book hash routes cleanly", () => {
    expect(parseBookIdFromHash("#/book/book-123")).toBe("book-123");
    expect(parseBookIdFromHash("#/book/book%20with%20space")).toBe("book with space");
    expect(parseBookIdFromHash("")).toBeNull();
    expect(parseBookIdFromHash("#/library")).toBeNull();
    expect(buildBookHash("book-123")).toBe("#/book/book-123");
    expect(buildBookHash(null)).toBe("");
  });

  it("filters, counts, and sorts library books accurately", () => {
    const counts = countBooksByFilter(PREVIEW_BOOKS);
    expect(counts).toEqual({
      all: 3,
      in_progress: 2,
      completed: 1,
      failed: 1,
    });

    const byFailed = filterAndSortBooks(PREVIEW_BOOKS, {
      query: "",
      statusFilter: "failed",
      sortBy: "updated",
    });
    expect(byFailed.map((b) => b.id)).toEqual(["preview-book-1"]);

    const bySearch = filterAndSortBooks(PREVIEW_BOOKS, {
      query: "lindholm",
      statusFilter: "all",
      sortBy: "updated",
    });
    expect(bySearch.map((b) => b.id)).toEqual(["preview-book-2"]);

    const byProgress = filterAndSortBooks(PREVIEW_BOOKS, {
      query: "",
      statusFilter: "all",
      sortBy: "progress",
    });
    expect(byProgress.map((b) => b.id)).toEqual([
      "preview-book-2",
      "preview-book-1",
      "preview-book-3",
    ]);
  });

  it("formats file sizes and relative update timestamps", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(1_842_300)).toBe("1.8 MB");

    const now = Date.parse("2026-11-24T09:00:00.000Z");
    expect(formatUpdatedAt("2026-11-24T08:59:30.000Z", now)).toBe("刚刚");
    expect(formatUpdatedAt("2026-11-24T08:45:00.000Z", now)).toBe("15 分钟前");
    expect(formatUpdatedAt("2026-11-24T06:00:00.000Z", now)).toBe("3 小时前");
    expect(formatUpdatedAt("2026-11-22T09:00:00.000Z", now)).toBe("2 天前");
    expect(formatUpdatedAt("2026-11-01T09:00:00.000Z", now)).toBe("2026-11-01");
  });
});
