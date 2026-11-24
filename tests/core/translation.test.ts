import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleProvider,
  runWholeBookPrescan,
  translateChapter,
  translateSingleSegment,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type TranslationProvider,
} from "../../src/core/translation/index.js";
import type { InlinePlaceholder } from "../../src/core/types.js";

function createMockProvider(
  handler: (req: ChatCompletionRequest, callIndex: number) => Promise<string> | string,
): TranslationProvider & { calls: ChatCompletionRequest[] } {
  const calls: ChatCompletionRequest[] = [];
  return {
    model: "mock-gpt",
    calls,
    async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
      calls.push(req);
      const content = await handler(req, calls.length - 1);
      return { content };
    },
    async testConnection() {
      return { ok: true, latencyMs: 5, model: "mock-gpt", message: "ok" };
    },
  };
}

const samplePlaceholders: InlinePlaceholder[] = [
  { id: "V1", kind: "void", tagName: "code", rawHtml: "<code>appendEntries()</code>" },
  { id: "I1", kind: "paired", tagName: "em", openTag: "<em>", closeTag: "</em>" },
];

describe("7C-Lite translation pipeline, prescan, fallback retry, and provider backoff", () => {
  it("translates batches with sliding context and degrades only broken-placeholder segments to single retry", async () => {
    const provider = createMockProvider((req, idx) => {
      const userText = req.messages[1].content;
      if (idx === 0) {
        // Batch response where seg-2 intentionally drops [[V1]]
        return JSON.stringify({
          translations: [
            { id: "seg-1", text: "第一段正常译文。" },
            { id: "seg-2", text: "缺少代码占位符的坏译文 [[I1]]强调[[/I1]]。" },
          ],
        });
      }
      // Single-segment retry receives feedback about missing [[V1]]
      expect(userText).toContain("seg-2");
      return JSON.stringify({
        id: "seg-2",
        text: "调用 [[V1]] 时必须保持[[I1]]严格顺序[[/I1]]。",
      });
    });

    const settled: string[] = [];
    const outcomes = await translateChapter({
      provider,
      bookTitle: "Distributed Craft",
      chapterTitle: "Chapter 1",
      chapterSummary: "本章讨论日志复制不变量。",
      glossary: [{ sourceTerm: "appendEntries", targetTerm: "追加日志", note: "RPC" }],
      concurrency: 1,
      maxBatchChars: 2000,
      segments: [
        {
          id: "seg-1",
          orderIndex: 0,
          tagName: "p",
          sourceTemplate: "First clean paragraph.",
          sourcePlain: "First clean paragraph.",
          placeholders: [],
          status: "pending",
        },
        {
          id: "seg-2",
          orderIndex: 1,
          tagName: "p",
          sourceTemplate: "Call [[V1]] in [[I1]]strict order[[/I1]].",
          sourcePlain: "Call `appendEntries()` in strict order.",
          placeholders: samplePlaceholders,
          status: "pending",
        },
      ],
      onSegmentSettled(out) {
        settled.push(`${out.segmentId}:${out.status}`);
      },
    });

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0].messages[0].content).toContain("本章背景摘要：本章讨论日志复制不变量");
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((o) => o.segmentId === "seg-1")?.status).toBe("translated");
    expect(outcomes.find((o) => o.segmentId === "seg-2")?.translatedTemplate).toBe(
      "调用 [[V1]] 时必须保持[[I1]]严格顺序[[/I1]]。",
    );
    expect(settled).toEqual(["seg-1:translated", "seg-2:translated"]);
  });

  it("marks persistently invalid segments as failed without breaking remaining segments", async () => {
    const provider = createMockProvider(() =>
      JSON.stringify({ id: "seg-bad", text: "仍然丢失占位符的译文" }),
    );

    const outcome = await translateSingleSegment({
      provider,
      bookTitle: "Book",
      chapterTitle: "Ch 1",
      customInstruction: "更口语化一些",
      maxRetries: 1,
      segment: {
        id: "seg-bad",
        orderIndex: 0,
        tagName: "p",
        sourceTemplate: "Run [[V1]] carefully with [[I1]]care[[/I1]].",
        sourcePlain: "Run `appendEntries()` carefully with care.",
        placeholders: samplePlaceholders,
        status: "pending",
      },
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.errorMessage).toContain("[[V1]]");
    expect(provider.calls[0].messages[1].content).toContain("更口语化一些");
    expect(provider.calls[1].messages[1].content).toContain("上一次输出未通过校验");
  });

  it("runs optional whole-book prescan and deduplicates terms against existing glossary", async () => {
    const provider = createMockProvider((req) => {
      const prompt = req.messages[1].content;
      if (prompt.includes("Chapter 1")) {
        return "```json\n" +
          JSON.stringify({
            summary: "主角林克初抵铁炉城，与导师会合。",
            terms: [
              { source: "Ironforge", target: "铁炉城", note: "地名" },
              { source: "Link", target: "林克", note: "主角" },
            ],
          }) +
          "\n```";
      }
      return JSON.stringify({
        summary: "林克在铁炉城解开古代齿轮机关。",
        terms: [
          { source: "ironforge", target: "铁堡", note: "重复项应忽略" },
          { source: "Gearworks", target: "齿轮工坊", note: "组织" },
        ],
      });
    });

    const scannedOrder: string[] = [];
    const result = await runWholeBookPrescan({
      provider,
      bookTitle: "Chronicles",
      concurrency: 1,
      existingTerms: [{ sourceTerm: "Link", targetTerm: "林克（手动）" }],
      chapters: [
        { id: "ch-1", orderIndex: 0, title: "Chapter 1", plainSegments: ["Link arrived in Ironforge."] },
        { id: "ch-2", orderIndex: 1, title: "Chapter 2", plainSegments: ["Inside Ironforge Gearworks."] },
      ],
      onChapterScanned(res) {
        scannedOrder.push(res.chapterId);
      },
    });

    expect(scannedOrder).toEqual(["ch-1", "ch-2"]);
    expect(result.summaries.get("ch-1")).toContain("铁炉城");
    // "Link" existed manually; "ironforge" duplicate in ch-2 ignored -> only Ironforge + Gearworks added
    expect(result.addedTerms.map((t) => `${t.sourceTerm}=>${t.targetTerm}`)).toEqual([
      "Ironforge=>铁炉城",
      "Gearworks=>齿轮工坊",
    ]);
  });

  it("retries 429 rate-limit responses honoring Retry-After and stops immediately on AbortSignal", async () => {
    let attempts = 0;
    const mockFetch: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "OK" } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test",
      baseDelayMs: 1,
      fetchImpl: mockFetch,
    });

    const ping = await provider.testConnection();
    expect(ping.ok).toBe(true);
    expect(attempts).toBe(2);

    const ac = new AbortController();
    ac.abort();
    await expect(
      provider.chatCompletion({
        messages: [{ role: "user", content: "hi" }],
        signal: ac.signal,
      }),
    ).rejects.toThrow();
  });
});
