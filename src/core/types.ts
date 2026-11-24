// Keeping src/core free of React, Hono, and node:sqlite preserves standalone engine reuse (e.g. future CLI).
// See ADR 2026-11-24-epub-translator-architecture.

export type OutputMode = "bilingual" | "translated_only";

export type SegmentStatus = "pending" | "translating" | "translated" | "failed" | "skipped";

export type BookStatus = "idle" | "prescanning" | "translating" | "paused" | "completed" | "error";

export type ChapterStatus = "pending" | "translating" | "completed" | "partial" | "error";

export type PlaceholderKind = "paired" | "void";

export interface InlinePlaceholder {
  /** Marker token: e.g. "I1" for paired tags ([[I1]]...[[/I1]]) or "V1" for opaque payloads ([[V1]]) */
  id: string;
  kind: PlaceholderKind;
  /** Original tag name (lowercase), e.g. "em", "a", "code", "math", "svg", "sup" */
  tagName: string;
  /** Opening tag HTML with exact attributes for paired placeholders, e.g. `<a href="#fn1" epub:type="noteref">` */
  openTag?: string;
  /** Closing tag HTML for paired placeholders, e.g. `</a>` */
  closeTag?: string;
  /** Full verbatim outer HTML for void/opaque placeholders (`<code>...</code>`, `<math>...</math>`, `<br/>`, `<img .../>`) */
  rawHtml?: string;
}

export interface ExtractedSegment {
  /** Deterministic index within the chapter (0-based) */
  orderIndex: number;
  /** CSS/DOM locator key inside the chapter XHTML (e.g. "seg-0") */
  domPath: string;
  /** Original block tag name (e.g. "p", "h1", "li", "blockquote", "figcaption") */
  tagName: string;
  /** Plain-text + numbered placeholder template sent to the LLM */
  sourceTemplate: string;
  /** Human-readable plain text preview (without raw markup) */
  sourcePlain: string;
  /** Exact inner XHTML of the block before translation */
  sourceHtml: string;
  /** Protected inline fragments referenced by sourceTemplate */
  placeholders: InlinePlaceholder[];
}

export interface TocEntry {
  id: string;
  label: string;
  translatedLabel?: string;
  href: string;
  sourceFile: string;
  /** Position in NCX or Nav document */
  orderIndex: number;
}

export interface BookMetadata {
  title: string;
  translatedTitle?: string;
  author: string;
  language: string;
  description?: string;
  translatedDescription?: string;
  identifier?: string;
  epubVersion: "2" | "3";
  opfPath: string;
  tocNcxPath?: string;
  navXhtmlPath?: string;
}

export interface ParsedChapter {
  orderIndex: number;
  spineId: string;
  href: string;
  title: string;
  translatedTitle?: string;
  segments: ExtractedSegment[];
}

export interface ParsedEpub {
  metadata: BookMetadata;
  chapters: ParsedChapter[];
  toc: TocEntry[];
}

export interface GlossaryTerm {
  id: string;
  bookId: string;
  sourceTerm: string;
  targetTerm: string;
  note: string;
  origin: "manual" | "prescan";
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  chapterId: string;
  bookId: string;
  chapterOrder: number;
  summary: string;
  updatedAt: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  kind: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  concurrency: number;
  maxBatchChars: number;
  temperature: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPresetPublic extends Omit<ProviderPreset, "apiKey"> {
  hasApiKey: boolean;
  apiKeyMasked: string;
}

export interface BookRecord {
  id: string;
  title: string;
  translatedTitle: string | null;
  author: string;
  sourceLanguage: string;
  targetLanguage: string;
  description: string | null;
  translatedDescription: string | null;
  epubVersion: "2" | "3";
  opfPath: string;
  tocNcxPath: string | null;
  navXhtmlPath: string | null;
  sourceFilename: string;
  fileSizeBytes: number;
  status: BookStatus;
  outputMode: OutputMode;
  prescanEnabled: boolean;
  prescanCompleted: boolean;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRecord {
  id: string;
  bookId: string;
  orderIndex: number;
  spineId: string;
  href: string;
  title: string;
  translatedTitle: string | null;
  summary: string | null;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  status: ChapterStatus;
}

export interface SegmentRecord {
  id: string;
  bookId: string;
  chapterId: string;
  orderIndex: number;
  domPath: string;
  tagName: string;
  sourceTemplate: string;
  sourcePlain: string;
  sourceHtml: string;
  placeholders: InlinePlaceholder[];
  translatedTemplate: string | null;
  translatedPlain: string | null;
  status: SegmentStatus;
  errorMessage: string | null;
  retryCount: number;
  updatedAt: string;
}

export interface ChapterLinkMeta {
  kind: "anchor" | "chapter" | "external";
  href: string;
  chapterHref?: string;
  hash?: string;
}

export interface ChapterTextNode {
  kind: "text";
  text: string;
}

export interface ChapterElementNode {
  kind: "element";
  tagName: string;
  attrs?: Record<string, string>;
  link?: ChapterLinkMeta;
  children: ChapterDocumentNode[];
}

export interface ChapterSegmentNode {
  kind: "segment";
  domPath: string;
  tagName: string;
  id?: string;
  attrs?: Record<string, string>;
}

export type ChapterDocumentNode = ChapterTextNode | ChapterElementNode | ChapterSegmentNode;

export interface ChapterDocumentPayload {
  chapter: ChapterRecord;
  nodes: ChapterDocumentNode[];
  segments: SegmentRecord[];
  /** Sanitized AST nodes for each segment's void inline placeholders: domPath -> placeholderId -> nodes */
  placeholderNodes: Record<string, Record<string, ChapterDocumentNode[]>>;
  /** True when source.epub or the chapter XHTML was unavailable and nodes were synthesized from segments */
  fallback: boolean;
}

export interface PrescanProgressEvent {
  type: "prescan_progress";
  bookId: string;
  completedChapters: number;
  totalChapters: number;
  currentChapterTitle: string;
  termsAdded: number;
}

export interface TranslationProgressEvent {
  type: "segment_updated";
  bookId: string;
  chapterId: string;
  segment: SegmentRecord;
  bookStats: {
    totalSegments: number;
    translatedSegments: number;
    failedSegments: number;
    status: BookStatus;
  };
  chapterStats: {
    chapterId: string;
    totalSegments: number;
    translatedSegments: number;
    failedSegments: number;
    status: ChapterStatus;
  };
}

export interface BookStatusEvent {
  type: "book_status";
  bookId: string;
  status: BookStatus;
  message?: string;
  prescanCompleted?: boolean;
}

export type BookSseEvent = PrescanProgressEvent | TranslationProgressEvent | BookStatusEvent;
