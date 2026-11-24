import {
  BookMarked,
  Download,
  Menu,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import type { BookRecord, OutputMode } from "../../core/types.js";

interface TopActionBarProps {
  book: BookRecord;
  glossaryCount: number;
  prescanBanner: string | null;
  onOpenMobileSidebar: () => void;
  onStartOrResume: () => void;
  onPause: () => void;
  onRetryFailed: () => void;
  onChangeOutputMode: (mode: OutputMode) => void;
  onOpenGlossary: () => void;
  onOpenExport: () => void;
}

export function TopActionBar({
  book,
  glossaryCount,
  prescanBanner,
  onOpenMobileSidebar,
  onStartOrResume,
  onPause,
  onRetryFailed,
  onChangeOutputMode,
  onOpenGlossary,
  onOpenExport,
}: TopActionBarProps) {
  const isBusy = book.status === "translating" || book.status === "prescanning";
  const isCompleted =
    book.totalSegments > 0 &&
    book.translatedSegments >= book.totalSegments &&
    book.failedSegments === 0 &&
    !isBusy;
  const pct =
    book.totalSegments > 0 ? Math.round((book.translatedSegments / book.totalSegments) * 100) : 0;

  return (
    <header className="top-action-bar">
      <div className="top-bar-left">
        <button
          type="button"
          className="btn btn-secondary btn-sm mobile-only"
          onClick={onOpenMobileSidebar}
          aria-label="打开章节目录"
        >
          <Menu size={15} aria-hidden="true" />
          <span>目录</span>
        </button>

        <div className="book-heading-group">
          <h1 className="book-heading-title" title={book.title}>
            {book.translatedTitle || book.title}
          </h1>
          <div className="book-heading-meta tabular-nums">
            <span>
              {book.translatedSegments}/{book.totalSegments} 段（{pct}%）
            </span>
            {book.failedSegments > 0 && (
              <span className="badge badge-danger">{book.failedSegments} 段失败</span>
            )}
            {prescanBanner && <span className="badge badge-info">{prescanBanner}</span>}
          </div>
        </div>
      </div>

      <div className="top-bar-actions">
        <div className="segmented-control" role="group" aria-label="预览与导出模式">
          <button
            type="button"
            className={`seg-btn ${book.outputMode === "bilingual" ? "is-active" : ""}`}
            onClick={() => onChangeOutputMode("bilingual")}
          >
            双语对照
          </button>
          <button
            type="button"
            className={`seg-btn ${book.outputMode === "translated_only" ? "is-active" : ""}`}
            onClick={() => onChangeOutputMode("translated_only")}
          >
            纯译文
          </button>
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenGlossary}>
          <BookMarked size={14} aria-hidden="true" />
          <span>术语与预扫描{glossaryCount > 0 ? ` (${glossaryCount})` : ""}</span>
        </button>

        {book.failedSegments > 0 && !isBusy && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetryFailed}>
            <RotateCcw size={14} aria-hidden="true" />
            <span>重试失败段</span>
          </button>
        )}

        {isBusy ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onPause}>
            <Pause size={14} aria-hidden="true" />
            <span>{book.status === "prescanning" ? "停止预扫描" : "暂停翻译"}</span>
          </button>
        ) : isCompleted ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenExport}>
            <Download size={14} aria-hidden="true" />
            <span>导出 EPUB</span>
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenExport}>
              <Download size={14} aria-hidden="true" />
              <span>导出</span>
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onStartOrResume}>
              <Play size={14} aria-hidden="true" />
              <span>{book.translatedSegments > 0 ? "继续翻译" : "开始翻译"}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
