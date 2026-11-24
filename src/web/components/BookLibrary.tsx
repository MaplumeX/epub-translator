import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  Pause,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { BookRecord, ProviderPresetPublic } from "../../core/types.js";
import {
  countBooksByFilter,
  filterAndSortBooks,
  formatFileSize,
  formatUpdatedAt,
  getBookProgressPercent,
  isBookActiveJob,
  isBookCompleted,
  type LibrarySortBy,
  type LibraryStatusFilter,
} from "../utils/library.js";

export interface BatchImportError {
  filename: string;
  message: string;
}

interface BookLibraryProps {
  books: BookRecord[];
  activeProvider: ProviderPresetPublic | null;
  loading: boolean;
  uploading: boolean;
  importProgress: { current: number; total: number } | null;
  importErrors: BatchImportError[];
  recentlyImportedIds: string[];
  errorMessage: string | null;
  onOpenBook: (bookId: string) => void;
  onUploadFiles: (files: File[]) => void;
  onPauseBook: (bookId: string) => void;
  onRequestExportBook: (bookId: string) => void;
  onRequestResetBook: (bookId: string) => void;
  onRequestDeleteBook: (bookId: string) => void;
  onRetryLoad: () => void;
  onDismissImportErrors: () => void;
  onOpenSettings: () => void;
}

function BookStatusBadge({ book }: { book: BookRecord }) {
  if (book.status === "translating") {
    return (
      <span className="badge badge-info">
        <Loader2 size={12} className="spin" aria-hidden="true" />
        <span>翻译中</span>
      </span>
    );
  }
  if (book.status === "prescanning") {
    return (
      <span className="badge badge-info">
        <Loader2 size={12} className="spin" aria-hidden="true" />
        <span>预扫描中</span>
      </span>
    );
  }
  if (isBookCompleted(book)) {
    return (
      <span className="badge badge-success">
        <CheckCircle2 size={12} aria-hidden="true" />
        <span>已完成</span>
      </span>
    );
  }
  if (book.status === "error") {
    return (
      <span className="badge badge-danger">
        <AlertCircle size={12} aria-hidden="true" />
        <span>已中断</span>
      </span>
    );
  }
  if (book.status === "paused" || book.translatedSegments > 0) {
    return (
      <span className="badge badge-warning">
        <Pause size={12} aria-hidden="true" />
        <span>已暂停</span>
      </span>
    );
  }
  return (
    <span className="badge badge-neutral">
      <Circle size={12} aria-hidden="true" />
      <span>待翻译</span>
    </span>
  );
}

const FILTER_LABELS: Array<{ key: LibraryStatusFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "in_progress", label: "进行中" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "有失败" },
];

