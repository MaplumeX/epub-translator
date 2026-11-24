import type {
  BookRecord,
  ChapterDocumentNode,
  ChapterRecord,
  GlossaryTerm,
  ProviderPresetPublic,
  SegmentRecord,
} from "../core/types.js";

export type PreviewStateMode = "default" | "empty" | "loading" | "error";

export function detectPreviewState(): PreviewStateMode | null {
  if (typeof window === "undefined") return null;
  const states = new URLSearchParams(window.location.search).getAll("state");
  const last = states[states.length - 1];
  if (last === "default" || last === "empty" || last === "loading" || last === "error") {
    return last;
  }
  return null;
}

export const PREVIEW_PROVIDERS: ProviderPresetPublic[] = [
  {
    id: "preset-deepseek",
    name: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    concurrency: 4,
    maxBatchChars: 2600,
    temperature: 0.3,
    isActive: true,
    hasApiKey: true,
    apiKeyMasked: "sk-9a••••f21c",
    createdAt: "2026-11-24T08:00:00.000Z",
    updatedAt: "2026-11-24T08:00:00.000Z",
  },
  {
    id: "preset-openai",
    name: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    concurrency: 4,
    maxBatchChars: 2600,
    temperature: 0.3,
    isActive: false,
    hasApiKey: false,
    apiKeyMasked: "",
    createdAt: "2026-11-24T08:00:00.000Z",
    updatedAt: "2026-11-24T08:00:00.000Z",
  },
  {
    id: "preset-ollama",
    name: "Ollama（本地）",
    kind: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen2.5:14b",
    concurrency: 2,
    maxBatchChars: 2200,
    temperature: 0.3,
    isActive: false,
    hasApiKey: true,
    apiKeyMasked: "••••",
    createdAt: "2026-11-24T08:00:00.000Z",
    updatedAt: "2026-11-24T08:00:00.000Z",
  },
];

export const PREVIEW_BOOKS: BookRecord[] = [
  {
    id: "preview-book-1",
    title: "The Craft of Reliable Systems",
    translatedTitle: "可靠系统的工程技艺",
    author: "Elena Vance",
    sourceLanguage: "en",
    targetLanguage: "简体中文",
    description: "Practical notes on consensus, storage engines, and lucid engineering prose.",
    translatedDescription: "关于共识算法、存储引擎与清晰工程写作的实践手记。",
    epubVersion: "3",
    opfPath: "OEBPS/content.opf",
    tocNcxPath: "OEBPS/toc.ncx",
    navXhtmlPath: "OEBPS/nav.xhtml",
    sourceFilename: "craft-of-reliable-systems.epub",
    fileSizeBytes: 1_842_300,
    status: "paused",
    outputMode: "bilingual",
    prescanEnabled: true,
    prescanCompleted: true,
    totalSegments: 48,
    translatedSegments: 31,
    failedSegments: 1,
    createdAt: "2026-11-24T07:30:00.000Z",
    updatedAt: "2026-11-24T08:12:00.000Z",
  },
];

export const PREVIEW_CHAPTERS: ChapterRecord[] = [
  {
    id: "preview-ch-0",
    bookId: "preview-book-1",
    orderIndex: 0,
    spineId: "ch01",
    href: "OEBPS/text/ch01.xhtml",
    title: "Chapter 1: Log-Structured Foundations",
    translatedTitle: "第 1 章：日志结构基础",
    summary: "介绍追加写日志如何简化崩溃恢复，并引入 WAL 与 Compaction 等核心术语。",
    totalSegments: 14,
    translatedSegments: 14,
    failedSegments: 0,
    status: "completed",
  },
  {
    id: "preview-ch-1",
    bookId: "preview-book-1",
    orderIndex: 1,
    spineId: "ch02",
    href: "OEBPS/text/ch02.xhtml",
    title: "Chapter 2: Quorum Replication & Consensus Boundaries Under Partial Network Partitions",
    translatedTitle: "第 2 章：局部网络分区下的法定人数复制与共识边界",
    summary: "探讨多数派写入在脑裂场景下的安全不变量，以及 Raft 任期号如何防止过期领导者污染状态机。",
    totalSegments: 16,
    translatedSegments: 12,
    failedSegments: 1,
    status: "partial",
  },
  {
    id: "preview-ch-2",
    bookId: "preview-book-1",
    orderIndex: 2,
    spineId: "ch03",
    href: "OEBPS/text/ch03.xhtml",
    title: "Chapter 3: Backpressure and Flow Control",
    translatedTitle: "第 3 章：背压与流量控制",
    summary: "分析有界队列与自适应限流如何防止级联超时。",
    totalSegments: 10,
    translatedSegments: 5,
    failedSegments: 0,
    status: "partial",
  },
  {
    id: "preview-ch-3",
    bookId: "preview-book-1",
    orderIndex: 3,
    spineId: "ch04",
    href: "OEBPS/text/ch04.xhtml",
    title: "Appendix A: Verification Checklist",
    translatedTitle: null,
    summary: null,
    totalSegments: 8,
    translatedSegments: 0,
    failedSegments: 0,
    status: "pending",
  },
];

