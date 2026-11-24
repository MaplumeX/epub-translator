import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatCompletionRequest, TranslationProvider } from "../../src/core/translation/index.js";
import { createServerApp } from "../../src/server/app.js";
import { AppDatabase } from "../../src/server/db.js";
import { createSampleEpubBuffer } from "../fixtures/makeEpub.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epub-tr-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDeterministicProvider(): TranslationProvider {
  return {
    model: "mock-model",
    async chatCompletion(req: ChatCompletionRequest) {
      const sys = req.messages[0]?.content ?? "";
      const usr = req.messages[1]?.content ?? "";

      if (sys.includes("前期建档")) {
        return {
          content: JSON.stringify({
            summary: "本章介绍核心概念与基础不变量。",
            terms: [{ source: "RaftNode", target: "Raft 节点", note: "核心类" }],
          }),
        };
      }

      if (sys.includes("章节目录标题")) {
        const parsed = JSON.parse(usr) as { chapters: Array<{ id: string; title: string }> };
        return {
          content: JSON.stringify({
            title: "分布式系统之道",
            description: "简洁的可靠系统指南。",
            chapters: parsed.chapters.map((ch, i) => ({ id: ch.id, title: `第 ${i + 1} 章` })),
          }),
        };
      }

      // Batch or single segment translation preserving all placeholders verbatim
      const jsonStart = usr.indexOf("[");
      if (jsonStart !== -1 && usr.includes("请逐条翻译")) {
        const items = JSON.parse(usr.slice(jsonStart)) as Array<{ id: string; text: string }>;
        return {
          content: JSON.stringify({
            translations: items.map((item) => ({
              id: item.id,
              text: `【译】${item.text}`,
            })),
          }),
        };
      }

      const idMatch = usr.match(/\{"id":"([^"]+)"/);
      const id = idMatch?.[1] ?? "seg";
      const lines = usr.split("\n");
      const sourceLine = lines[lines.length - 1] ?? "";
      return {
        content: JSON.stringify({
          id,
          text: `【精译】${sourceLine}`,
        }),
      };
    },
    async testConnection() {
      return { ok: true, latencyMs: 4, model: "mock-model", message: "连接成功（OK）" };
    },
  };
}

describe("Local Hono API + node:sqlite persistence + job lifecycle", () => {
  it("completes import -> prescan -> translate -> edit/retranslate -> dual-mode export and survives restart recovery", async () => {
    const dataDir = makeTempDir();
    const db = new AppDatabase(dataDir);
    // Activate Ollama/mock preset with non-empty api key
    db.upsertProvider({
      id: "preset-openai",
      name: "Mock OpenAI",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "sk-mock-key-1234",
      model: "mock-model",
      concurrency: 2,
      isActive: true,
    });

    const { app, jobs } = createServerApp({
      db,
      providerFactory: () => createDeterministicProvider(),
    });

    // 1. Check provider masking & connectivity test
    const provRes = await app.request("/api/providers");
    expect(provRes.status).toBe(200);
    const provJson = (await provRes.json()) as { providers: Array<{ apiKeyMasked: string; apiKey?: string }> };
    expect(provJson.providers[0].apiKey).toBeUndefined();
    expect(provJson.providers[0].apiKeyMasked).toContain("••••");

    const testRes = await app.request("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "preset-openai" }),
    });
    expect(testRes.status).toBe(200);
    expect(((await testRes.json()) as { ok: boolean }).ok).toBe(true);

    // 2. Import sample EPUB
    const epubBuf = await createSampleEpubBuffer({ version: "3" });
    const form = new FormData();
    form.append("file", new File([new Uint8Array(epubBuf)], "systems.epub", { type: "application/epub+zip" }));
    const importRes = await app.request("/api/books/import", { method: "POST", body: form });
    expect(importRes.status).toBe(201);
    const imported = (await importRes.json()) as {
      book: { id: string; totalSegments: number };
      chapters: Array<{ id: string }>;
    };
    const bookId = imported.book.id;
    const ch1Id = imported.chapters[0].id;
    expect(imported.book.totalSegments).toBe(8);

    // 3. Enable 7C-Lite prescan & run translation via job manager (awaited deterministically)
    await app.request(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prescanEnabled: true }),
    });
    await jobs.startTranslation(bookId);

    const afterBook = db.getBook(bookId)!;
    expect(afterBook.status).toBe("completed");
    expect(afterBook.prescanCompleted).toBe(true);
    expect(afterBook.translatedSegments).toBe(8);
    expect(afterBook.failedSegments).toBe(0);
    expect(afterBook.translatedTitle).toBe("分布式系统之道");

    // Glossary populated by prescan
    const glossaryRes = await app.request(`/api/books/${bookId}/glossary`);
    const glossaryJson = (await glossaryRes.json()) as { terms: Array<{ sourceTerm: string }> };
    expect(glossaryJson.terms.some((t) => t.sourceTerm === "RaftNode")).toBe(true);

    // 4. Inline manual edit (rejects broken placeholder, accepts valid edit) & single-segment retranslate
    const segsRes = await app.request(`/api/books/${bookId}/chapters/${ch1Id}/segments`);
    const segsJson = (await segsRes.json()) as { segments: Array<{ id: string; sourceTemplate: string }> };
    const codeSeg = segsJson.segments[1];

    const badEdit = await app.request(`/api/books/${bookId}/segments/${codeSeg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translatedTemplate: "删掉占位符的编辑" }),
    });
    expect(badEdit.status).toBe(400);

    const retranslateRes = await app.request(`/api/books/${bookId}/segments/${codeSeg.id}/retranslate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "更精炼" }),
    });
    expect(retranslateRes.status).toBe(200);
    const retranslated = (await retranslateRes.json()) as { segment: { translatedTemplate: string } };
    expect(retranslated.segment.translatedTemplate).toContain("【精译】");

    // 5. Export both bilingual & translated_only EPUBs
    const biRes = await app.request(`/api/books/${bookId}/export?mode=bilingual`);
    expect(biRes.status).toBe(200);
    expect(biRes.headers.get("content-type")).toBe("application/epub+zip");
    const biZip = await JSZip.loadAsync(Buffer.from(await biRes.arrayBuffer()));
    expect(biZip.file("OEBPS/epub-translator-bilingual.css")).not.toBeNull();
    const biCh1 = await biZip.file("OEBPS/text/chapter1.xhtml")!.async("string");
    expect(biCh1).toContain("【精译】");

    const zhRes = await app.request(`/api/books/${bookId}/export?mode=translated_only`);
    expect(zhRes.status).toBe(200);
    const zhZip = await JSZip.loadAsync(Buffer.from(await zhRes.arrayBuffer()));
    expect(zhZip.file("OEBPS/epub-translator-bilingual.css")).toBeNull();

    // 6. Simulate crash recovery on restart: stale 'translating' resets cleanly to 'pending'
    db.markSegmentsTranslating([segsJson.segments[0].id]);
    db.updateBookSettings(bookId, { status: "translating" });
    db.close();

    const reopened = new AppDatabase(dataDir);
    expect(reopened.getBook(bookId)!.status).toBe("paused");
    expect(reopened.getSegment(segsJson.segments[0].id)!.status).toBe("pending");
    reopened.close();
  });
});