export function BookLibrary({
  books,
  activeProvider,
  loading,
  uploading,
  importProgress,
  importErrors,
  recentlyImportedIds,
  errorMessage,
  onOpenBook,
  onUploadFiles,
  onPauseBook,
  onRequestExportBook,
  onRequestResetBook,
  onRequestDeleteBook,
  onRetryLoad,
  onDismissImportErrors,
  onOpenSettings,
}: BookLibraryProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>("all");
  const [sortBy, setSortBy] = useState<LibrarySortBy>("updated");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLocal = Boolean(activeProvider && /localhost|127\.0\.0\.1/.test(activeProvider.baseUrl));
  const apiReady = Boolean(activeProvider && (activeProvider.hasApiKey || isLocal));

  const filterCounts = useMemo(() => countBooksByFilter(books), [books]);
  const visibleBooks = useMemo(
    () => filterAndSortBooks(books, { query, statusFilter, sortBy }),
    [books, query, statusFilter, sortBy],
  );
  const recentSet = useMemo(() => new Set(recentlyImportedIds), [recentlyImportedIds]);

  function handleSelectedFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onUploadFiles(Array.from(fileList));
  }

  return (
    <section className="library-stage" aria-label="本地书库管理">
      <div className="library-column">
        {!apiReady && !loading && (
          <div className="api-readiness-banner is-warn" role="status">
            <div className="api-readiness-copy">
              <AlertTriangle size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>尚未配置可用的 API Key，请先在设置中填写密钥后再开始翻译</span>
            </div>
            <button type="button" className="btn btn-tertiary btn-sm" onClick={onOpenSettings}>
              <Settings size={14} aria-hidden="true" />
              <span>前往配置</span>
            </button>
          </div>
        )}

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

        {importErrors.length > 0 && (
          <div className="library-import-errors" role="alert">
            <div className="library-import-errors-head">
              <div className="global-error-copy">
                <AlertCircle size={15} aria-hidden="true" />
                <span>部分文件导入失败（{importErrors.length} 项）</span>
              </div>
              <button
                type="button"
                className="btn btn-tertiary btn-sm icon-btn"
                onClick={onDismissImportErrors}
                aria-label="关闭导入错误提示"
              >
                <X size={14} />
              </button>
            </div>
            <ul className="library-import-errors-list">
              {importErrors.map((err, idx) => (
                <li key={`${err.filename}-${idx}`}>
                  <strong>{err.filename}</strong>：{err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="library-header">
          <div className="library-heading-copy">
            <h1 className="library-title">本地书库</h1>
            <p className="library-subtitle">
              原书只读保存在本地 <code>data/</code> 目录，可随时校对、导出双语或纯译文 EPUB。
            </p>
          </div>
        </div>

        <div
          className={`library-dropstrip ${dragOver ? "is-drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleSelectedFiles(e.dataTransfer.files);
          }}
        >
          <div className="library-dropstrip-copy">
            <Upload size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>
              {uploading && importProgress
                ? `正在导入第 ${importProgress.current}/${importProgress.total} 本 EPUB…`
                : uploading
                  ? "正在解析 EPUB…"
                  : "拖入一个或多个 .epub 文件到此处，或点击选择继续导入"}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,application/epub+zip"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleSelectedFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <span>选择文件</span>
          </button>
        </div>

        <div className="library-toolbar">
          <div className="library-search-wrap">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              className="field-input library-search-input"
              placeholder="搜索书名、译名、作者或文件名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索书籍"
            />
            {query && (
              <button
                type="button"
                className="library-search-clear"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="library-toolbar-right">
            <div className="filter-tabs" role="tablist" aria-label="按状态筛选书籍">
              {FILTER_LABELS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.key}
                  className={`filter-tab ${statusFilter === tab.key ? "is-active" : ""}`}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label}
                  <span className="filter-tab-count tabular-nums">{filterCounts[tab.key]}</span>
                </button>
              ))}
            </div>

            <label htmlFor="library-sort" className="sr-only">
              书籍排序方式
            </label>
            <select
              id="library-sort"
              className="field-select library-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as LibrarySortBy)}
              aria-label="书籍排序方式"
            >
              <option value="updated">最近更新</option>
              <option value="title">按书名</option>
              <option value="progress">按翻译进度</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="library-skeleton-list" aria-busy="true" aria-label="正在加载书库">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel-card library-skel-row">
                <div className="skel skel-line-md" />
                <div className="skel skel-line-sm" />
                <div className="skel skel-line-lg" />
              </div>
            ))}
          </div>
        ) : visibleBooks.length === 0 ? (
          <div className="library-empty-filter">
            <BookOpen size={24} strokeWidth={1.6} aria-hidden="true" />
            <p className="library-empty-title">没有符合条件的书籍</p>
            <p className="library-empty-desc">
              当前搜索词或状态筛选下暂无匹配书目，可以清空条件查看全部 {books.length} 本书。
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              清除筛选条件
            </button>
          </div>
        ) : (
          <ul className="library-list">
            {visibleBooks.map((book) => {
              const pct = getBookProgressPercent(book);
              const activeJob = isBookActiveJob(book);
              const completed = isBookCompleted(book);
              const isRecent = recentSet.has(book.id);
              const primaryTitle = book.translatedTitle || book.title;

              return (
                <li
                  key={book.id}
                  className={`library-row ${isRecent ? "is-recent" : ""}`}
                >
                  <div className="library-row-main">
                    <div className="library-row-title-line">
                      <button
                        type="button"
                        className="library-row-title-btn"
                        onClick={() => onOpenBook(book.id)}
                        title={
                          book.translatedTitle
                            ? `${book.translatedTitle}（${book.title}）`
                            : book.title
                        }
                      >
                        {primaryTitle}
                      </button>
                      <BookStatusBadge book={book} />
                      {isRecent && <span className="badge badge-info">新导入</span>}
                    </div>

                    <div className="library-row-submeta">
                      {book.translatedTitle && (
                        <>
                          <span className="library-orig-title" title={book.title}>
                            {book.title}
                          </span>
                          <span className="library-dot" aria-hidden="true">
                            ·
                          </span>
                        </>
                      )}
                      <span>{book.author}</span>
                      <span className="library-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="library-filename" title={book.sourceFilename}>
                        {book.sourceFilename}
                      </span>
                    </div>

                    <div className="library-row-progress-row">
                      <div
                        className="library-progress-track"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${primaryTitle} 翻译进度 ${pct}%`}
                      >
                        <div
                          className={`library-progress-fill ${
                            completed ? "is-done" : book.status === "error" ? "is-error" : ""
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="library-row-metrics tabular-nums">
                        <span>
                          {book.translatedSegments}/{book.totalSegments} 段（{pct}%）
                        </span>
                        <span className="library-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{book.chapterCount} 章</span>
                        <span className="library-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{formatFileSize(book.fileSizeBytes)}</span>
                        <span className="library-dot" aria-hidden="true">
                          ·
                        </span>
                        <span title={book.updatedAt}>更新于 {formatUpdatedAt(book.updatedAt)}</span>
                        {book.failedSegments > 0 && (
                          <span className="badge badge-danger">
                            <AlertCircle size={11} aria-hidden="true" />
                            <span>{book.failedSegments} 段失败</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="library-row-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onOpenBook(book.id)}
                    >
                      <BookOpen size={13} aria-hidden="true" />
                      <span>打开校对</span>
                    </button>

                    {activeJob && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onPauseBook(book.id)}
                      >
                        <Pause size={13} aria-hidden="true" />
                        <span>暂停</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm"
                      onClick={() => onRequestExportBook(book.id)}
                      title={`导出《${primaryTitle}》`}
                    >
                      <Download size={13} aria-hidden="true" />
                      <span>导出</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm"
                      disabled={activeJob}
                      onClick={() => onRequestResetBook(book.id)}
                      title={activeJob ? "请先暂停当前任务再重置" : `重置《${primaryTitle}》译文`}
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                      <span>重置</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm"
                      onClick={() => onRequestDeleteBook(book.id)}
                      title={`删除《${primaryTitle}》`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>删除</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
