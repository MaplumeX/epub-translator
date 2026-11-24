import type { TranslationProvider } from "./provider.js";
import { parsePrescanResponse } from "./validator.js";

export interface PrescanChapterInput {
  id: string;
  orderIndex: number;
  title: string;
  plainSegments: string[];
  alreadyScanned?: boolean;
}

export interface ExtractedTermCandidate {
  sourceTerm: string;
  targetTerm: string;
  note: string;
}

export interface PrescanChapterResult {
  chapterId: string;
  chapterTitle: string;
  summary: string;
  newTerms: ExtractedTermCandidate[];
}

export interface PrescanOptions {
  provider: TranslationProvider;
  bookTitle: string;
  targetLanguage?: string;
  chapters: PrescanChapterInput[];
  existingTerms?: Array<{ sourceTerm: string; targetTerm: string }>;
  concurrency?: number;
  maxCharsPerChapter?: number;
  signal?: AbortSignal;
  onChapterScanned?: (result: PrescanChapterResult, completed: number, total: number) => void | Promise<void>;
}

function sampleChapterText(segments: string[], maxChars: number): string {
  const joined = segments.join("\n\n");
  if (joined.length <= maxChars) return joined;
  const headBudget = Math.floor(maxChars * 0.65);
  const tailBudget = maxChars - headBudget;
  return `${joined.slice(0, headBudget)}\n\n[...]\n\n${joined.slice(-tailBudget)}`;
}

export async function runWholeBookPrescan(options: PrescanOptions): Promise<{
  summaries: Map<string, string>;
  addedTerms: ExtractedTermCandidate[];
}> {
  const targetLang = options.targetLanguage ?? "简体中文";
  const maxChars = options.maxCharsPerChapter ?? 6000;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 8));

  const seenTerms = new Set<string>(
    (options.existingTerms ?? []).map((t) => t.sourceTerm.trim().toLowerCase()),
  );
  const addedTerms: ExtractedTermCandidate[] = [];
  const summaries = new Map<string, string>();

  const pending = options.chapters.filter((ch) => !ch.alreadyScanned && ch.plainSegments.length > 0);
  const total = options.chapters.length;
  let completed = total - pending.length;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const idx = cursor;
      cursor += 1;
      const chapter = pending[idx];
      const sample = sampleChapterText(chapter.plainSegments, maxChars);

      const response = await options.provider.chatCompletion({
        jsonMode: true,
        temperature: 0.2,
        signal: options.signal,
        messages: [
          {
            role: "system",
            content:
              `你是专业图书翻译前期建档助手。请阅读提供的章节正文抽样，为翻译为「${targetLang}」做准备。\n` +
              `严格输出 JSON 对象：{"summary":"2句以内的精简中文剧情/内容摘要","terms":[{"source":"原文专有名词/人名/关键术语","target":"建议译名","note":"简短角色或术语说明"}]}\n` +
              `要求：仅提取高价值的人物名、地名、特定概念与专业术语（每章最多 12 条），忽略普通词汇。`,
          },
          {
            role: "user",
            content: `书名：${options.bookTitle}\n章节：${chapter.title}\n\n正文抽样：\n${sample}`,
          },
        ],
      });

      const parsed = parsePrescanResponse(response.content);
      summaries.set(chapter.id, parsed.summary);

      const chapterNewTerms: ExtractedTermCandidate[] = [];
      for (const t of parsed.terms) {
        const key = t.source.toLowerCase();
        if (seenTerms.has(key)) continue;
        seenTerms.add(key);
        const item: ExtractedTermCandidate = {
          sourceTerm: t.source,
          targetTerm: t.target,
          note: t.note,
        };
        chapterNewTerms.push(item);
        addedTerms.push(item);
      }

      completed += 1;
      await options.onChapterScanned?.(
        {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          summary: parsed.summary,
          newTerms: chapterNewTerms,
        },
        completed,
        total,
      );
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, () => worker());
  await Promise.all(workers);

  return { summaries, addedTerms };
}
