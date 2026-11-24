import { useEffect, useState } from "react";
import { Download, FileCheck2, X } from "lucide-react";
import type { BookRecord, OutputMode } from "../../core/types.js";

interface ExportPopoverProps {
  open: boolean;
  book: BookRecord;
  onClose: () => void;
  onExport: (mode: OutputMode) => void;
}

export function ExportPopover({ open, book, onClose, onExport }: ExportPopoverProps) {
  const [mode, setMode] = useState<OutputMode>(book.outputMode);

  useEffect(() => {
    if (open) setMode(book.outputMode);
  }, [open, book.outputMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel modal-sm"
        role="dialog"
        aria-modal="true"
        aria-label="导出译本 EPUB"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="overlay-header">
          <div className="overlay-title-group">
            <FileCheck2 size={18} aria-hidden="true" />
            <h2 className="overlay-title">导出译本 EPUB</h2>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm icon-btn"
            onClick={onClose}
            aria-label="关闭导出弹窗"
          >
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p className="export-summary tabular-nums">
            已完成 <strong>{book.translatedSegments}</strong> / {book.totalSegments} 段
            {book.failedSegments > 0
              ? `（${book.failedSegments} 段失败将自动回退原文，不破坏原书结构）`
              : "，目录与元信息将同步写入。"}
          </p>

          <fieldset className="mode-cards">
            <legend className="sr-only">选择导出排版模式</legend>
            <label className={`mode-card ${mode === "bilingual" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-mode"
                value="bilingual"
                checked={mode === "bilingual"}
                onChange={() => setMode("bilingual")}
              />
              <div>
                <div className="mode-card-title">双语对照（推荐精读）</div>
                <div className="mode-card-desc">
                  保留逐段原文并在下方插入中文译文，附带极简双语排版样式表。
                </div>
              </div>
            </label>

            <label className={`mode-card ${mode === "translated_only" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="export-mode"
                value="translated_only"
                checked={mode === "translated_only"}
                onChange={() => setMode("translated_only")}
              />
              <div>
                <div className="mode-card-title">纯中文译文（沉浸阅读）</div>
                <div className="mode-card-desc">
                  原位替换已翻译段落，完整保留代码块、公式与原书样式结构。
                </div>
              </div>
            </label>
          </fieldset>

          <footer className="modal-footer">
            <div />
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onExport(mode);
                  onClose();
                }}
              >
                <Download size={14} aria-hidden="true" />
                <span>生成并下载 EPUB</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
