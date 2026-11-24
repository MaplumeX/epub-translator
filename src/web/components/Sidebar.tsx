import { useRef } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Settings,
  X,
} from "lucide-react";
import type { BookRecord, ChapterRecord, ProviderPresetPublic } from "../../core/types.js";
import type { ThemeMode } from "../hooks/useTheme.js";
import { ThemeToggle } from "./ThemeToggle.js";

interface SidebarProps {
  books: BookRecord[];
  activeBookId: string | null;
  chapters: ChapterRecord[];
  activeChapterId: string | null;
  activeProvider: ProviderPresetPublic | null;
  theme: ThemeMode;
  uploading: boolean;
  mobileOpen: boolean;
  onToggleTheme: () => void;
  onSelectBook: (bookId: string) => void;
  onSelectChapter: (chapterId: string) => void;
  onUploadFile: (file: File) => void;
  onOpenSettings: () => void;
  onCloseMobile: () => void;
}

function ChapterStatusIcon({ status }: { status: ChapterRecord["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="ch-icon is-done" aria-label="已完成" />;
    case "translating":
      return <Loader2 size={14} className="ch-icon is-active spin" aria-label="翻译中" />;
    case "error":
      return <AlertCircle size={14} className="ch-icon is-error" aria-label="有失败段" />;
    case "partial":
      return <Circle size={14} className="ch-icon is-partial" aria-label="进行中" />;
    default:
      return <Circle size={14} className="ch-icon is-pending" aria-label="待翻译" />;
  }
}

export function Sidebar({
  books,
  activeBookId,
  chapters,
  activeChapterId,
  activeProvider,
  theme,
  uploading,
  mobileOpen,
  onToggleTheme,
  onSelectBook,
  onSelectChapter,
  onUploadFile,
  onOpenSettings,
  onCloseMobile,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isLocal = Boolean(activeProvider && /localhost|127\.0\.0\.1/.test(activeProvider.baseUrl));
  const providerReady = Boolean(activeProvider && (activeProvider.hasApiKey || isLocal));

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={`workbench-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="书库与章节导航">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <BookOpen size={15} strokeWidth={2} />
            </span>
            <span className="brand-name">墨页</span>
          </div>
          <div className="sidebar-header-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              type="button"
              className="btn btn-tertiary btn-sm icon-btn mobile-only"
              onClick={onCloseMobile}
              aria-label="关闭目录"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="sidebar-library">
          <label htmlFor="book-switcher" className="sr-only">
            切换书籍
          </label>
          <select
            id="book-switcher"
            className="field-select book-select"
            value={activeBookId ?? ""}
            onChange={(e) => onSelectBook(e.target.value)}
            aria-label="当前书籍"
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.translatedTitle ? `${b.translatedTitle} · ${b.title}` : b.title}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            title="导入新的 EPUB 电子书"
          >
            <Plus size={14} aria-hidden="true" />
            <span>{uploading ? "解析中" : "导入"}</span>
          </button>
        </div>

        <div className="sidebar-section-label">
          <span>章节进度</span>
          <span className="tabular-nums">{chapters.length} 章</span>
        </div>

        <nav className="chapter-nav" aria-label="章节列表">
          <ul className="chapter-list">
            {chapters.map((ch) => {
              const active = ch.id === activeChapterId;
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    className={`chapter-item ${active ? "is-active" : ""}`}
                    onClick={() => {
                      onSelectChapter(ch.id);
                      onCloseMobile();
                    }}
                    title={ch.translatedTitle ? `${ch.translatedTitle} (${ch.title})` : ch.title}
                  >
                    <ChapterStatusIcon status={ch.failedSegments > 0 ? "error" : ch.status} />
                    <span className="chapter-item-title">
                      {ch.translatedTitle || ch.title}
                    </span>
                    <span
                      className={`chapter-item-meta tabular-nums ${
                        ch.failedSegments > 0 ? "is-error" : ch.status === "completed" ? "is-done" : ""
                      }`}
                    >
                      {ch.failedSegments > 0
                        ? `${ch.failedSegments} 失败`
                        : ch.status === "completed" && ch.totalSegments > 0
                          ? "完成"
                          : `${ch.translatedSegments}/${ch.totalSegments}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="provider-footer-btn" onClick={onOpenSettings}>
            <Settings size={15} strokeWidth={1.8} aria-hidden="true" />
            <div className="provider-footer-copy">
              <span className="provider-footer-title">
                {activeProvider ? `${activeProvider.name} · ${activeProvider.model}` : "未配置模型"}
              </span>
              <span className={`provider-footer-status ${providerReady ? "is-ready" : "is-warn"}`}>
                {providerReady ? "API 已就绪" : "待填写 API Key"}
              </span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