export const PREVIEW_SEGMENTS: SegmentRecord[] = [
  {
    id: "preview-seg-0",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 0,
    domPath: "seg-0",
    tagName: "h1",
    sourceTemplate: "Chapter 2: Quorum Replication & Consensus Boundaries",
    sourcePlain: "Chapter 2: Quorum Replication & Consensus Boundaries",
    sourceHtml: "Chapter 2: Quorum Replication &amp; Consensus Boundaries",
    placeholders: [],
    translatedTemplate: "第 2 章：法定人数复制与共识边界",
    translatedPlain: "第 2 章：法定人数复制与共识边界",
    status: "translated",
    errorMessage: null,
    retryCount: 0,
    updatedAt: "2026-11-24T08:10:00.000Z",
  },
  {
    id: "preview-seg-1",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 1,
    domPath: "seg-1",
    tagName: "p",
    sourceTemplate:
      "Every write enters the cluster through [[V1]], which appends an immutable entry before requesting acknowledgments from a [[I1]]strict majority[[/I1]] of replicas[[V2]].",
    sourcePlain:
      "Every write enters the cluster through `RaftNode.appendEntries()`, which appends an immutable entry before requesting acknowledgments from a strict majority of replicas[1].",
    sourceHtml:
      'Every write enters the cluster through <code>RaftNode.appendEntries()</code>, which appends an immutable entry before requesting acknowledgments from a <em>strict majority</em> of replicas<a epub:type="noteref" href="#fn1">[1]</a>.',
    placeholders: [
      { id: "V1", kind: "void", tagName: "code", rawHtml: "<code>RaftNode.appendEntries()</code>" },
      { id: "I1", kind: "paired", tagName: "em", openTag: "<em>", closeTag: "</em>" },
      { id: "V2", kind: "void", tagName: "a", rawHtml: '<a epub:type="noteref" href="#fn1">[1]</a>' },
    ],
    translatedTemplate:
      "每一次写入都会经由 [[V1]] 进入集群：节点先追加一条不可变日志，再向[[I1]]严格多数派[[/I1]]副本请求确认[[V2]]。",
    translatedPlain:
      "每一次写入都会经由 `RaftNode.appendEntries()` 进入集群：节点先追加一条不可变日志，再向严格多数派副本请求确认[1]。",
    status: "translated",
    errorMessage: null,
    retryCount: 0,
    updatedAt: "2026-11-24T08:11:00.000Z",
  },
  {
    id: "preview-seg-2",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 2,
    domPath: "seg-2",
    tagName: "p",
    sourceTemplate:
      "When an isolated leader continues serving reads without checking its lease, clients observe stale snapshots even though [[V1]] already advanced on the healthy partition.",
    sourcePlain:
      "When an isolated leader continues serving reads without checking its lease, clients observe stale snapshots even though `commitIndex` already advanced on the healthy partition.",
    sourceHtml:
      "When an isolated leader continues serving reads without checking its lease, clients observe stale snapshots even though <code>commitIndex</code> already advanced on the healthy partition.",
    placeholders: [{ id: "V1", kind: "void", tagName: "code", rawHtml: "<code>commitIndex</code>" }],
    translatedTemplate: null,
    translatedPlain: null,
    status: "failed",
    errorMessage: "缺少必需占位符 [[V1]]（已自动降级重试 2 次并保留原文，导出时不会破坏原排版）",
    retryCount: 2,
    updatedAt: "2026-11-24T08:11:30.000Z",
  },
  {
    id: "preview-seg-3",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 3,
    domPath: "seg-3",
    tagName: "p",
    sourceTemplate:
      "Rather than chasing zero-latency illusions, resilient systems make coordination costs explicit so operators can reason about tail latency during failover.",
    sourcePlain:
      "Rather than chasing zero-latency illusions, resilient systems make coordination costs explicit so operators can reason about tail latency during failover.",
    sourceHtml:
      "Rather than chasing zero-latency illusions, resilient systems make coordination costs explicit so operators can reason about tail latency during failover.",
    placeholders: [],
    translatedTemplate:
      "与其追逐零延迟的幻觉，高韧性系统宁可将协调开销显式呈现，让运维人员在故障切换期间清晰推演尾部延迟的变化。",
    translatedPlain:
      "与其追逐零延迟的幻觉，高韧性系统宁可将协调开销显式呈现，让运维人员在故障切换期间清晰推演尾部延迟的变化。",
    status: "translated",
    errorMessage: null,
    retryCount: 0,
    updatedAt: "2026-11-24T08:12:00.000Z",
  },
  {
    id: "preview-seg-4",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 4,
    domPath: "seg-4",
    tagName: "p",
    sourceTemplate:
      "In the next section we formalize read-index leases and examine how monotonic clocks bound uncertainty across commodity servers.",
    sourcePlain:
      "In the next section we formalize read-index leases and examine how monotonic clocks bound uncertainty across commodity servers.",
    sourceHtml:
      "In the next section we formalize read-index leases and examine how monotonic clocks bound uncertainty across commodity servers.",
    placeholders: [],
    translatedTemplate: null,
    translatedPlain: null,
    status: "pending",
    errorMessage: null,
    retryCount: 0,
    updatedAt: "2026-11-24T08:12:00.000Z",
  },
  {
    id: "preview-seg-5",
    bookId: "preview-book-1",
    chapterId: "preview-ch-1",
    orderIndex: 5,
    domPath: "seg-5",
    tagName: "p",
    sourceTemplate:
      "[1] Quorum intersection guarantees that any two majority subsets share at least one voting replica.",
    sourcePlain:
      "[1] Quorum intersection guarantees that any two majority subsets share at least one voting replica.",
    sourceHtml:
      "[1] Quorum intersection guarantees that any two majority subsets share at least one voting replica.",
    placeholders: [],
    translatedTemplate:
      "[1] 法定人数交集性质保证任意两个多数派子集至少共享一个具有投票权的副本。",
    translatedPlain:
      "[1] 法定人数交集性质保证任意两个多数派子集至少共享一个具有投票权的副本。",
    status: "translated",
    errorMessage: null,
    retryCount: 0,
    updatedAt: "2026-11-24T08:12:15.000Z",
  },
];

