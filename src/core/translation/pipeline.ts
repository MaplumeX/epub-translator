import { templateToPlainText, validateTranslatedPlaceholders } from "../epub/xhtml.js";
import type { InlinePlaceholder } from "../types.js";
import type { TranslationProvider } from "./provider.js";
import {
  extractJsonPayload,
  parseAndValidateBatchResponse,
  parseMetadataTocResponse,
} from "./validator.js";

// 7C-Lite single-pass pipeline: chapter-scoped batch chunking with sliding prior context,
// optional glossary/summary injection, and automatic single-segment fallback on validation failure.
// See ADR 2026-11-24-epub-translator-architecture.

export interface TranslatableSegmentInput {
  id: string;
  orderIndex: number;
  tagName: string;
  sourceTemplate: string;
  sourcePlain: string;
  placeholders: InlinePlaceholder[];
  status: string;
  translatedTemplate?: string | null;
}

export interface GlossaryEntryInput {
  sourceTerm: string;
  targetTerm: string;
  note?: string;
}

export interface SettledSegmentOutcome {
  segmentId: string;
  status: "translated" | "failed";
  translatedTemplate: string | null;
  translatedPlain: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface TranslateChapterOptions {
  provider: TranslationProvider;
  bookTitle: string;
  chapterTitle: string;
  chapterSummary?: string | null;
  targetLanguage?: string;
  segments: TranslatableSegmentInput[];
  glossary?: GlossaryEntryInput[];
  maxBatchChars?: number;
  concurrency?: number;
  maxSingleRetries?: number;
  signal?: AbortSignal;
  onBatchStart?: (segmentIds: string[]) => void | Promise<void>;
  onSegmentSettled?: (outcome: SettledSegmentOutcome) => void | Promise<void>;
}

export interface TranslateSingleSegmentOptions {
  provider: TranslationProvider;
  bookTitle: string;
  chapterTitle: string;
  chapterSummary?: string | null;
  targetLanguage?: string;
  segment: TranslatableSegmentInput;
  priorContext?: Array<{ source: string; translation?: string }>;
  glossary?: GlossaryEntryInput[];
  customInstruction?: string;
  maxRetries?: number;
  signal?: AbortSignal;
}

export function buildChapterBatches(
  pendingSegments: TranslatableSegmentInput[],
  maxBatchChars: number,
): TranslatableSegmentInput[][] {
  const limit = Math.max(400, maxBatchChars);
  const batches: TranslatableSegmentInput[][] = [];
  let current: TranslatableSegmentInput[] = [];
  let currentChars = 0;

  for (const seg of pendingSegments) {
    const segLen = seg.sourceTemplate.length;
    if (current.length > 0 && currentChars + segLen > limit) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(seg);
    currentChars += segLen;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function selectRelevantGlossary(
  glossary: GlossaryEntryInput[],
  combinedSourceText: string,
  maxItems = 35,
): GlossaryEntryInput[] {
  if (glossary.length === 0) return [];
  const lowerText = combinedSourceText.toLowerCase();
  const matched = glossary.filter((g) => lowerText.includes(g.sourceTerm.toLowerCase()));
  if (matched.length > 0) {
    return matched.slice(0, maxItems);
  }
  return glossary.slice(0, Math.min(12, maxItems));
}

function buildSystemPrompt(
  targetLanguage: string,
  bookTitle: string,
  chapterTitle: string,
  chapterSummary?: string | null,
  glossary?: GlossaryEntryInput[],
): string {
  const lines = [
    `你是一位兼顾文学流畅度与技术严谨性的专业书籍译者，负责将《${bookTitle}》的章节「${chapterTitle}」翻译为自然地道的${targetLanguage}。`,
    "严格遵守以下规则：",
    "1. 文本中形如 [[I1]]...[[/I1]] 的成对占位符和 [[V1]] 的单标签占位符代表内联格式、代码、公式或脚注引用，必须 100% 原样保留编号与嵌套配对，严禁删改、重命名、拆分或新增占位符。",
    "2. 译文保持忠实自然，避免生硬直译；技术名词与人名保持前后一致。",
    "3. 仅返回合法 JSON，不要附带额外解释。",
  ];

  if (chapterSummary?.trim()) {
    lines.push(`\n本章背景摘要：${chapterSummary.trim()}`);
  }

  if (glossary && glossary.length > 0) {
    const formatted = glossary
      .map((g) => `- ${g.sourceTerm} => ${g.targetTerm}${g.note ? `（${g.note}）` : ""}`)
      .join("\n");
    lines.push(`\n术语与人名对照表（务必统一）：\n${formatted}`);
  }

  return lines.join("\n");
}

function parseSingleTranslationResponse(raw: string): string {
  try {
    const parsed = extractJsonPayload(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const rec = parsed as Record<string, unknown>;
      if (typeof rec.text === "string" && rec.text.trim()) {
        return rec.text.trim();
      }
      if (Array.isArray(rec.translations) && rec.translations[0] && typeof (rec.translations[0] as Record<string, unknown>).text === "string") {
        return String((rec.translations[0] as Record<string, unknown>).text).trim();
      }
    }
  } catch {
    // Allow plain text fallback only when it looks like direct prose rather than broken JSON wrapper
  }
  return raw.trim().replace(/^```(?:\w+)?\s*|\s*```$/g, "").trim();
}

export async function translateSingleSegment(
  options: TranslateSingleSegmentOptions,
): Promise<SettledSegmentOutcome> {
  const targetLang = options.targetLanguage ?? "简体中文";
  const maxRetries = options.maxRetries ?? 2;
  const relevantGlossary = selectRelevantGlossary(options.glossary ?? [], options.segment.sourceTemplate);
  const systemPrompt = buildSystemPrompt(
    targetLang,
    options.bookTitle,
    options.chapterTitle,
    options.chapterSummary,
    relevantGlossary,
  );

  let lastError = "翻译失败";
  let feedback = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const parts: string[] = [];
    if (options.priorContext && options.priorContext.length > 0) {
      const ctxText = options.priorContext
        .map((c, idx) => `[前文 ${idx + 1}] ${c.source}${c.translation ? `\n[译文 ${idx + 1}] ${c.translation}` : ""}`)
        .join("\n");
      parts.push(`供参考的前文语境（无需翻译）：\n${ctxText}`);
    }

    if (options.customInstruction?.trim()) {
      parts.push(`用户额外润色/翻译要求：${options.customInstruction.trim()}`);
    }

    if (feedback) {
      parts.push(`上一次输出未通过校验：${feedback}。请务必修正并保留所有 [[I*]]/[[V*]] 占位符。`);
    }

    parts.push(
      `请翻译下面这一段文本，并严格返回 JSON 对象 {"id":"${options.segment.id}","text":"译文"}：\n${options.segment.sourceTemplate}`,
    );

    try {
      const res = await options.provider.chatCompletion({
        jsonMode: true,
        signal: options.signal,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: parts.join("\n\n") },
        ],
      });

      const translated = parseSingleTranslationResponse(res.content);
      if (!translated) {
        lastError = "模型返回空译文";
        feedback = lastError;
        continue;
      }

      const check = validateTranslatedPlaceholders(translated, options.segment.placeholders);
      if (!check.valid) {
        lastError = check.reason ?? "占位符校验失败";
        feedback = lastError;
        continue;
      }

      return {
        segmentId: options.segment.id,
        status: "translated",
        translatedTemplate: translated,
        translatedPlain: templateToPlainText(translated, options.segment.placeholders),
        errorMessage: null,
        retryCount: attempt,
      };
    } catch (err) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      lastError = err instanceof Error ? err.message : String(err);
      feedback = lastError;
    }
  }

  return {
    segmentId: options.segment.id,
    status: "failed",
    translatedTemplate: null,
    translatedPlain: null,
    errorMessage: lastError,
    retryCount: maxRetries + 1,
  };
}

