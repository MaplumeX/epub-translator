import React, { useMemo } from "react";
import type {
  ChapterDocumentNode,
  OutputMode,
  SegmentRecord,
} from "../../core/types.js";
import { renderStaticAstNodes, type LinkHandlers } from "./RichContent.js";
import { SegmentBlock } from "./SegmentBlock.js";

interface ChapterDocumentViewProps extends LinkHandlers {
  nodes: ChapterDocumentNode[];
  segments: SegmentRecord[];
  placeholderNodes: Record<string, Record<string, ChapterDocumentNode[]>>;
  chapterHref?: string;
  outputMode: OutputMode;
  useSerif: boolean;
  highlightedDomPath: string | null;
  onSaveSegment: (segmentId: string, translatedTemplate: string) => Promise<void>;
  onRetranslateSegment: (segmentId: string, instruction?: string) => Promise<void>;
}

const VOID_HTML_TAGS = new Set(["img", "hr", "br", "wbr", "col"]);

function toSafeProps(attrs: Record<string, string> | undefined): Record<string, unknown> {
  if (!attrs) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "colSpan" || k === "rowSpan" || k === "span" || k === "start" || k === "value") {
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function ChapterDocumentView({
  nodes,
  segments,
  placeholderNodes,
  chapterHref,
  outputMode,
  useSerif,
  highlightedDomPath,
  onSaveSegment,
  onRetranslateSegment,
  onAnchorClick,
  onNavigateChapter,
}: ChapterDocumentViewProps) {
  const segmentsByDomPath = useMemo(() => {
    const map = new Map<string, SegmentRecord>();
    for (const seg of segments) {
      map.set(seg.domPath, seg);
    }
    return map;
  }, [segments]);

  const linkHandlers: LinkHandlers = { onAnchorClick, onNavigateChapter };

  function renderTree(
    list: ChapterDocumentNode[],
    ctx: { insidePre: boolean; keyPrefix: string },
  ): React.ReactNode[] {
    return list.map((node, idx) => {
      const key = `${ctx.keyPrefix}-${idx}`;

      if (node.kind === "text") {
        return <React.Fragment key={key}>{node.text}</React.Fragment>;
      }

      if (node.kind === "segment") {
        const seg = segmentsByDomPath.get(node.domPath);
        if (!seg) return null;
        return (
          <SegmentBlock
            key={seg.id}
            segment={seg}
            domNode={node}
            voidNodes={placeholderNodes[node.domPath]}
            chapterHref={chapterHref}
            outputMode={outputMode}
            useSerif={useSerif}
            highlighted={highlightedDomPath === node.domPath}
            onSaveEdit={onSaveSegment}
            onRetranslate={onRetranslateSegment}
            onAnchorClick={onAnchorClick}
            onNavigateChapter={onNavigateChapter}
          />
        );
      }

      const tag = node.tagName;

      // Delegate pure non-segment subtrees (e.g. <svg>, <math>, <a>, <img>, <pre>) to static renderer
      if (tag === "svg" || tag === "math" || tag === "a" || tag === "img" || VOID_HTML_TAGS.has(tag)) {
        return (
          <React.Fragment key={key}>
            {renderStaticAstNodes([node], linkHandlers, {
              insidePre: ctx.insidePre,
              keyPrefix: key,
            })}
          </React.Fragment>
        );
      }

      const nextPre = ctx.insidePre || tag === "pre";
      const children = renderTree(node.children, { insidePre: nextPre, keyPrefix: key });
      const props = toSafeProps(node.attrs);

      let className: string | undefined;
      if (tag === "pre") className = "chapter-pre";
      else if (tag === "code" && !ctx.insidePre) className = "inline-code-chip";
      else if (tag === "blockquote") className = "chapter-blockquote";
      else if (tag === "figure") className = "chapter-figure";
      else if (tag === "figcaption") className = "chapter-figcaption";
      else if (tag === "ul") className = "chapter-ul";
      else if (tag === "ol") className = "chapter-ol";
      else if (tag === "dl") className = "chapter-dl";
      else if (tag === "table") className = "chapter-table";
      else if (tag === "aside") className = "chapter-aside";

      const el = React.createElement(
        tag,
        { key, ...(className ? { className } : {}), ...props },
        children,
      );

      if (tag === "table") {
        return (
          <div key={key} className="chapter-table-scroll">
            {el}
          </div>
        );
      }

      return el;
    });
  }

  return (
    <article className={`chapter-sheet ${useSerif ? "is-serif" : ""}`}>
      {renderTree(nodes, { insidePre: false, keyPrefix: "doc" })}
    </article>
  );
}
