import React, { memo, useState } from "react";
import {
  AlertCircle,
  Check,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ChapterDocumentNode,
  ChapterSegmentNode,
  OutputMode,
  SegmentRecord,
} from "../../core/types.js";
import { RichTemplateText, type LinkHandlers } from "./RichContent.js";

// SegmentBlock keeps proofreading inline inside the continuous book sheet via progressive disclosure,
// avoiding per-segment cards while supporting single-segment source peek and Memoized SSE updates.
// See ADR 2026-11-24-continuous-chapter-reader.

export interface SegmentBlockProps extends LinkHandlers {
  segment: SegmentRecord;
  domNode?: ChapterSegmentNode;
  voidNodes?: Record<string, ChapterDocumentNode[]>;
  chapterHref?: string;
  outputMode: OutputMode;
  useSerif: boolean;
  variant?: "flow" | "failed-list";
  highlighted?: boolean;
  onSaveEdit: (segmentId: string, translatedTemplate: string) => Promise<void>;
  onRetranslate: (segmentId: string, instruction?: string) => Promise<void>;
  onLocateInSheet?: (domPath: string) => void;
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function renderSemanticTextElement(
  tagName: string,
  className: string,
  children: React.ReactNode,
): React.ReactNode {
  if (tagName === "h1") return <h1 className={className}>{children}</h1>;
  if (tagName === "h2") return <h2 className={className}>{children}</h2>;
  if (tagName === "h3") return <h3 className={className}>{children}</h3>;
  if (tagName === "h4") return <h4 className={className}>{children}</h4>;
  if (tagName === "h5") return <h5 className={className}>{children}</h5>;
  if (tagName === "h6") return <h6 className={className}>{children}</h6>;
  if (tagName === "blockquote") return <blockquote className={className}>{children}</blockquote>;
  if (tagName === "figcaption") return <figcaption className={className}>{children}</figcaption>;
  if (tagName === "dt") return <dt className={className}>{children}</dt>;
  if (tagName === "dd") return <dd className={className}>{children}</dd>;
  return <p className={className}>{children}</p>;
}

function SegmentBlockInner({
  segment,
  domNode,
  voidNodes,
  chapterHref,
  outputMode,
  useSerif,
  variant = "flow",
  highlighted = false,
  onSaveEdit,
  onRetranslate,
  onLocateInSheet,
  onAnchorClick,
  onNavigateChapter,
}: SegmentBlockProps) {
  const [selected, setSelected] = useState(false);
  const [peekSource, setPeekSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showPolish, setShowPolish] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [retranslating, setRetranslating] = useState(false);

  const tag = segment.tagName.toLowerCase();
  const isHeading = HEADING_TAGS.has(tag);
  const isTranslating = segment.status === "translating" || retranslating;
  const isTranslated = segment.status === "translated" && Boolean(segment.translatedPlain);
  const canPeekSource = outputMode === "translated_only" && isTranslated && !editing && !showPolish;

  function openEditor() {
    setDraft(segment.translatedTemplate ?? segment.sourceTemplate);
    setEditError(null);
    setShowPolish(false);
    setEditing(true);
    setSelected(true);
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
    setEditError(null);
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

  function handleBlockClick(e: React.MouseEvent) {
    if (editing || showPolish) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("a, button, input, textarea, label")) return;
    const selection = window.getSelection?.()?.toString();
    if (selection && selection.length > 0) return;
    setSelected((v) => !v);
  }

  const showSource =
    variant === "failed-list" ||
    outputMode === "bilingual" ||
    segment.status !== "translated" ||
    peekSource ||
    editing ||
    showPolish;

  const isSourcePeekMode =
    variant === "flow" &&
    outputMode === "translated_only" &&
    segment.status === "translated" &&
    (peekSource || editing || showPolish);

  const sourceRichNode = (
    <RichTemplateText
      template={segment.sourceTemplate}
      fallbackPlain={segment.sourcePlain}
      placeholders={segment.placeholders}
      voidNodes={voidNodes}
      chapterHref={chapterHref}
      onAnchorClick={onAnchorClick}
      onNavigateChapter={onNavigateChapter}
    />
  );

  const translationRichNode = (
    <RichTemplateText
      template={segment.translatedTemplate}
      fallbackPlain={segment.translatedPlain ?? ""}
      placeholders={segment.placeholders}
      voidNodes={voidNodes}
      chapterHref={chapterHref}
      onAnchorClick={onAnchorClick}
      onNavigateChapter={onNavigateChapter}
    />
  );

  const editorPanel = editing && (
    <div className="segment-editor" onClick={(e) => e.stopPropagation()}>
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
  );

  const polishPanel = showPolish && !editing && (
    <div className="polish-bar" onClick={(e) => e.stopPropagation()}>
      <label htmlFor={`polish-${segment.id}`} className="sr-only">
        单段润色或重译要求
      </label>
      <input
        id={`polish-${segment.id}`}
        type="text"
        className="field-input polish-input"
        placeholder="可选润色指令（如：去翻译腔、更贴合学术/技术语气）"
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
      {editError && <p className="field-error">{editError}</p>}
    </div>
  );

  // Compact failed-segment repair list mode
  if (variant === "failed-list") {
    return (
      <article
        className="failed-triage-item"
        data-dom-path={segment.domPath}
        aria-label={`失败段落 #${segment.orderIndex + 1}`}
      >
        <div className="failed-triage-head">
          <span className="segment-index tabular-nums">
            #{segment.orderIndex + 1} · {tag.toUpperCase()}
          </span>
          <div className="failed-triage-actions">
            {onLocateInSheet && (
              <button
                type="button"
                className="btn btn-tertiary btn-sm"
                onClick={() => onLocateInSheet(segment.domPath)}
              >
                <Crosshair size={13} aria-hidden="true" />
                <span>在书页中定位</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleRetranslate()}
              disabled={isTranslating}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>{isTranslating ? "重试中…" : "重试"}</span>
            </button>
            {!editing && (
              <button type="button" className="btn btn-tertiary btn-sm" onClick={openEditor}>
                <Edit3 size={13} aria-hidden="true" />
                <span>手动填写</span>
              </button>
            )}
          </div>
        </div>

        <p className="seg-source is-triage">{sourceRichNode}</p>

        <div className="segment-error-alert" role="alert">
          <div className="segment-error-copy">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{segment.errorMessage || "该段落翻译失败，已保留原文。"}</span>
          </div>
        </div>

        {editorPanel}
      </article>
    );
  }

  // Continuous book sheet flow mode
  const isActivePanel = editing || showPolish || selected;
  const flowClassName = [
    "seg-flow",
    `is-tag-${tag}`,
    `is-${segment.status}`,
    isHeading ? "is-heading" : "",
    outputMode === "bilingual" ? "is-bilingual" : "is-translated-only",
    isActivePanel ? "is-selected" : "",
    highlighted ? "is-highlighted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const innerContent = (
    <>
      <div
        className={`seg-float-bar ${isActivePanel ? "is-visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="seg-float-meta tabular-nums">
          #{segment.orderIndex + 1} · {tag.toUpperCase()}
        </span>
        {canPeekSource && (
          <button
            type="button"
            className={`seg-float-btn ${peekSource ? "is-active" : ""}`}
            onClick={() => setPeekSource((v) => !v)}
            aria-pressed={peekSource}
            title={peekSource ? "收起本段原文" : "查看本段英文原文"}
          >
            {peekSource ? (
              <EyeOff size={12} aria-hidden="true" />
            ) : (
              <Eye size={12} aria-hidden="true" />
            )}
            <span>原文</span>
          </button>
        )}
        {!editing && (
          <>
            <button
              type="button"
              className="seg-float-btn"
              onClick={openEditor}
              disabled={isTranslating}
            >
              <Edit3 size={12} aria-hidden="true" />
              <span>编辑</span>
            </button>
            <button
              type="button"
              className={`seg-float-btn ${showPolish ? "is-active" : ""}`}
              onClick={() => {
                setShowPolish((v) => !v);
                setSelected(true);
              }}
              disabled={isTranslating}
            >
              <Sparkles size={12} aria-hidden="true" />
              <span>重译</span>
            </button>
          </>
        )}
      </div>

      {showSource &&
        (isSourcePeekMode ? (
          <div className="seg-source-peek">
            <span className="seg-source-peek-label">原文</span>
            <p className={`seg-source is-peek is-tag-${tag}`}>{sourceRichNode}</p>
          </div>
        ) : (
          <p className={`seg-source is-tag-${tag} ${isHeading ? "is-heading" : ""}`}>
            {sourceRichNode}
          </p>
        ))}

      {editing ? (
        editorPanel
      ) : isTranslated ? (
        renderSemanticTextElement(
          tag === "td" || tag === "th" || tag === "li" ? "p" : tag,
          `seg-translation is-tag-${tag} ${useSerif ? "is-serif" : ""} ${isHeading ? "is-heading" : ""}`,
          translationRichNode,
        )
      ) : isTranslating ? (
        <div className="segment-status-line is-translating" role="status">
          <Loader2 size={14} className="spin" aria-hidden="true" />
          <span>正在翻译本段…</span>
        </div>
      ) : segment.status === "failed" ? (
        <div className="segment-error-alert" role="alert" onClick={(e) => e.stopPropagation()}>
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

      {polishPanel}
    </>
  );

  // Preserve native table cell & list item wrappers so tables and numbered lists stay valid HTML
  if (tag === "td" || tag === "th") {
    const cellProps: Record<string, unknown> = {
      id: domNode?.id,
      className: `chapter-table-cell-wrap ${highlighted ? "is-highlighted" : ""}`,
      "data-dom-path": segment.domPath,
    };
    if (domNode?.attrs?.colSpan) cellProps.colSpan = Number(domNode.attrs.colSpan);
    if (domNode?.attrs?.rowSpan) cellProps.rowSpan = Number(domNode.attrs.rowSpan);
    if (domNode?.attrs?.scope) cellProps.scope = domNode.attrs.scope;

    return React.createElement(
      tag,
      cellProps,
      <div className={`${flowClassName} is-in-cell`} onClick={handleBlockClick}>
        {innerContent}
      </div>,
    );
  }

  if (tag === "li") {
    const liValue = domNode?.attrs?.value ? Number(domNode.attrs.value) : undefined;
    return (
      <li
        id={domNode?.id}
        value={liValue && !Number.isNaN(liValue) ? liValue : undefined}
        className="chapter-li-wrap"
        data-dom-path={segment.domPath}
      >
        <div className={`${flowClassName} is-in-list`} onClick={handleBlockClick}>
          {innerContent}
        </div>
      </li>
    );
  }

  return (
    <div
      id={domNode?.id}
      data-dom-path={segment.domPath}
      className={flowClassName}
      onClick={handleBlockClick}
    >
      {innerContent}
    </div>
  );
}

export const SegmentBlock = memo(SegmentBlockInner);