export async function translateChapter(options: TranslateChapterOptions): Promise<SettledSegmentOutcome[]> {
  const targetLang = options.targetLanguage ?? "简体中文";
  const maxBatchChars = options.maxBatchChars ?? 2600;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 10));
  const maxSingleRetries = options.maxSingleRetries ?? 2;

  const sortedSegments = [...options.segments].sort((a, b) => a.orderIndex - b.orderIndex);
  const indexById = new Map(sortedSegments.map((s, idx) => [s.id, idx]));
  const translatedById = new Map<string, string>();
  for (const s of sortedSegments) {
    if (s.status === "translated" && s.translatedTemplate) {
      translatedById.set(s.id, s.translatedTemplate);
    }
  }

  const pending = sortedSegments.filter((s) => s.status !== "translated" && s.status !== "skipped");
  const batches = buildChapterBatches(pending, maxBatchChars);
  const outcomes: SettledSegmentOutcome[] = [];
  let cursor = 0;

  function getSlidingContext(firstSegId: string): Array<{ source: string; translation?: string }> {
    const idx = indexById.get(firstSegId) ?? 0;
    const start = Math.max(0, idx - 3);
    return sortedSegments.slice(start, idx).map((seg) => ({
      source: seg.sourcePlain,
      translation: translatedById.get(seg.id),
    }));
  }

  async function processBatch(batch: TranslatableSegmentInput[]) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    await options.onBatchStart?.(batch.map((s) => s.id));

    if (batch.length === 1) {
      const seg = batch[0];
      const outcome = await translateSingleSegment({
        provider: options.provider,
        bookTitle: options.bookTitle,
        chapterTitle: options.chapterTitle,
        chapterSummary: options.chapterSummary,
        targetLanguage: targetLang,
        segment: seg,
        priorContext: getSlidingContext(seg.id),
        glossary: options.glossary,
        maxRetries: maxSingleRetries,
        signal: options.signal,
      });
      if (outcome.status === "translated" && outcome.translatedTemplate) {
        translatedById.set(seg.id, outcome.translatedTemplate);
      }
      outcomes.push(outcome);
      await options.onSegmentSettled?.(outcome);
      return;
    }

    const combinedText = batch.map((s) => s.sourceTemplate).join("\n");
    const relevantGlossary = selectRelevantGlossary(options.glossary ?? [], combinedText);
    const systemPrompt = buildSystemPrompt(
      targetLang,
      options.bookTitle,
      options.chapterTitle,
      options.chapterSummary,
      relevantGlossary,
    );

    const priorContext = getSlidingContext(batch[0].id);
    const userSections: string[] = [];
    if (priorContext.length > 0) {
      userSections.push(
        "前文参考（仅作语境衔接，不要放入输出）：\n" +
          priorContext
            .map((c, i) => `(${i + 1}) ${c.source}${c.translation ? ` => ${c.translation}` : ""}`)
            .join("\n"),
      );
    }

    const payload = batch.map((s) => ({ id: s.id, text: s.sourceTemplate }));
    userSections.push(
      `请逐条翻译以下 ${batch.length} 个段落，保持每条的 id 不变且 100% 保留所有 [[I*]]/[[V*]] 占位符。` +
        `严格输出 JSON 对象：{"translations":[{"id":"...","text":"..."}]}\n\n` +
        JSON.stringify(payload, null, 2),
    );

    let failedSegments: TranslatableSegmentInput[] = [];

    try {
      const response = await options.provider.chatCompletion({
        jsonMode: true,
        signal: options.signal,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userSections.join("\n\n") },
        ],
      });

      const validation = parseAndValidateBatchResponse(
        response.content,
        batch.map((s) => ({ id: s.id, placeholders: s.placeholders })),
      );

      for (const seg of batch) {
        const validText = validation.valid.get(seg.id);
        if (validText) {
          translatedById.set(seg.id, validText);
          const outcome: SettledSegmentOutcome = {
            segmentId: seg.id,
            status: "translated",
            translatedTemplate: validText,
            translatedPlain: templateToPlainText(validText, seg.placeholders),
            errorMessage: null,
            retryCount: 0,
          };
          outcomes.push(outcome);
          await options.onSegmentSettled?.(outcome);
        } else {
          failedSegments.push(seg);
        }
      }
    } catch (err) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      // Whole batch failed -> degrade each segment in this batch to single-segment retry
      failedSegments = [...batch];
    }

    for (const seg of failedSegments) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const outcome = await translateSingleSegment({
        provider: options.provider,
        bookTitle: options.bookTitle,
        chapterTitle: options.chapterTitle,
        chapterSummary: options.chapterSummary,
        targetLanguage: targetLang,
        segment: seg,
        priorContext: getSlidingContext(seg.id),
        glossary: options.glossary,
        maxRetries: maxSingleRetries,
        signal: options.signal,
      });
      if (outcome.status === "translated" && outcome.translatedTemplate) {
        translatedById.set(seg.id, outcome.translatedTemplate);
      }
      outcomes.push(outcome);
      await options.onSegmentSettled?.(outcome);
    }
  }

  async function worker() {
    while (cursor < batches.length) {
      const idx = cursor;
      cursor += 1;
      await processBatch(batches[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, batches.length)) }, () => worker());
  await Promise.all(workers);

  return outcomes;
}

