import { useState } from "react";
import { AlertTriangle, FileText, RefreshCw, Type } from "lucide-react";
import type { BookRecord, ChapterRecord, OutputMode, SegmentRecord } from "../../core/types.js";
import { SegmentCard } from "./SegmentCard.js";

interface ChapterReaderProps {
  book: BookRecord;
  chapter: ChapterRecord | null;
  segments: SegmentRecord[];
  filter: "all" | "failed";
  loading: boolean;
  errorMessage: string | null;
  outputMode: OutputMode;
  onChangeFilter: (filter: "all" | "failed") => void;
  onRetryLoad: () => void;
  onSaveSegment: (segmentId: string, translatedTemplate: string) => Promise<void>;
  onRetranslateSegment: (segmentId: string, instruction?: string) => Promise<void>;
}

export function ChapterReader({
  book,
  chapter,
  segments,
  filter,
  loading,
  errorMessage,
  outputMode,
  onChangeFilter,
  onRetryLoad,
  onSaveSegment,
  onRetranslateSegment,
}: ChapterReaderProps) {
  const [useSerif, setUseSerif] = useState(false);

  return (
    <div className="reader-scroll-pane">
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
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skel-card">
                <div className="skel skel-line-sm" />
                <div className="skel skel-line-lg" />
                <div className="skel skel-line-md" />
                <div className="skel skel-line-lg" />
              </div>
            ))}
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
                <div className="filter-tabs" role="tablist" aria-label="段落筛选">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === "all"}
                    className={`filter-tab ${filter === "all" ? "is-active" : ""}`}
                    onClick={() => onChangeFilter("all")}
                  >
                    全部段落（{chapter.totalSegments}）
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

            {segments.length === 0 ? (
              <div className="reader-empty-chapter">
                <p>
                  {errorMessage
                    ? "未能加载章节段落，请点击上方「重试」恢复连接。"
                    : filter === "failed"
                      ? "本章目前没有失败段落。"
                      : "本章暂无可翻译段落。"}
                </p>
              </div>
            ) : (
              <div className="segment-list">
                {segments.map((seg) => (
                  <SegmentCard
                    key={seg.id}
                    segment={seg}
                    outputMode={outputMode}
                    useSerif={useSerif}
                    onSaveEdit={onSaveSegment}
                    onRetranslate={onRetranslateSegment}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
