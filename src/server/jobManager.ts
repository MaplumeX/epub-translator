import {
  OpenAICompatibleProvider,
  runWholeBookPrescan,
  translateChapter,
  translateMetadataAndToc,
  translateSingleSegment,
  type TranslationProvider,
} from "../core/translation/index.js";
import type { BookSseEvent, ProviderPreset, SegmentRecord } from "../core/types.js";
import type { AppDatabase } from "./db.js";

export type ProviderFactory = (preset: ProviderPreset) => TranslationProvider;

function defaultProviderFactory(preset: ProviderPreset): TranslationProvider {
  return new OpenAICompatibleProvider({
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    model: preset.model,
    temperature: preset.temperature,
  });
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export class TranslationJobManager {
  private readonly db: AppDatabase;
  private readonly providerFactory: ProviderFactory;
  private readonly activeJobs = new Map<string, { kind: "prescan" | "translate"; controller: AbortController }>();
  private readonly listeners = new Map<string, Set<(event: BookSseEvent) => void>>();

  constructor(db: AppDatabase, providerFactory: ProviderFactory = defaultProviderFactory) {
    this.db = db;
    this.providerFactory = providerFactory;
  }

  createProvider(preset: ProviderPreset): TranslationProvider {
    return this.providerFactory(preset);
  }

  subscribe(bookId: string, listener: (event: BookSseEvent) => void): () => void {
    let set = this.listeners.get(bookId);
    if (!set) {
      set = new Set();
      this.listeners.set(bookId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(bookId);
      }
    };
  }

  private emit(bookId: string, event: BookSseEvent): void {
    const set = this.listeners.get(bookId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch {
        // Ignore broken SSE client listeners
      }
    }
  }

  isRunning(bookId: string): boolean {
    return this.activeJobs.has(bookId);
  }

  pauseBook(bookId: string): boolean {
    const job = this.activeJobs.get(bookId);
    if (!job) return false;
    job.controller.abort();
    return true;
  }

  private requireActiveProvider(): { preset: ProviderPreset; provider: TranslationProvider } {
    const preset = this.db.getActiveProvider();
    if (!preset) {
      throw new Error("请先在设置中配置一个 OpenAI 兼容模型 Provider");
    }
    const isLocal = /localhost|127\.0\.0\.1/.test(preset.baseUrl);
    if (!preset.apiKey.trim() && !isLocal) {
      throw new Error(`当前 Provider「${preset.name}」尚未填写 API Key，请先在设置中配置。`);
    }
    return { preset, provider: this.providerFactory(preset) };
  }

  startPrescan(bookId: string): Promise<void> {
    if (this.activeJobs.has(bookId)) {
      throw new Error("该书籍已有正在执行的任务，请先暂停或等待完成。");
    }
    const book = this.db.getBook(bookId);
    if (!book) throw new Error("书籍不存在");
    const { preset, provider } = this.requireActiveProvider();

    const controller = new AbortController();
    this.activeJobs.set(bookId, { kind: "prescan", controller });
    this.db.updateBookSettings(bookId, { status: "prescanning" });
    this.emit(bookId, { type: "book_status", bookId, status: "prescanning", message: "正在全书预扫描提取术语与章摘要…" });

    const run = (async () => {
      try {
        await this.executePrescanInternal(bookId, provider, preset.concurrency, controller.signal);
        this.db.updateBookSettings(bookId, { status: "idle", prescanCompleted: true });
        this.emit(bookId, {
          type: "book_status",
          bookId,
          status: "idle",
          prescanCompleted: true,
          message: "全书预扫描完成",
        });
      } catch (err) {
        if (isAbortError(err)) {
          this.db.updateBookSettings(bookId, { status: "paused" });
          this.emit(bookId, { type: "book_status", bookId, status: "paused", message: "已停止预扫描" });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          this.db.updateBookSettings(bookId, { status: "error" });
          this.emit(bookId, { type: "book_status", bookId, status: "error", message: `预扫描出错：${msg}` });
        }
      } finally {
        this.activeJobs.delete(bookId);
      }
    })();

    return run;
  }

  private async executePrescanInternal(
    bookId: string,
    provider: TranslationProvider,
    concurrency: number,
    signal: AbortSignal,
  ): Promise<void> {
    const book = this.db.getBook(bookId)!;
    const chapters = this.db.listChapters(bookId);
    const existingGlossary = this.db.listGlossary(bookId);

    const chapterInputs = chapters.map((ch) => ({
      id: ch.id,
      orderIndex: ch.orderIndex,
      title: ch.title,
      alreadyScanned: Boolean(ch.summary?.trim()),
      plainSegments: this.db.listSegments(ch.id).map((s) => s.sourcePlain),
    }));

    await runWholeBookPrescan({
      provider,
      bookTitle: book.title,
      targetLanguage: book.targetLanguage,
      chapters: chapterInputs,
      existingTerms: existingGlossary,
      concurrency: Math.min(concurrency, 4),
      signal,
      onChapterScanned: (res, completed, total) => {
        if (res.summary) {
          this.db.updateChapterSummary(res.chapterId, res.summary);
        }
        const inserted = this.db.addGlossaryTerms(
          bookId,
          res.newTerms.map((t) => ({ ...t, origin: "prescan" as const })),
        );
        this.emit(bookId, {
          type: "prescan_progress",
          bookId,
          completedChapters: completed,
          totalChapters: total,
          currentChapterTitle: res.chapterTitle,
          termsAdded: inserted.length,
        });
      },
    });
  }

  startTranslation(
    bookId: string,
    options: { retryFailed?: boolean; skipPrescan?: boolean } = {},
  ): Promise<void> {
    if (this.activeJobs.has(bookId)) {
      throw new Error("该书籍已有正在执行的任务，请先暂停或等待完成。");
    }
    const book = this.db.getBook(bookId);
    if (!book) throw new Error("书籍不存在");
    const { preset, provider } = this.requireActiveProvider();

    if (options.retryFailed) {
      this.db.resetFailedSegmentsForBook(bookId);
    }

    const controller = new AbortController();
    this.activeJobs.set(bookId, { kind: "translate", controller });

    const run = (async () => {
      try {
        // 1. Optional 7C-Lite whole-book prescan if enabled and not yet completed
        if (book.prescanEnabled && !book.prescanCompleted && !options.skipPrescan) {
          this.db.updateBookSettings(bookId, { status: "prescanning" });
          this.emit(bookId, { type: "book_status", bookId, status: "prescanning", message: "正在执行全书预扫描…" });
          await this.executePrescanInternal(bookId, provider, preset.concurrency, controller.signal);
          this.db.updateBookSettings(bookId, { prescanCompleted: true });
        }

        this.db.updateBookSettings(bookId, { status: "translating" });
        this.emit(bookId, { type: "book_status", bookId, status: "translating", message: "开始翻译章节…" });

        const chapters = this.db.listChapters(bookId);

        // 2. Translate book metadata & TOC titles once if missing
        if (!book.translatedTitle || chapters.some((c) => !c.translatedTitle)) {
          try {
            const metaResult = await translateMetadataAndToc(
              provider,
              {
                title: book.title,
                description: book.description,
                targetLanguage: book.targetLanguage,
                chapters: chapters.map((c) => ({ id: c.id, title: c.title })),
              },
              controller.signal,
            );
            this.db.updateBookMetadataTranslation(
              bookId,
              metaResult.translatedTitle,
              metaResult.translatedDescription,
            );
            for (const [chId, title] of metaResult.chapterTitles.entries()) {
              this.db.updateChapterTitleTranslation(chId, title);
            }
          } catch (err) {
            if (isAbortError(err)) throw err;
            // Metadata/TOC translation failure shouldn't block body chapter translation
          }
        }

        // 3. Translate each chapter sequentially (concurrent batches within chapter)
        for (const ch of chapters) {
          if (controller.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const latestChapter = this.db.getChapter(ch.id)!;
          const segments = this.db.listSegments(ch.id);
          const hasPending = segments.some((s) => s.status === "pending");
          if (!hasPending) continue;

          const glossary = this.db.listGlossary(bookId);

          await translateChapter({
            provider,
            bookTitle: book.title,
            chapterTitle: latestChapter.title,
            chapterSummary: latestChapter.summary,
            targetLanguage: book.targetLanguage,
            segments,
            glossary,
            maxBatchChars: preset.maxBatchChars,
            concurrency: preset.concurrency,
            signal: controller.signal,
            onBatchStart: (segmentIds) => {
              this.db.markSegmentsTranslating(segmentIds);
              for (const segId of segmentIds) {
                const seg = this.db.getSegment(segId);
                if (seg) {
                  this.emitSegmentUpdate(bookId, ch.id, seg);
                }
              }
            },
            onSegmentSettled: (outcome) => {
              const updatedSeg = this.db.setSegmentOutcome({
                segmentId: outcome.segmentId,
                status: outcome.status,
                translatedTemplate: outcome.translatedTemplate,
                translatedPlain: outcome.translatedPlain,
                errorMessage: outcome.errorMessage,
                retryCount: outcome.retryCount,
              });
              this.emitSegmentUpdate(bookId, ch.id, updatedSeg);
            },
          });
        }

        const finalBook = this.db.getBook(bookId)!;
        const finalStatus = finalBook.failedSegments > 0 ? "paused" : "completed";
        this.db.updateBookSettings(bookId, { status: finalStatus });
        this.emit(bookId, {
          type: "book_status",
          bookId,
          status: finalStatus,
          message:
            finalStatus === "completed"
              ? "全书翻译完成"
              : `翻译结束，有 ${finalBook.failedSegments} 个段落需要人工处理或重试`,
        });
      } catch (err) {
        this.db.resetTranslatingSegmentsForBook(bookId);
        if (isAbortError(err)) {
          this.db.updateBookSettings(bookId, { status: "paused" });
          this.emit(bookId, { type: "book_status", bookId, status: "paused", message: "已暂停翻译，进度已保存" });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          this.db.updateBookSettings(bookId, { status: "error" });
          this.emit(bookId, { type: "book_status", bookId, status: "error", message: `翻译中断：${msg}` });
        }
      } finally {
        this.activeJobs.delete(bookId);
      }
    })();

    return run;
  }

  async retranslateSegment(
    bookId: string,
    segmentId: string,
    customInstruction?: string,
  ): Promise<SegmentRecord> {
    const book = this.db.getBook(bookId);
    if (!book) throw new Error("书籍不存在");
    const seg = this.db.getSegment(segmentId);
    if (!seg || seg.bookId !== bookId) throw new Error("段落不存在");
    const chapter = this.db.getChapter(seg.chapterId)!;
    const { provider } = this.requireActiveProvider();

    const chapterSegments = this.db.listSegments(seg.chapterId);
    const idx = chapterSegments.findIndex((s) => s.id === seg.id);
    const priorContext = chapterSegments
      .slice(Math.max(0, idx - 3), Math.max(0, idx))
      .map((s) => ({
        source: s.sourcePlain,
        translation: s.translatedTemplate ?? undefined,
      }));

    this.db.markSegmentsTranslating([seg.id]);
    this.emitSegmentUpdate(bookId, seg.chapterId, this.db.getSegment(seg.id)!);

    const outcome = await translateSingleSegment({
      provider,
      bookTitle: book.title,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      targetLanguage: book.targetLanguage,
      segment: seg,
      priorContext,
      glossary: this.db.listGlossary(bookId),
      customInstruction,
      maxRetries: 2,
    });

    const updated = this.db.setSegmentOutcome({
      segmentId: seg.id,
      status: outcome.status,
      translatedTemplate: outcome.translatedTemplate,
      translatedPlain: outcome.translatedPlain,
      errorMessage: outcome.errorMessage,
      retryCount: seg.retryCount + 1,
    });

    // Recompute book completion if all segments are now translated
    const refreshedBook = this.db.getBook(bookId)!;
    if (
      !this.isRunning(bookId) &&
      refreshedBook.totalSegments > 0 &&
      refreshedBook.translatedSegments >= refreshedBook.totalSegments &&
      refreshedBook.failedSegments === 0
    ) {
      this.db.updateBookSettings(bookId, { status: "completed" });
    }

    this.emitSegmentUpdate(bookId, seg.chapterId, updated);
    return updated;
  }

  private emitSegmentUpdate(bookId: string, chapterId: string, segment: SegmentRecord): void {
    const book = this.db.getBook(bookId);
    const chapter = this.db.getChapter(chapterId);
    if (!book || !chapter) return;

    this.emit(bookId, {
      type: "segment_updated",
      bookId,
      chapterId,
      segment,
      bookStats: {
        totalSegments: book.totalSegments,
        translatedSegments: book.translatedSegments,
        failedSegments: book.failedSegments,
        status: book.status,
      },
      chapterStats: {
        chapterId: chapter.id,
        totalSegments: chapter.totalSegments,
        translatedSegments: chapter.translatedSegments,
        failedSegments: chapter.failedSegments,
        status: chapter.status,
      },
    });
  }
}
