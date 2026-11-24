import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Info, RefreshCw, Trash2, Type } from "lucide-react";
import type {
  BookRecord,
  ChapterDocumentNode,
  ChapterRecord,
  OutputMode,
  SegmentRecord,
} from "../../core/types.js";
import { ChapterDocumentView } from "./ChapterDocumentView.js";
import { SegmentBlock } from "./SegmentBlock.js";

interface ChapterReaderProps {
  book: BookRecord;
  chapter: ChapterRecord | null;
  nodes: ChapterDocumentNode[];
  segments: SegmentRecord[];
  placeholderNodes: Record<string, Record<string, ChapterDocumentNode[]>>;
  docFallback: boolean;
  filter: "all" | "failed";
  loading: boolean;
  errorMessage: string | null;
  outputMode: OutputMode;
  highlightedDomPath: string | null;
  pendingAnchorHash: string | null;
  onClearPendingAnchor: () => void;
  onChangeFilter: (filter: "all" | "failed") => void;
  onLocateSegment: (domPath: string) => void;
  onNavigateChapter: (chapterHref: string, hash?: string) => void;
  onRetryLoad: () => void;
  onSaveSegment: (segmentId: string, translatedTemplate: string) => Promise<void>;
  onRetranslateSegment: (segmentId: string, instruction?: string) => Promise<void>;
  onRequestResetBook: () => void;
  onRequestDeleteBook: () => void;
}

