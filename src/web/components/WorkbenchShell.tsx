import { useRef, type ReactNode } from "react";
import { BookOpen, Plus, Settings } from "lucide-react";
import type { ThemeMode } from "../hooks/useTheme.js";
import { ThemeToggle } from "./ThemeToggle.js";

export type ShellMode = "empty" | "library" | "reader";

interface WorkbenchShellProps {
  mode: ShellMode;
  bookCount?: number;
  uploading?: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onUploadFiles?: (files: File[]) => void;
  sidebar?: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
}

export function WorkbenchShell({
  mode,
  bookCount = 0,
  uploading = false,
  theme,
  onToggleTheme,
  onOpenSettings,
  onUploadFiles,
  sidebar,
  topBar,
  children,
}: WorkbenchShellProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (mode === "empty" || mode === "library") {
    return (
      <div className="empty-shell">
        <header className="empty-topbar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <BookOpen size={15} strokeWidth={2} />
            </span>
            <span className="brand-name">墨页</span>
            <span className="brand-subtitle tabular-nums">
              {mode === "library" ? `本地书库（${bookCount} 本）` : "EPUB 双语翻译工作台"}
            </span>
          </div>
          <div className="empty-topbar-actions">
            {mode === "library" && onUploadFiles && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".epub,application/epub+zip"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const list = e.target.files;
                    if (list && list.length > 0) {
                      onUploadFiles(Array.from(list));
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>{uploading ? "导入中…" : "导入 EPUB"}</span>
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenSettings}>
              <Settings size={14} aria-hidden="true" />
              <span>API 设置</span>
            </button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </header>
        <main className={mode === "library" ? "library-shell-main" : "empty-shell-main"}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="workbench-shell">
      {sidebar}
      <main className="workbench-main">
        {topBar}
        {children}
      </main>
    </div>
  );
}
