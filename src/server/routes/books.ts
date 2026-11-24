import fs from "node:fs";
import { Hono } from "hono";
import { z } from "zod";
import {
  buildChapterDocument,
  buildFallbackChapterNodes,
  exportTranslatedEpub,
  parseEpubBuffer,
  validateTranslatedPlaceholders,
} from "../../core/epub/index.js";
import type { ChapterDocumentPayload, OutputMode } from "../../core/types.js";
import type { AppDatabase } from "../db.js";
import { EpubAssetCache, getAllowedAssetMime, normalizeAssetZipPath } from "../epubAssets.js";
import type { TranslationJobManager } from "../jobManager.js";

const UpdateBookSchema = z.object({
  outputMode: z.enum(["bilingual", "translated_only"]).optional(),
  prescanEnabled: z.boolean().optional(),
});

const EditSegmentSchema = z.object({
  translatedTemplate: z.string().min(1, "译文不能为空"),
});

export function createBooksRoutes(db: AppDatabase, jobs: TranslationJobManager): Hono {
  const app = new Hono();
  const epubCache = new EpubAssetCache(4);

  app.get("/", (c) => {
    return c.json({ books: db.listBooks() });
  });

  app.post("/import", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "请上传有效的 .epub 文件（字段名 file）" }, 400);
    }
    if (!file.name.toLowerCase().endsWith(".epub")) {
      return c.json({ error: "仅支持 .epub 格式文件" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const parsed = await parseEpubBuffer(buffer);
      const book = db.createBookFromParsed(parsed, buffer, file.name);
      const chapters = db.listChapters(book.id);
      return c.json({ book, chapters }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "EPUB 解析失败" },
        400,
      );
    }
  });

  app.get("/:id", (c) => {
    const book = db.getBook(c.req.param("id"));
    if (!book) return c.json({ error: "书籍不存在" }, 404);
    const chapters = db.listChapters(book.id);
    return c.json({ book, chapters });
  });

  app.patch("/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateBookSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "无效参数" }, 400);
    }
    const updated = db.updateBookSettings(c.req.param("id"), parsed.data);
    if (!updated) return c.json({ error: "书籍不存在" }, 404);
    return c.json({ book: updated });
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    jobs.pauseBook(id);
    epubCache.invalidate(id);
    const ok = db.deleteBook(id);
    if (!ok) return c.json({ error: "书籍不存在" }, 404);
    return c.json({ deleted: true });
  });

  app.get("/:id/chapters/:chapterId/document", async (c) => {
    const bookId = c.req.param("id");
    const chapterId = c.req.param("chapterId");
    const chapter = db.getChapter(chapterId);
    if (!chapter || chapter.bookId !== bookId) {
      return c.json({ error: "章节不存在" }, 404);
    }

    const segments = db.listSegments(chapterId, "all");
    const sourcePath = db.getSourceEpubPath(bookId);

    try {
      const zip = await epubCache.loadZip(bookId, sourcePath);
      const entry = zip?.file(chapter.href) ?? null;
      if (entry) {
        const xhtml = await entry.async("string");
        const built = buildChapterDocument(xhtml, {
          chapterHref: chapter.href,
          assetBaseUrl: `/api/books/${encodeURIComponent(bookId)}/assets`,
        });
        const payload: ChapterDocumentPayload = {
          chapter,
          nodes: built.nodes,
          segments,
          placeholderNodes: built.placeholderNodes,
          fallback: false,
        };
        return c.json(payload);
      }
    } catch {
      // Fall through to graceful segment-only document synthesis
    }

    const fallbackPayload: ChapterDocumentPayload = {
      chapter,
      nodes: buildFallbackChapterNodes(segments),
      segments,
      placeholderNodes: {},
      fallback: true,
    };
    return c.json(fallbackPayload);
  });

  app.get("/:id/assets/*", async (c) => {
    const bookId = c.req.param("id");
    const book = db.getBook(bookId);
    if (!book) {
      return c.json({ error: "书籍不存在" }, 404);
    }

    const marker = "/assets/";
    const markerIdx = c.req.path.indexOf(marker);
    const rawRelPath = markerIdx === -1 ? "" : c.req.path.slice(markerIdx + marker.length);
    const zipPath = normalizeAssetZipPath(rawRelPath);
    if (!zipPath) {
      return c.json({ error: "非法资源路径" }, 400);
    }

    const mimeType = getAllowedAssetMime(zipPath);
    if (!mimeType) {
      return c.json({ error: "不支持的资源类型" }, 403);
    }

    const zip = await epubCache.loadZip(bookId, db.getSourceEpubPath(bookId));
    const file = zip?.file(zipPath) ?? null;
    if (!file || file.dir) {
      return c.json({ error: "资源不存在" }, 404);
    }

    const bytes = await file.async("uint8array");
    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    };
    if (mimeType === "image/svg+xml") {
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
    }

    return new Response(new Uint8Array(bytes), { status: 200, headers });
  });

  app.get("/:id/chapters/:chapterId/segments", (c) => {
    const bookId = c.req.param("id");
    const chapterId = c.req.param("chapterId");
    const filter = c.req.query("filter") === "failed" ? "failed" : "all";
    const chapter = db.getChapter(chapterId);
    if (!chapter || chapter.bookId !== bookId) {
      return c.json({ error: "章节不存在" }, 404);
    }
    const segments = db.listSegments(chapterId, filter);
    return c.json({ chapter, segments });
  });

  app.patch("/:id/segments/:segmentId", async (c) => {
    const bookId = c.req.param("id");
    const segmentId = c.req.param("segmentId");
    const seg = db.getSegment(segmentId);
    if (!seg || seg.bookId !== bookId) {
      return c.json({ error: "段落不存在" }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = EditSegmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "译文不能为空" }, 400);
    }

    const check = validateTranslatedPlaceholders(parsed.data.translatedTemplate, seg.placeholders);
    if (!check.valid) {
      return c.json({ error: `占位符校验失败：${check.reason}` }, 400);
    }

    const updated = db.updateSegmentManual(segmentId, parsed.data.translatedTemplate);
    const book = db.getBook(bookId)!;
    const chapter = db.getChapter(updated.chapterId)!;
    return c.json({ segment: updated, book, chapter });
  });

  app.get("/:id/export", async (c) => {
    const bookId = c.req.param("id");
    const book = db.getBook(bookId);
    if (!book) return c.json({ error: "书籍不存在" }, 404);

    const modeParam = c.req.query("mode");
    const outputMode: OutputMode =
      modeParam === "translated_only" || modeParam === "bilingual"
        ? modeParam
        : book.outputMode;

    const sourcePath = db.getSourceEpubPath(bookId);
    if (!fs.existsSync(sourcePath)) {
      return c.json({ error: "找不到原始 EPUB 文件" }, 404);
    }

    const sourceBuffer = fs.readFileSync(sourcePath);
    const chapters = db.listChapters(bookId).map((ch) => ({
      href: ch.href,
      title: ch.title,
      translatedTitle: ch.translatedTitle,
      segments: db.listSegments(ch.id).map((s) => ({
        domPath: s.domPath,
        translatedTemplate: s.translatedTemplate,
        placeholders: s.placeholders,
        status: s.status,
      })),
    }));

    const outBuffer = await exportTranslatedEpub({
      sourceBuffer,
      opfPath: book.opfPath,
      tocNcxPath: book.tocNcxPath,
      navXhtmlPath: book.navXhtmlPath,
      outputMode,
      translatedTitle: book.translatedTitle,
      translatedDescription: book.translatedDescription,
      chapters,
    });

    const baseName = book.sourceFilename.replace(/\.epub$/i, "").replace(/[^\w\u4e00-\u9fa5-]+/g, "_") || "translated";
    const suffix = outputMode === "bilingual" ? "bilingual" : "zh";
    const filename = `${baseName}-${suffix}.epub`;

    return new Response(new Uint8Array(outBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(outBuffer.byteLength),
      },
    });
  });

  return app;
}
