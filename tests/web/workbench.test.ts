import { describe, expect, it } from "vitest";
import { api } from "../../src/web/api/client.js";
import {
  PREVIEW_BOOKS,
  PREVIEW_CHAPTERS,
  PREVIEW_GLOSSARY,
  PREVIEW_PROVIDERS,
  PREVIEW_SEGMENTS,
} from "../../src/web/previewData.js";

describe("Workbench frontend contracts and realistic state fixtures", () => {
  it("constructs export URLs for both bilingual and translated_only modes", () => {
    expect(api.getExportUrl("book-123", "bilingual")).toBe("/api/books/book-123/export?mode=bilingual");
    expect(api.getExportUrl("book-123", "translated_only")).toBe(
      "/api/books/book-123/export?mode=translated_only",
    );
  });

  it("provides realistic non-placeholder domain fixtures covering translated, failed, and pending states", () => {
    expect(PREVIEW_BOOKS).toHaveLength(1);
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
});
