import type { ReactNode } from "react";
import { BookOpen, Settings } from "lucide-react";
import type { ThemeMode } from "../hooks/useTheme.js";
import { ThemeToggle } from "./ThemeToggle.js";

interface WorkbenchShellProps {
  hasBook: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  sidebar?: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
}

export function WorkbenchShell({
  hasBook,
  theme,
  onToggleTheme,
  onOpenSettings,
  sidebar,
  topBar,
  children,
}: WorkbenchShellProps) {
  if (!hasBook) {
    return (
      <div className="empty-shell">
        <header className="empty-topbar">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <BookOpen size={15} strokeWidth={2} />
            </span>
            <span className="brand-name">墨页</span>
            <span className="brand-subtitle">EPUB 双语翻译工作台</span>
          </div>
          <div className="empty-topbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenSettings}>
              <Settings size={14} aria-hidden="true" />
              <span>API 设置</span>
            </button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </header>
        <main className="empty-shell-main">{children}</main>
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
