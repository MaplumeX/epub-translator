import { describe, expect, it } from "vitest";
import { api } from "../../src/web/api/client.js";
import {
  PREVIEW_BOOKS,
  PREVIEW_CHAPTER_NODES,
  PREVIEW_CHAPTERS,
  PREVIEW_GLOSSARY,
  PREVIEW_PLACEHOLDER_NODES,
  PREVIEW_PROVIDERS,
  PREVIEW_SEGMENTS,
} from "../../src/web/previewData.js";
import { classifySafeClientLink, parseInlineTemplate } from "../../src/web/utils/inlineTemplate.js";

describe("Workbench frontend contracts and realistic state fixtures", () => {
  it("constructs export URLs for both bilingual and translated_only modes", () => {
    expect(api.getExportUrl("book-123", "bilingual")).toBe("/api/books/book-123/export?mode=bilingual");
    expect(api.getExportUrl("book-123", "translated_only")).toBe(
      "/api/books/book-123/export?mode=translated_only",
    );
  });

  it("provides realistic non-placeholder domain fixtures covering translated, failed, pending, and rich document nodes", () => {
    expect(PREVIEW_BOOKS).toHaveLength(1);
    expect(PREVIEW_CHAPTERS.length).toBeGreaterThanOrEqual(4);
    expect(PREVIEW_PROVIDERS.some((p) => p.isActive)).toBe(true);
    expect(PREVIEW_GLOSSARY.length).toBeGreaterThanOrEqual(3);
    expect(PREVIEW_CHAPTER_NODES.length).toBeGreaterThanOrEqual(6);

    const statuses = new Set(PREVIEW_SEGMENTS.map((s) => s.status));
    expect(statuses.has("translated")).toBe(true);
    expect(statuses.has("failed")).toBe(true);
    expect(statuses.has("pending")).toBe(true);

    // Ensure no placeholder Lorem ipsum copy leaks into fixtures
    const serialized = JSON.stringify({
      PREVIEW_BOOKS,
      PREVIEW_CHAPTERS,
      PREVIEW_SEGMENTS,
      PREVIEW_CHAPTER_NODES,
    });
    expect(serialized.toLowerCase()).not.toContain("lorem ipsum");
  });

  it("parses nested inline templates, restores void AST/fallback placeholders, and strips unsafe hrefs", () => {
    const seg = PREVIEW_SEGMENTS[1];
    const nodes = parseInlineTemplate(
      seg.translatedTemplate!,
      seg.placeholders,
      PREVIEW_PLACEHOLDER_NODES["seg-1"],
      "OEBPS/text/ch02.xhtml",
    );

    expect(nodes.some((n) => n.kind === "void_ast")).toBe(true);
    const emNode = nodes.find((n) => n.kind === "paired" && n.tagName === "em");
    expect(emNode).toBeDefined();

    // Fallback parsing when server placeholderNodes are absent
    const fallbackNodes = parseInlineTemplate(
      "参考[[I1]]重要章节[[/I1]][[V2]]并调用 [[V1]]。",
      seg.placeholders,
      undefined,
      "OEBPS/text/ch02.xhtml",
    );
    expect(
      fallbackNodes.some((n) => n.kind === "void_fallback" && n.isCode && n.text === "RaftNode.appendEntries()"),
    ).toBe(true);
    expect(
      fallbackNodes.some(
        (n) => n.kind === "void_fallback" && n.isNoteref && n.link?.kind === "anchor" && n.link.hash === "fn1",
      ),
    ).toBe(true);

    // Malformed / unclosed template never throws
    const malformed = parseInlineTemplate("缺少闭合 [[I1]]文本 [[V99]]", seg.placeholders);
    expect(malformed.length).toBeGreaterThan(0);

    // Unsafe href schemes rejected
    expect(classifySafeClientLink("javascript:alert(1)", "OEBPS/text/ch02.xhtml")).toBeUndefined();
    expect(classifySafeClientLink("#fn1", "OEBPS/text/ch02.xhtml")).toEqual({
      kind: "anchor",
      href: "#fn1",
      hash: "fn1",
    });
    expect(classifySafeClientLink("ch03.xhtml#s2", "OEBPS/text/ch02.xhtml")).toEqual({
      kind: "chapter",
      href: "ch03.xhtml#s2",
      chapterHref: "OEBPS/text/ch03.xhtml",
      hash: "s2",
    });
  });
});