export const PREVIEW_PLACEHOLDER_NODES: Record<string, Record<string, ChapterDocumentNode[]>> = {
  "seg-1": {
    V1: [
      {
        kind: "element",
        tagName: "code",
        children: [{ kind: "text", text: "RaftNode.appendEntries()" }],
      },
    ],
    V2: [
      {
        kind: "element",
        tagName: "a",
        attrs: { "data-noteref": "true" },
        link: { kind: "anchor", href: "#fn1", hash: "fn1" },
        children: [{ kind: "text", text: "[1]" }],
      },
    ],
  },
  "seg-2": {
    V1: [
      {
        kind: "element",
        tagName: "code",
        children: [{ kind: "text", text: "commitIndex" }],
      },
    ],
  },
};

export const PREVIEW_CHAPTER_NODES: ChapterDocumentNode[] = [
  { kind: "segment", domPath: "seg-0", tagName: "h1", id: "ch2-top" },
  { kind: "segment", domPath: "seg-1", tagName: "p" },
  {
    kind: "element",
    tagName: "figure",
    children: [
      {
        kind: "element",
        tagName: "svg",
        attrs: {
          viewBox: "0 0 560 118",
          width: "560",
          height: "118",
        },
        children: [
          {
            kind: "element",
            tagName: "rect",
            attrs: {
              x: "16",
              y: "24",
              width: "136",
              height: "56",
              rx: "8",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "1.5",
              opacity: "0.45",
            },
            children: [],
          },
          {
            kind: "element",
            tagName: "text",
            attrs: { x: "84", y: "57", textAnchor: "middle", fontSize: "13", fill: "currentColor" },
            children: [{ kind: "text", text: "Leader Log" }],
          },
          {
            kind: "element",
            tagName: "line",
            attrs: {
              x1: "152",
              y1: "52",
              x2: "212",
              y2: "52",
              stroke: "currentColor",
              strokeWidth: "1.5",
              opacity: "0.45",
            },
            children: [],
          },
          {
            kind: "element",
            tagName: "rect",
            attrs: {
              x: "212",
              y: "24",
              width: "136",
              height: "56",
              rx: "8",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "1.5",
              opacity: "0.7",
            },
            children: [],
          },
          {
            kind: "element",
            tagName: "text",
            attrs: { x: "280", y: "57", textAnchor: "middle", fontSize: "13", fill: "currentColor" },
            children: [{ kind: "text", text: "Quorum ACK" }],
          },
          {
            kind: "element",
            tagName: "line",
            attrs: {
              x1: "348",
              y1: "52",
              x2: "408",
              y2: "52",
              stroke: "currentColor",
              strokeWidth: "1.5",
              opacity: "0.45",
            },
            children: [],
          },
          {
            kind: "element",
            tagName: "rect",
            attrs: {
              x: "408",
              y: "24",
              width: "136",
              height: "56",
              rx: "8",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "1.5",
              opacity: "0.45",
            },
            children: [],
          },
          {
            kind: "element",
            tagName: "text",
            attrs: { x: "476", y: "57", textAnchor: "middle", fontSize: "13", fill: "currentColor" },
            children: [{ kind: "text", text: "Commit Index" }],
          },
        ],
      },
      {
        kind: "element",
        tagName: "figcaption",
        children: [{ kind: "text", text: "Figure 2.1 — Majority acknowledgment before advancing commitIndex" }],
      },
    ],
  },
  {
    kind: "element",
    tagName: "pre",
    children: [
      {
        kind: "element",
        tagName: "code",
        children: [
          {
            kind: "text",
            text: "if (acks.count >= Math.floor(cluster.size / 2) + 1) {\n  raft.commitIndex = Math.max(raft.commitIndex, entry.index);\n}",
          },
        ],
      },
    ],
  },
  { kind: "segment", domPath: "seg-2", tagName: "p" },
  {
    kind: "element",
    tagName: "blockquote",
    children: [{ kind: "segment", domPath: "seg-3", tagName: "p" }],
  },
  { kind: "segment", domPath: "seg-4", tagName: "p" },
  { kind: "element", tagName: "hr", children: [] },
  {
    kind: "element",
    tagName: "aside",
    attrs: { id: "fn1" },
    children: [{ kind: "segment", domPath: "seg-5", tagName: "p" }],
  },
];

export const PREVIEW_GLOSSARY: GlossaryTerm[] = [
  {
    id: "term-1",
    bookId: "preview-book-1",
    sourceTerm: "Quorum",
    targetTerm: "法定人数",
    note: "分布式共识术语",
    origin: "prescan",
    createdAt: "2026-11-24T07:40:00.000Z",
    updatedAt: "2026-11-24T07:40:00.000Z",
  },
  {
    id: "term-2",
    bookId: "preview-book-1",
    sourceTerm: "Write-Ahead Log",
    targetTerm: "预写式日志（WAL）",
    note: "存储引擎术语",
    origin: "manual",
    createdAt: "2026-11-24T07:45:00.000Z",
    updatedAt: "2026-11-24T07:45:00.000Z",
  },
  {
    id: "term-3",
    bookId: "preview-book-1",
    sourceTerm: "Compaction",
    targetTerm: "日志压缩合并",
    note: "LSM-Tree 后台操作",
    origin: "prescan",
    createdAt: "2026-11-24T07:46:00.000Z",
    updatedAt: "2026-11-24T07:46:00.000Z",
  },
];