export function ChapterReader({
  book,
  chapter,
  nodes,
  segments,
  placeholderNodes,
  docFallback,
  filter,
  loading,
  errorMessage,
  outputMode,
  highlightedDomPath,
  pendingAnchorHash,
  onClearPendingAnchor,
  onChangeFilter,
  onLocateSegment,
  onNavigateChapter,
  onRetryLoad,
  onSaveSegment,
  onRetranslateSegment,
  onRequestResetBook,
  onRequestDeleteBook,
}: ChapterReaderProps) {
  const [useSerif, setUseSerif] = useState(false);
  const paneRef = useRef<HTMLDivElement | null>(null);

  function scrollToElementId(hash: string) {
    const container = paneRef.current;
    if (!container || !hash) return;
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(hash)
      : hash.replace(/["\\]/g, "\\$&");
    const target = container.querySelector<HTMLElement>(`#${escaped}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-anchor-flash");
    window.setTimeout(() => {
      target.classList.remove("is-anchor-flash");
    }, 1600);
  }

  // Scroll to highlighted segment after returning from failed-list triage
  useEffect(() => {
    if (!highlightedDomPath || filter !== "all" || loading) return;
    const container = paneRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-dom-path="${highlightedDomPath.replace(/"/g, '\\"')}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedDomPath, filter, loading]);

  // Scroll to pending cross-chapter anchor after target chapter finishes loading
  useEffect(() => {
    if (!pendingAnchorHash || loading) return;
    scrollToElementId(pendingAnchorHash);
    onClearPendingAnchor();
  }, [pendingAnchorHash, loading, onClearPendingAnchor]);

  const failedSegments = segments.filter((s) => s.status === "failed");

  return (
    <div className="reader-scroll-pane" ref={paneRef}>
      <div className="reader-column">
        {errorMessage && (
          <div className="global-error-banner" role="alert">
            <div className="global-error-copy">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryLoad}>
              <RefreshCw size={13} aria-hidden="true" />
              <span>重试</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="reader-skeleton" aria-busy="true" aria-label="正在加载章节内容">
            <div className="skel skel-title" />
            <div className="skel skel-subtitle" />
            <div className="skel-sheet">
              <div className="skel skel-heading" />
              <div className="skel skel-line-lg" />
              <div className="skel skel-line-lg" />
              <div className="skel skel-line-md" />
              <div className="skel skel-spacer" />
              <div className="skel skel-line-lg" />
              <div className="skel skel-line-lg" />
              <div className="skel skel-line-sm" />
            </div>
          </div>
        ) : !chapter ? (
          <div className="reader-empty-chapter">
            <FileText size={24} aria-hidden="true" />
            <p>该 EPUB 未包含可翻译的正文章节。</p>
          </div>
        ) : (
          <>
            <header className="chapter-header">
              <div className="chapter-header-top">
                <span className="chapter-eyebrow tabular-nums">
                  第 {chapter.orderIndex + 1} 章 · {book.author}
                </span>
                <div className="chapter-header-utils">
                  <button
                    type="button"
                    className={`btn btn-tertiary btn-sm ${useSerif ? "is-toggled" : ""}`}
                    onClick={() => setUseSerif((v) => !v)}
                    title="切换中文译文衬线/无衬线字体"
                  >
                    <Type size={13} aria-hidden="true" />
                    <span>{useSerif ? "衬线体" : "无衬线"}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    onClick={onRequestResetBook}
                  >
                    重置译文
                  </button>
                  <button
                    type="button"
                    className="btn btn-tertiary btn-sm"
                    onClick={onRequestDeleteBook}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    <span>删除本书</span>
                  </button>
                </div>
              </div>

              <h2 className="chapter-title">{chapter.translatedTitle || chapter.title}</h2>
              {chapter.translatedTitle && (
                <p className="chapter-original-title">{chapter.title}</p>
              )}

              {chapter.summary && (
                <p className="chapter-summary-note">
                  <strong>本章摘要：</strong>
                  {chapter.summary}
                </p>
              )}

              <div className="chapter-filter-bar">
                <div className="filter-tabs" role="tablist" aria-label="章节视图筛选">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === "all"}
                    className={`filter-tab ${filter === "all" ? "is-active" : ""}`}
                    onClick={() => onChangeFilter("all")}
                  >
                    全部内容（{chapter.totalSegments}）
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === "failed"}
                    className={`filter-tab ${filter === "failed" ? "is-active" : ""}`}
                    onClick={() => onChangeFilter("failed")}
                  >
                    仅看失败（{chapter.failedSegments}）
                  </button>
                </div>
              </div>
            </header>

            {docFallback && filter === "all" && (
              <div className="doc-fallback-notice" role="status">
                <Info size={14} aria-hidden="true" />
                <span>未找到原始 EPUB 章节文件，已降级为连续段落流预览。</span>
              </div>
            )}

            {filter === "failed" ? (
              failedSegments.length === 0 ? (
                <div className="reader-empty-chapter">
                  <p>
                    {errorMessage
                      ? "未能加载章节段落，请点击上方「重试」恢复连接。"
                      : "本章目前没有失败段落。"}
                  </p>
                </div>
              ) : (
                <div className="failed-triage-list">
                  {failedSegments.map((seg) => (
                    <SegmentBlock
                      key={seg.id}
                      segment={seg}
                      voidNodes={placeholderNodes[seg.domPath]}
                      chapterHref={chapter.href}
                      outputMode={outputMode}
                      useSerif={useSerif}
                      variant="failed-list"
                      onSaveEdit={onSaveSegment}
                      onRetranslate={onRetranslateSegment}
                      onLocateInSheet={onLocateSegment}
                      onAnchorClick={scrollToElementId}
                      onNavigateChapter={onNavigateChapter}
                    />
                  ))}
                </div>
              )
            ) : nodes.length === 0 && segments.length === 0 ? (
              <div className="reader-empty-chapter">
                <p>
                  {errorMessage
                    ? "未能加载章节内容，请点击上方「重试」恢复连接。"
                    : "本章暂无可展示内容。"}
                </p>
              </div>
            ) : (
              <ChapterDocumentView
                nodes={nodes}
                segments={segments}
                placeholderNodes={placeholderNodes}
                chapterHref={chapter.href}
                outputMode={outputMode}
                useSerif={useSerif}
                highlightedDomPath={highlightedDomPath}
                onSaveSegment={onSaveSegment}
                onRetranslateSegment={onRetranslateSegment}
                onAnchorClick={scrollToElementId}
                onNavigateChapter={onNavigateChapter}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