export async function translateMetadataAndToc(
  provider: TranslationProvider,
  input: {
    title: string;
    description?: string | null;
    chapters: Array<{ id: string; title: string }>;
    targetLanguage?: string;
  },
  signal?: AbortSignal,
): Promise<{
  translatedTitle?: string;
  translatedDescription?: string;
  chapterTitles: Map<string, string>;
}> {
  const targetLang = input.targetLanguage ?? "简体中文";
  const res = await provider.chatCompletion({
    jsonMode: true,
    temperature: 0.2,
    signal,
    messages: [
      {
        role: "system",
        content:
          `你是专业图书翻译助手。请将书籍标题、简介与章节目录标题翻译为地道${targetLang}。` +
          `严格输出 JSON：{"title":"...","description":"...","chapters":[{"id":"...","title":"..."}]}`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            title: input.title,
            description: input.description ?? "",
            chapters: input.chapters,
          },
          null,
          2,
        ),
      },
    ],
  });

  const parsed = parseMetadataTocResponse(res.content);
  const chapterTitles = new Map<string, string>();
  for (const ch of parsed.chapters) {
    if (ch.title.trim()) {
      chapterTitles.set(ch.id, ch.title.trim());
    }
  }

  return {
    translatedTitle: parsed.title?.trim() || undefined,
    translatedDescription: parsed.description?.trim() || undefined,
    chapterTitles,
  };
}
