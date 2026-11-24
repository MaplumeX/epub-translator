import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { BookRecord, ChapterRecord, GlossaryTerm } from "../../core/types.js";

interface GlossaryDrawerProps {
  open: boolean;
  book: BookRecord;
  chapters: ChapterRecord[];
  terms: GlossaryTerm[];
  prescanBanner: string | null;
  onClose: () => void;
  onTogglePrescanEnabled: (enabled: boolean) => Promise<void>;
  onStartPrescan: () => Promise<void>;
  onStopPrescan: () => Promise<void>;
  onAddTerm: (input: { sourceTerm: string; targetTerm: string; note?: string }) => Promise<void>;
  onDeleteTerm: (termId: string) => Promise<void>;
}

export function GlossaryDrawer({
  open,
  book,
  chapters,
  terms,
  prescanBanner,
  onClose,
  onTogglePrescanEnabled,
  onStartPrescan,
  onStopPrescan,
  onAddTerm,
  onDeleteTerm,
}: GlossaryDrawerProps) {
  const [search, setSearch] = useState("");
  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showSummaries, setShowSummaries] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filteredTerms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter(
      (t) =>
        t.sourceTerm.toLowerCase().includes(q) ||
        t.targetTerm.toLowerCase().includes(q) ||
        t.note.toLowerCase().includes(q),
    );
  }, [terms, search]);

  const scannedChapters = useMemo(() => chapters.filter((c) => Boolean(c.summary?.trim())), [chapters]);
  const isPrescanning = book.status === "prescanning";

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceTerm.trim() || !targetTerm.trim()) {
      setFormError("请同时填写原文术语与建议译名");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onAddTerm({
        sourceTerm: sourceTerm.trim(),
        targetTerm: targetTerm.trim(),
        note: note.trim() || undefined,
      });
      setSourceTerm("");
      setTargetTerm("");
      setNote("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "添加术语失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="术语表与全书预扫描"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="overlay-header">
          <div className="overlay-title-group">
            <BookMarked size={18} aria-hidden="true" />
            <h2 className="overlay-title">术语表与全书预扫描</h2>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm icon-btn"
            onClick={onClose}
            aria-label="关闭抽屉"
          >
            <X size={16} />
          </button>
        </header>

        <div className="drawer-body">
          <section className="prescan-box" aria-label="7C-Lite 全书预扫描">
            <div className="prescan-box-head">
              <div>
                <h3 className="section-subtitle">全书预扫描（可选）</h3>
                <p className="section-desc">
                  扫描各章正文抽样，自动提取人物/专有名词表与每章 2 句摘要，推荐长篇小说开启。
                </p>
              </div>
              {book.prescanCompleted && (
                <span className="badge badge-success">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  已建档
                </span>
              )}
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={book.prescanEnabled}
                onChange={(e) => void onTogglePrescanEnabled(e.target.checked)}
              />
              <span>点击「开始翻译」时自动先执行全书预扫描</span>
            </label>

            <div className="prescan-actions">
              {isPrescanning ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void onStopPrescan()}
                >
                  <Square size={13} aria-hidden="true" />
                  <span>停止预扫描</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={book.status === "translating"}
                  onClick={() => void onStartPrescan()}
                >
                  <Sparkles size={13} aria-hidden="true" />
                  <span>{book.prescanCompleted ? "补扫剩余章节" : "立即全书预扫描"}</span>
                </button>
              )}

              {isPrescanning && (
                <span className="prescan-live-status">
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                  <span>{prescanBanner || "正在扫描章节…"}</span>
                </span>
              )}
            </div>

            {scannedChapters.length > 0 && (
              <div className="summary-accordion">
                <button
                  type="button"
                  className="summary-toggle-btn"
                  onClick={() => setShowSummaries((v) => !v)}
                  aria-expanded={showSummaries}
                >
                  {showSummaries ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>已生成章节摘要（{scannedChapters.length}/{chapters.length} 章）</span>
                </button>
                {showSummaries && (
                  <ul className="summary-list">
                    {scannedChapters.map((ch) => (
                      <li key={ch.id} className="summary-item">
                        <div className="summary-item-title">{ch.translatedTitle || ch.title}</div>
                        <p className="summary-item-body">{ch.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="glossary-section" aria-label="术语对照表">
            <div className="glossary-section-head">
              <h3 className="section-subtitle">本书术语表（{terms.length}）</h3>
              {terms.length > 0 && (
                <div className="search-input-wrap">
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    className="field-input search-input"
                    placeholder="过滤原文或译名…"
                    aria-label="过滤术语表"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}
            </div>

            <form className="glossary-add-form" onSubmit={(e) => void handleSubmit(e)}>
              <div className="glossary-form-grid">
                <div className="field">
                  <label htmlFor="term-source" className="field-label">
                    原文术语
                  </label>
                  <input
                    id="term-source"
                    type="text"
                    className="field-input"
                    value={sourceTerm}
                    onChange={(e) => setSourceTerm(e.target.value)}
                    placeholder="如 Quorum"
                  />
                </div>
                <div className="field">
                  <label htmlFor="term-target" className="field-label">
                    统一译名
                  </label>
                  <input
                    id="term-target"
                    type="text"
                    className="field-input"
                    value={targetTerm}
                    onChange={(e) => setTargetTerm(e.target.value)}
                    placeholder="如 法定人数"
                  />
                </div>
              </div>
              <div className="glossary-note-row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="term-note" className="sr-only">
                    备注（可选）
                  </label>
                  <input
                    id="term-note"
                    type="text"
                    className="field-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="备注说明（可选，如人物关系或学科领域）"
                  />
                </div>
                <button type="submit" className="btn btn-secondary" disabled={submitting}>
                  <Plus size={14} aria-hidden="true" />
                  <span>添加</span>
                </button>
              </div>
              {formError && <p className="field-error">{formError}</p>}
            </form>

            {terms.length === 0 ? (
              <div className="glossary-empty">
                <p className="glossary-empty-title">暂无术语记录</p>
                <p className="glossary-empty-desc">
                  可上方手动录入核心人名与专有名词，或点击「立即全书预扫描」自动提取。
                </p>
              </div>
            ) : filteredTerms.length === 0 ? (
              <div className="glossary-empty">
                <p className="glossary-empty-desc">没有匹配「{search}」的术语。</p>
              </div>
            ) : (
              <ul className="glossary-list">
                {filteredTerms.map((term) => (
                  <li key={term.id} className="glossary-row">
                    <div className="glossary-row-main">
                      <div className="glossary-pair">
                        <span className="glossary-src">{term.sourceTerm}</span>
                        <span className="glossary-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="glossary-tgt">{term.targetTerm}</span>
                        <span
                          className={`badge ${
                            term.origin === "prescan" ? "badge-info" : "badge-neutral"
                          }`}
                        >
                          {term.origin === "prescan" ? "预扫" : "手动"}
                        </span>
                      </div>
                      {term.note && <p className="glossary-note">{term.note}</p>}
                    </div>
                    <button
                      type="button"
                      className="btn btn-tertiary btn-sm icon-btn"
                      onClick={() => void onDeleteTerm(term.id)}
                      aria-label={`删除术语 ${term.sourceTerm}`}
                      title="删除术语"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
