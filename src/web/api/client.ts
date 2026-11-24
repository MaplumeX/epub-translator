import type {
  BookRecord,
  ChapterRecord,
  GlossaryTerm,
  OutputMode,
  ProviderPresetPublic,
  SegmentRecord,
} from "../../core/types.js";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

export const api = {
  listBooks(): Promise<{ books: BookRecord[] }> {
    return requestJson("/api/books");
  },

  async importEpub(file: File): Promise<{ book: BookRecord; chapters: ChapterRecord[] }> {
    const form = new FormData();
    form.append("file", file);
    return requestJson("/api/books/import", { method: "POST", body: form });
  },

  getBook(bookId: string): Promise<{ book: BookRecord; chapters: ChapterRecord[] }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}`);
  },

  updateBook(
    bookId: string,
    patch: { outputMode?: OutputMode; prescanEnabled?: boolean },
  ): Promise<{ book: BookRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteBook(bookId: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
  },

  listSegments(
    bookId: string,
    chapterId: string,
    filter: "all" | "failed" = "all",
  ): Promise<{ chapter: ChapterRecord; segments: SegmentRecord[] }> {
    return requestJson(
      `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterId)}/segments?filter=${filter}`,
    );
  },

  editSegment(
    bookId: string,
    segmentId: string,
    translatedTemplate: string,
  ): Promise<{ segment: SegmentRecord; book: BookRecord; chapter: ChapterRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/segments/${encodeURIComponent(segmentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ translatedTemplate }),
    });
  },

  retranslateSegment(
    bookId: string,
    segmentId: string,
    instruction?: string,
  ): Promise<{ segment: SegmentRecord; book: BookRecord; chapter: ChapterRecord }> {
    return requestJson(
      `/api/books/${encodeURIComponent(bookId)}/segments/${encodeURIComponent(segmentId)}/retranslate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction?.trim() || undefined }),
      },
    );
  },

  startPrescan(bookId: string): Promise<{ started: boolean; book: BookRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/prescan/start`, { method: "POST" });
  },

  stopPrescan(bookId: string): Promise<{ stopped: boolean; book: BookRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/prescan/stop`, { method: "POST" });
  },

  startTranslation(
    bookId: string,
    options: { retryFailed?: boolean; skipPrescan?: boolean } = {},
  ): Promise<{ started: boolean; book: BookRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/translate/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
  },

  pauseTranslation(bookId: string): Promise<{ paused: boolean; book: BookRecord }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/translate/pause`, { method: "POST" });
  },

  resetTranslations(bookId: string): Promise<{ reset: boolean; book: BookRecord; chapters: ChapterRecord[] }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/translate/reset`, { method: "POST" });
  },

  getExportUrl(bookId: string, mode: OutputMode): string {
    return `/api/books/${encodeURIComponent(bookId)}/export?mode=${encodeURIComponent(mode)}`;
  },

  listGlossary(bookId: string): Promise<{ terms: GlossaryTerm[] }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/glossary`);
  },

  addGlossaryTerm(
    bookId: string,
    input: { sourceTerm: string; targetTerm: string; note?: string },
  ): Promise<{ term: GlossaryTerm }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/glossary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  updateGlossaryTerm(
    bookId: string,
    termId: string,
    patch: { sourceTerm?: string; targetTerm?: string; note?: string },
  ): Promise<{ term: GlossaryTerm }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/glossary/${encodeURIComponent(termId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  deleteGlossaryTerm(bookId: string, termId: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/books/${encodeURIComponent(bookId)}/glossary/${encodeURIComponent(termId)}`, {
      method: "DELETE",
    });
  },

  listProviders(): Promise<{ providers: ProviderPresetPublic[] }> {
    return requestJson("/api/providers");
  },

  createProvider(input: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    concurrency?: number;
    maxBatchChars?: number;
    temperature?: number;
    isActive?: boolean;
  }): Promise<{ provider: ProviderPresetPublic }> {
    return requestJson("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  updateProvider(
    id: string,
    patch: {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      concurrency?: number;
      maxBatchChars?: number;
      temperature?: number;
      isActive?: boolean;
    },
  ): Promise<{ provider: ProviderPresetPublic }> {
    return requestJson(`/api/providers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  activateProvider(id: string): Promise<{ provider: ProviderPresetPublic }> {
    return requestJson(`/api/providers/${encodeURIComponent(id)}/activate`, { method: "POST" });
  },

  deleteProvider(id: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  testProvider(input: {
    id?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }): Promise<{ ok: boolean; latencyMs: number; model: string; message: string }> {
    return requestJson("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },
};
