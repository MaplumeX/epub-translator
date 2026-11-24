import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { templateToPlainText } from "../core/epub/xhtml.js";
import type {
  BookRecord,
  BookStatus,
  ChapterRecord,
  ChapterStatus,
  GlossaryTerm,
  InlinePlaceholder,
  OutputMode,
  ParsedEpub,
  ProviderPreset,
  ProviderPresetPublic,
  SegmentRecord,
  SegmentStatus,
} from "../core/types.js";

// Using Node 24's built-in node:sqlite with WAL mode keeps persistence zero-native-build
// while committing each translated batch transactionally for safe resume after restarts.
// See ADR 2026-11-24-epub-translator-architecture.

function nowIso(): string {
  return new Date().toISOString();
}

export function maskApiKey(key: string): string {
  const clean = key.trim();
  if (!clean) return "";
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function toPublicProvider(p: ProviderPreset): ProviderPresetPublic {
  const { apiKey, ...rest } = p;
  return {
    ...rest,
    hasApiKey: apiKey.trim().length > 0,
    apiKeyMasked: maskApiKey(apiKey),
  };
}

function computeChapterStatus(total: number, translated: number, failed: number, translating: number): ChapterStatus {
  if (total === 0) return "completed";
  if (translating > 0) return "translating";
  if (translated >= total && failed === 0) return "completed";
  if (failed > 0 && translated === 0) return "error";
  if (translated > 0 || failed > 0) return "partial";
  return "pending";
}

export class AppDatabase {
  readonly db: DatabaseSync;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, "books"), { recursive: true });

    const dbPath = path.join(this.dataDir, "app.db");
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initSchema();
    this.seedInitialProviders();
    this.recoverInterruptedWork();
  }

  close(): void {
    this.db.close();
  }

  getBookDir(bookId: string): string {
    return path.join(this.dataDir, "books", bookId);
  }

  getSourceEpubPath(bookId: string): string {
    return path.join(this.getBookDir(bookId), "source.epub");
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'openai-compatible',
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        concurrency INTEGER NOT NULL DEFAULT 4,
        max_batch_chars INTEGER NOT NULL DEFAULT 2600,
        temperature REAL NOT NULL DEFAULT 0.3,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        translated_title TEXT,
        author TEXT NOT NULL,
        source_language TEXT NOT NULL DEFAULT 'en',
        target_language TEXT NOT NULL DEFAULT '简体中文',
        description TEXT,
        translated_description TEXT,
        epub_version TEXT NOT NULL DEFAULT '3',
        opf_path TEXT NOT NULL,
        toc_ncx_path TEXT,
        nav_xhtml_path TEXT,
        source_filename TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        output_mode TEXT NOT NULL DEFAULT 'bilingual',
        prescan_enabled INTEGER NOT NULL DEFAULT 0,
        prescan_completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        spine_id TEXT NOT NULL,
        href TEXT NOT NULL,
        title TEXT NOT NULL,
        translated_title TEXT,
        summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, order_index);

      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        dom_path TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        source_template TEXT NOT NULL,
        source_plain TEXT NOT NULL,
        source_html TEXT NOT NULL,
        placeholders_json TEXT NOT NULL DEFAULT '[]',
        translated_template TEXT,
        translated_plain TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_segments_chapter ON segments(chapter_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_segments_book_status ON segments(book_id, status);

      CREATE TABLE IF NOT EXISTS glossary_terms (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        source_term TEXT NOT NULL,
        target_term TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_glossary_book ON glossary_terms(book_id);
    `);
  }

  private seedInitialProviders(): void {
    const countRow = this.db.prepare("SELECT COUNT(*) as cnt FROM providers").get() as { cnt: number };
    if (countRow.cnt > 0) return;

    const ts = nowIso();
    const envBase = process.env.OPENAI_BASE_URL?.trim();
    const envKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    const envModel = process.env.OPENAI_MODEL?.trim();
    const envConcurrency = Number(process.env.OPENAI_CONCURRENCY ?? "4") || 4;

    const presets = [
      {
        id: "preset-openai",
        name: "OpenAI",
        baseUrl: envBase || "https://api.openai.com/v1",
        apiKey: envKey,
        model: envModel || "gpt-4o-mini",
        concurrency: Math.max(1, Math.min(envConcurrency, 10)),
        isActive: 1,
      },
      {
        id: "preset-deepseek",
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "",
        model: "deepseek-chat",
        concurrency: 4,
        isActive: 0,
      },
      {
        id: "preset-ollama",
        name: "Ollama（本地）",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
        model: "qwen2.5:14b",
        concurrency: 2,
        isActive: 0,
      },
    ];

    const stmt = this.db.prepare(`
      INSERT INTO providers (id, name, kind, base_url, api_key, model, concurrency, max_batch_chars, temperature, is_active, created_at, updated_at)
      VALUES (?, ?, 'openai-compatible', ?, ?, ?, ?, 2600, 0.3, ?, ?, ?)
    `);

    for (const p of presets) {
      stmt.run(p.id, p.name, p.baseUrl, p.apiKey, p.model, p.concurrency, p.isActive, ts, ts);
    }
  }

  recoverInterruptedWork(): void {
    const ts = nowIso();
    this.db
      .prepare("UPDATE segments SET status = 'pending', updated_at = ? WHERE status = 'translating'")
      .run(ts);
    this.db
      .prepare("UPDATE books SET status = 'paused', updated_at = ? WHERE status IN ('translating', 'prescanning')")
      .run(ts);
  }

  // ---- Providers ----

  listProviders(): ProviderPreset[] {
    const rows = this.db
      .prepare("SELECT * FROM providers ORDER BY is_active DESC, created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapProviderRow(r));
  }

  getProviderById(id: string): ProviderPreset | null {
    const row = this.db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.mapProviderRow(row) : null;
  }

  getActiveProvider(): ProviderPreset | null {
    const row = this.db
      .prepare("SELECT * FROM providers WHERE is_active = 1 LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    if (row) return this.mapProviderRow(row);
    const first = this.db.prepare("SELECT * FROM providers LIMIT 1").get() as Record<string, unknown> | undefined;
    return first ? this.mapProviderRow(first) : null;
  }

  upsertProvider(input: {
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    concurrency?: number;
    maxBatchChars?: number;
    temperature?: number;
    isActive?: boolean;
  }): ProviderPreset {
    const ts = nowIso();
    const existing = input.id ? this.getProviderById(input.id) : null;
    const id = existing ? existing.id : input.id || `preset-${crypto.randomUUID().slice(0, 8)}`;

    const apiKey = input.apiKey !== undefined ? input.apiKey : (existing?.apiKey ?? "");
    const concurrency = Math.max(1, Math.min(input.concurrency ?? existing?.concurrency ?? 4, 10));
    const maxBatchChars = Math.max(600, Math.min(input.maxBatchChars ?? existing?.maxBatchChars ?? 2600, 10000));
    const temperature = Math.max(0, Math.min(input.temperature ?? existing?.temperature ?? 0.3, 1.5));

    this.db.exec("BEGIN");
    try {
      if (input.isActive) {
        this.db.prepare("UPDATE providers SET is_active = 0").run();
      }
      if (existing) {
        this.db
          .prepare(`
            UPDATE providers
            SET name = ?, base_url = ?, api_key = ?, model = ?, concurrency = ?, max_batch_chars = ?, temperature = ?,
                is_active = COALESCE(?, is_active), updated_at = ?
            WHERE id = ?
          `)
          .run(
            input.name.trim(),
            input.baseUrl.trim(),
            apiKey,
            input.model.trim(),
            concurrency,
            maxBatchChars,
            temperature,
            input.isActive === undefined ? null : input.isActive ? 1 : 0,
            ts,
            id,
          );
      } else {
        this.db
          .prepare(`
            INSERT INTO providers (id, name, kind, base_url, api_key, model, concurrency, max_batch_chars, temperature, is_active, created_at, updated_at)
            VALUES (?, ?, 'openai-compatible', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            id,
            input.name.trim(),
            input.baseUrl.trim(),
            apiKey,
            input.model.trim(),
            concurrency,
            maxBatchChars,
            temperature,
            input.isActive ? 1 : 0,
            ts,
            ts,
          );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    return this.getProviderById(id)!;
  }

  setActiveProvider(id: string): ProviderPreset | null {
    const existing = this.getProviderById(id);
    if (!existing) return null;
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE providers SET is_active = 0").run();
      this.db.prepare("UPDATE providers SET is_active = 1, updated_at = ? WHERE id = ?").run(nowIso(), id);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return this.getProviderById(id);
  }

  deleteProvider(id: string): boolean {
    const res = this.db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    if (res.changes > 0) {
      const active = this.db.prepare("SELECT id FROM providers WHERE is_active = 1 LIMIT 1").get();
      if (!active) {
        const first = this.db.prepare("SELECT id FROM providers LIMIT 1").get() as { id: string } | undefined;
        if (first) {
          this.db.prepare("UPDATE providers SET is_active = 1 WHERE id = ?").run(first.id);
        }
      }
      return true;
    }
    return false;
  }

  private mapProviderRow(r: Record<string, unknown>): ProviderPreset {
    return {
      id: String(r.id),
      name: String(r.name),
      kind: "openai-compatible",
      baseUrl: String(r.base_url),
      apiKey: String(r.api_key ?? ""),
      model: String(r.model),
      concurrency: Number(r.concurrency),
      maxBatchChars: Number(r.max_batch_chars),
      temperature: Number(r.temperature),
      isActive: Boolean(r.is_active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  // ---- Books, Chapters & Segments ----

  createBookFromParsed(
    parsed: ParsedEpub,
    sourceBuffer: Buffer,
    sourceFilename: string,
  ): BookRecord {
    const bookId = `book-${crypto.randomUUID().slice(0, 10)}`;
    const ts = nowIso();
    const bookDir = this.getBookDir(bookId);
    fs.mkdirSync(bookDir, { recursive: true });
    fs.writeFileSync(this.getSourceEpubPath(bookId), sourceBuffer);

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`
          INSERT INTO books (
            id, title, translated_title, author, source_language, target_language,
            description, translated_description, epub_version, opf_path, toc_ncx_path, nav_xhtml_path,
            source_filename, file_size_bytes, status, output_mode, prescan_enabled, prescan_completed,
            created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, '简体中文', ?, NULL, ?, ?, ?, ?, ?, ?, 'idle', 'bilingual', 0, 0, ?, ?)
        `)
        .run(
          bookId,
          parsed.metadata.title,
          parsed.metadata.author,
          parsed.metadata.language,
          parsed.metadata.description ?? null,
          parsed.metadata.epubVersion,
          parsed.metadata.opfPath,
          parsed.metadata.tocNcxPath ?? null,
          parsed.metadata.navXhtmlPath ?? null,
          sourceFilename,
          sourceBuffer.byteLength,
          ts,
          ts,
        );

      const insertChapter = this.db.prepare(`
        INSERT INTO chapters (id, book_id, order_index, spine_id, href, title, translated_title, summary)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
      `);

      const insertSegment = this.db.prepare(`
        INSERT INTO segments (
          id, book_id, chapter_id, order_index, dom_path, tag_name,
          source_template, source_plain, source_html, placeholders_json,
          translated_template, translated_plain, status, error_message, retry_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', NULL, 0, ?)
      `);

      for (const ch of parsed.chapters) {
        const chapterId = `${bookId}-ch-${ch.orderIndex}`;
        insertChapter.run(chapterId, bookId, ch.orderIndex, ch.spineId, ch.href, ch.title);
        for (const seg of ch.segments) {
          const segId = `${chapterId}-${seg.domPath}`;
          insertSegment.run(
            segId,
            bookId,
            chapterId,
            seg.orderIndex,
            seg.domPath,
            seg.tagName,
            seg.sourceTemplate,
            seg.sourcePlain,
            seg.sourceHtml,
            JSON.stringify(seg.placeholders),
            ts,
          );
        }
      }

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      fs.rmSync(bookDir, { recursive: true, force: true });
      throw err;
    }

    return this.getBook(bookId)!;
  }

  listBooks(): BookRecord[] {
    // Aggregates chapterCount via subquery so library overview stays zero-migration for existing DBs.
    // See ADR 2026-11-24-book-library-management.
    const rows = this.db
      .prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id) AS total_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id AND s.status = 'translated') AS translated_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id AND s.status = 'failed') AS failed_segments
        FROM books b
        ORDER BY b.updated_at DESC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapBookRow(r));
  }

  getBook(bookId: string): BookRecord | null {
    const row = this.db
      .prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id) AS total_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id AND s.status = 'translated') AS translated_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.book_id = b.id AND s.status = 'failed') AS failed_segments
        FROM books b
        WHERE b.id = ?
      `)
      .get(bookId) as Record<string, unknown> | undefined;
    return row ? this.mapBookRow(row) : null;
  }

  updateBookSettings(
    bookId: string,
    patch: { outputMode?: OutputMode; prescanEnabled?: boolean; status?: BookStatus; prescanCompleted?: boolean },
  ): BookRecord | null {
    const existing = this.getBook(bookId);
    if (!existing) return null;

    this.db
      .prepare(`
        UPDATE books
        SET output_mode = ?, prescan_enabled = ?, status = ?, prescan_completed = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        patch.outputMode ?? existing.outputMode,
        patch.prescanEnabled !== undefined ? (patch.prescanEnabled ? 1 : 0) : existing.prescanEnabled ? 1 : 0,
        patch.status ?? existing.status,
        patch.prescanCompleted !== undefined
          ? patch.prescanCompleted
            ? 1
            : 0
          : existing.prescanCompleted
            ? 1
            : 0,
        nowIso(),
        bookId,
      );
    return this.getBook(bookId);
  }

  updateBookMetadataTranslation(
    bookId: string,
    translatedTitle?: string,
    translatedDescription?: string,
  ): void {
    this.db
      .prepare(`
        UPDATE books
        SET translated_title = COALESCE(?, translated_title),
            translated_description = COALESCE(?, translated_description),
            updated_at = ?
        WHERE id = ?
      `)
      .run(translatedTitle ?? null, translatedDescription ?? null, nowIso(), bookId);
  }

  deleteBook(bookId: string): boolean {
    const res = this.db.prepare("DELETE FROM books WHERE id = ?").run(bookId);
    if (res.changes > 0) {
      fs.rmSync(this.getBookDir(bookId), { recursive: true, force: true });
      return true;
    }
    return false;
  }

  listChapters(bookId: string): ChapterRecord[] {
    const rows = this.db
      .prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id) AS total_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'translated') AS translated_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'failed') AS failed_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'translating') AS translating_segments
        FROM chapters c
        WHERE c.book_id = ?
        ORDER BY c.order_index ASC
      `)
      .all(bookId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapChapterRow(r));
  }

  getChapter(chapterId: string): ChapterRecord | null {
    const row = this.db
      .prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id) AS total_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'translated') AS translated_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'failed') AS failed_segments,
          (SELECT COUNT(*) FROM segments s WHERE s.chapter_id = c.id AND s.status = 'translating') AS translating_segments
        FROM chapters c
        WHERE c.id = ?
      `)
      .get(chapterId) as Record<string, unknown> | undefined;
    return row ? this.mapChapterRow(row) : null;
  }

  updateChapterTitleTranslation(chapterId: string, translatedTitle: string): void {
    this.db.prepare("UPDATE chapters SET translated_title = ? WHERE id = ?").run(translatedTitle, chapterId);
  }

  updateChapterSummary(chapterId: string, summary: string): void {
    this.db.prepare("UPDATE chapters SET summary = ? WHERE id = ?").run(summary, chapterId);
  }

  listSegments(chapterId: string, filter: "all" | "failed" = "all"): SegmentRecord[] {
    const sql =
      filter === "failed"
        ? "SELECT * FROM segments WHERE chapter_id = ? AND status = 'failed' ORDER BY order_index ASC"
        : "SELECT * FROM segments WHERE chapter_id = ? ORDER BY order_index ASC";
    const rows = this.db.prepare(sql).all(chapterId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSegmentRow(r));
  }

  getSegment(segmentId: string): SegmentRecord | null {
    const row = this.db.prepare("SELECT * FROM segments WHERE id = ?").get(segmentId) as Record<string, unknown> | undefined;
    return row ? this.mapSegmentRow(row) : null;
  }

  markSegmentsTranslating(segmentIds: string[]): void {
    if (segmentIds.length === 0) return;
    const ts = nowIso();
    const stmt = this.db.prepare("UPDATE segments SET status = 'translating', error_message = NULL, updated_at = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      for (const id of segmentIds) {
        stmt.run(ts, id);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  resetTranslatingSegmentsForBook(bookId: string): void {
    this.db
      .prepare("UPDATE segments SET status = 'pending', updated_at = ? WHERE book_id = ? AND status = 'translating'")
      .run(nowIso(), bookId);
  }

  resetFailedSegmentsForBook(bookId: string): void {
    this.db
      .prepare("UPDATE segments SET status = 'pending', error_message = NULL, updated_at = ? WHERE book_id = ? AND status = 'failed'")
      .run(nowIso(), bookId);
  }

  resetAllTranslationsForBook(bookId: string): void {
    const ts = nowIso();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "UPDATE segments SET translated_template = NULL, translated_plain = NULL, status = 'pending', error_message = NULL, retry_count = 0, updated_at = ? WHERE book_id = ?",
        )
        .run(ts, bookId);
      this.db.prepare("UPDATE chapters SET translated_title = NULL WHERE book_id = ?").run(bookId);
      this.db
        .prepare("UPDATE books SET translated_title = NULL, translated_description = NULL, status = 'idle', updated_at = ? WHERE id = ?")
        .run(ts, bookId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  setSegmentOutcome(input: {
    segmentId: string;
    status: SegmentStatus;
    translatedTemplate: string | null;
    translatedPlain: string | null;
    errorMessage: string | null;
    retryCount?: number;
  }): SegmentRecord {
    const ts = nowIso();
    this.db
      .prepare(`
        UPDATE segments
        SET status = ?, translated_template = ?, translated_plain = ?, error_message = ?,
            retry_count = COALESCE(?, retry_count), updated_at = ?
        WHERE id = ?
      `)
      .run(
        input.status,
        input.translatedTemplate,
        input.translatedPlain,
        input.errorMessage,
        input.retryCount ?? null,
        ts,
        input.segmentId,
      );
    const updated = this.getSegment(input.segmentId)!;
    this.db.prepare("UPDATE books SET updated_at = ? WHERE id = ?").run(ts, updated.bookId);
    return updated;
  }

  updateSegmentManual(segmentId: string, translatedTemplate: string): SegmentRecord {
    const seg = this.getSegment(segmentId);
    if (!seg) {
      throw new Error("段落不存在");
    }
    const plain = templateToPlainText(translatedTemplate, seg.placeholders);
    return this.setSegmentOutcome({
      segmentId,
      status: "translated",
      translatedTemplate: translatedTemplate.trim(),
      translatedPlain: plain,
      errorMessage: null,
    });
  }

  // ---- Glossary ----

  listGlossary(bookId: string): GlossaryTerm[] {
    const rows = this.db
      .prepare("SELECT * FROM glossary_terms WHERE book_id = ? ORDER BY origin ASC, source_term COLLATE NOCASE ASC")
      .all(bookId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      bookId: String(r.book_id),
      sourceTerm: String(r.source_term),
      targetTerm: String(r.target_term),
      note: String(r.note ?? ""),
      origin: (r.origin === "prescan" ? "prescan" : "manual") as "manual" | "prescan",
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  addGlossaryTerms(
    bookId: string,
    terms: Array<{ sourceTerm: string; targetTerm: string; note?: string; origin?: "manual" | "prescan" }>,
  ): GlossaryTerm[] {
    const existing = new Set(this.listGlossary(bookId).map((t) => t.sourceTerm.toLowerCase()));
    const ts = nowIso();
    const inserted: GlossaryTerm[] = [];

    const stmt = this.db.prepare(`
      INSERT INTO glossary_terms (id, book_id, source_term, target_term, note, origin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN");
    try {
      for (const item of terms) {
        const src = item.sourceTerm.trim();
        const tgt = item.targetTerm.trim();
        if (!src || !tgt) continue;
        if (existing.has(src.toLowerCase())) continue;
        existing.add(src.toLowerCase());
        const id = `term-${crypto.randomUUID().slice(0, 10)}`;
        const origin = item.origin ?? "manual";
        const note = (item.note ?? "").trim();
        stmt.run(id, bookId, src, tgt, note, origin, ts, ts);
        inserted.push({ id, bookId, sourceTerm: src, targetTerm: tgt, note, origin, createdAt: ts, updatedAt: ts });
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }

    return inserted;
  }

  updateGlossaryTerm(
    bookId: string,
    termId: string,
    patch: { sourceTerm?: string; targetTerm?: string; note?: string },
  ): GlossaryTerm | null {
    const row = this.db
      .prepare("SELECT * FROM glossary_terms WHERE id = ? AND book_id = ?")
      .get(termId, bookId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const ts = nowIso();
    const sourceTerm = patch.sourceTerm?.trim() || String(row.source_term);
    const targetTerm = patch.targetTerm?.trim() || String(row.target_term);
    const note = patch.note !== undefined ? patch.note.trim() : String(row.note ?? "");

    this.db
      .prepare("UPDATE glossary_terms SET source_term = ?, target_term = ?, note = ?, origin = 'manual', updated_at = ? WHERE id = ?")
      .run(sourceTerm, targetTerm, note, ts, termId);

    return {
      id: termId,
      bookId,
      sourceTerm,
      targetTerm,
      note,
      origin: "manual",
      createdAt: String(row.created_at),
      updatedAt: ts,
    };
  }

  deleteGlossaryTerm(bookId: string, termId: string): boolean {
    const res = this.db.prepare("DELETE FROM glossary_terms WHERE id = ? AND book_id = ?").run(termId, bookId);
    return res.changes > 0;
  }

  // ---- Row Mappers ----

  private mapBookRow(r: Record<string, unknown>): BookRecord {
    return {
      id: String(r.id),
      title: String(r.title),
      translatedTitle: r.translated_title ? String(r.translated_title) : null,
      author: String(r.author),
      sourceLanguage: String(r.source_language),
      targetLanguage: String(r.target_language),
      description: r.description ? String(r.description) : null,
      translatedDescription: r.translated_description ? String(r.translated_description) : null,
      epubVersion: r.epub_version === "2" ? "2" : "3",
      opfPath: String(r.opf_path),
      tocNcxPath: r.toc_ncx_path ? String(r.toc_ncx_path) : null,
      navXhtmlPath: r.nav_xhtml_path ? String(r.nav_xhtml_path) : null,
      sourceFilename: String(r.source_filename),
      fileSizeBytes: Number(r.file_size_bytes),
      status: String(r.status) as BookStatus,
      outputMode: (r.output_mode === "translated_only" ? "translated_only" : "bilingual") as OutputMode,
      prescanEnabled: Boolean(r.prescan_enabled),
      prescanCompleted: Boolean(r.prescan_completed),
      chapterCount: Number(r.chapter_count ?? 0),
      totalSegments: Number(r.total_segments ?? 0),
      translatedSegments: Number(r.translated_segments ?? 0),
      failedSegments: Number(r.failed_segments ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapChapterRow(r: Record<string, unknown>): ChapterRecord {
    const total = Number(r.total_segments ?? 0);
    const translated = Number(r.translated_segments ?? 0);
    const failed = Number(r.failed_segments ?? 0);
    const translating = Number(r.translating_segments ?? 0);

    return {
      id: String(r.id),
      bookId: String(r.book_id),
      orderIndex: Number(r.order_index),
      spineId: String(r.spine_id),
      href: String(r.href),
      title: String(r.title),
      translatedTitle: r.translated_title ? String(r.translated_title) : null,
      summary: r.summary ? String(r.summary) : null,
      totalSegments: total,
      translatedSegments: translated,
      failedSegments: failed,
      status: computeChapterStatus(total, translated, failed, translating),
    };
  }

  private mapSegmentRow(r: Record<string, unknown>): SegmentRecord {
    let placeholders: InlinePlaceholder[] = [];
    try {
      placeholders = JSON.parse(String(r.placeholders_json ?? "[]")) as InlinePlaceholder[];
    } catch {
      placeholders = [];
    }

    return {
      id: String(r.id),
      bookId: String(r.book_id),
      chapterId: String(r.chapter_id),
      orderIndex: Number(r.order_index),
      domPath: String(r.dom_path),
      tagName: String(r.tag_name),
      sourceTemplate: String(r.source_template),
      sourcePlain: String(r.source_plain),
      sourceHtml: String(r.source_html),
      placeholders,
      translatedTemplate: r.translated_template ? String(r.translated_template) : null,
      translatedPlain: r.translated_plain ? String(r.translated_plain) : null,
      status: String(r.status) as SegmentStatus,
      errorMessage: r.error_message ? String(r.error_message) : null,
      retryCount: Number(r.retry_count ?? 0),
      updatedAt: String(r.updated_at),
    };
  }
}
