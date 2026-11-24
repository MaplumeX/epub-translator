import { useState } from "react";
import {
  AlertCircle,
  Check,
  Edit3,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { OutputMode, SegmentRecord } from "../../core/types.js";

interface SegmentCardProps {
  segment: SegmentRecord;
  outputMode: OutputMode;
  useSerif: boolean;
  onSaveEdit: (segmentId: string, translatedTemplate: string) => Promise<void>;
  onRetranslate: (segmentId: string, instruction?: string) => Promise<void>;
}

/** Render plain text turning inline backtick spans into styled code chips safely (no raw HTML injection). */
function RichInlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={idx} className="inline-code-chip">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

export function SegmentCard({
  segment,
  outputMode,
  useSerif,
  onSaveEdit,
  onRetranslate,
}: SegmentCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showPolish, setShowPolish] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [retranslating, setRetranslating] = useState(false);

  const isHeading = /^h[1-6]$/.test(segment.tagName);
  const isTranslating = segment.status === "translating" || retranslating;

  function openEditor() {
    setDraft(segment.translatedTemplate ?? segment.sourceTemplate);
    setEditError(null);
    setShowPolish(false);
    setEditing(true);
  }

  async function handleSave() {
    if (!draft.trim()) {
      setEditError("译文不能为空");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await onSaveEdit(segment.id, draft);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetranslate(customInstruction?: string) {
    setRetranslating(true);
    try {
      await onRetranslate(segment.id, customInstruction);
      setShowPolish(false);
      setInstruction("");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "重译失败");
    } finally {
      setRetranslating(false);
    }
  }

  const showSource = outputMode === "bilingual" || segment.status !== "translated";

  return (
    <article
      className={`segment-card is-${segment.status} ${isHeading ? "is-heading" : ""}`}
      aria-label={`第 ${segment.orderIndex + 1} 段`}
    >
      <div className="segment-meta-row">
        <span className="segment-index tabular-nums">
          #{segment.orderIndex + 1} · {segment.tagName.toUpperCase()}
        </span>

        <div className="segment-hover-actions">
          {!editing && (
            <>
              <button
                type="button"
                className="btn btn-tertiary btn-sm"
                onClick={openEditor}
                disabled={isTranslating}
              >
                <Edit3 size={13} aria-hidden="true" />
                <span>编辑</span>
              </button>
              <button
                type="button"
                className="btn btn-tertiary btn-sm"
                onClick={() => setShowPolish((v) => !v)}
                disabled={isTranslating}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>重译 / 润色</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showSource && (
        <p className={`segment-source ${isHeading ? "is-heading" : ""}`}>
          <RichInlineText text={segment.sourcePlain} />
        </p>
      )}

      {editing ? (
        <div className="segment-editor">
          {segment.placeholders.length > 0 && (
            <div className="placeholder-hint-bar">
              <span className="placeholder-hint-label">须保留占位符：</span>
              {segment.placeholders.map((ph) => (
                <code key={ph.id} className="inline-code-chip">
                  {ph.kind === "paired" ? `[[${ph.id}]]…[[/${ph.id}]]` : `[[${ph.id}]]`}
                </code>
              ))}
            </div>
          )}
          <label htmlFor={`edit-${segment.id}`} className="sr-only">
            编辑译文模板
          </label>
          <textarea
            id={`edit-${segment.id}`}
            className="field-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            aria-invalid={editError ? "true" : undefined}
          />
          {editError && <p className="field-error">{editError}</p>}
          <div className="segment-editor-actions">
            <button
              type="button"
              className="btn btn-tertiary btn-sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X size={13} aria-hidden="true" />
              <span>取消</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <Check size={13} aria-hidden="true" />
              <span>{saving ? "保存中…" : "保存修改"}</span>
            </button>
          </div>
        </div>
      ) : segment.status === "translated" && segment.translatedPlain ? (
        <p
          className={`segment-translation ${useSerif ? "is-serif" : ""} ${
            isHeading ? "is-heading" : ""
          }`}
        >
          <RichInlineText text={segment.translatedPlain} />
        </p>
      ) : isTranslating ? (
        <div className="segment-status-line is-translating" role="status">
          <Loader2 size={14} className="spin" aria-hidden="true" />
          <span>正在翻译本段…</span>
        </div>
      ) : segment.status === "failed" ? (
        <div className="segment-error-alert" role="alert">
          <div className="segment-error-copy">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{segment.errorMessage || "该段落翻译失败，已保留原文。"}</span>
          </div>
          <div className="segment-error-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleRetranslate()}
              disabled={isTranslating}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>重试</span>
            </button>
            <button type="button" className="btn btn-tertiary btn-sm" onClick={openEditor}>
              <span>手动填写</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="segment-pending-hint">待翻译</p>
      )}

      {showPolish && !editing && (
        <div className="polish-bar">
          <label htmlFor={`polish-${segment.id}`} className="sr-only">
            单段润色或重译要求
          </label>
          <input
            id={`polish-${segment.id}`}
            type="text"
            className="field-input polish-input"
            placeholder="可选润色指令（如：去翻译腔、更贴合技术文档语气）"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleRetranslate(instruction);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isTranslating}
            onClick={() => void handleRetranslate(instruction)}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>{isTranslating ? "重译中…" : "执行重译"}</span>
          </button>
        </div>
      )}
    </article>
  );
}
