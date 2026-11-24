import React from "react";
import type {
  ChapterDocumentNode,
  ChapterLinkMeta,
  InlinePlaceholder,
} from "../../core/types.js";
import { parseInlineTemplate, type InlineRenderNode } from "../utils/inlineTemplate.js";

export interface LinkHandlers {
  onAnchorClick?: (hash: string) => void;
  onNavigateChapter?: (chapterHref: string, hash?: string) => void;
}

const VOID_HTML_TAGS = new Set(["img", "hr", "br", "wbr", "col"]);

function buildAnchorElement(
  key: React.Key,
  link: ChapterLinkMeta | undefined,
  content: React.ReactNode,
  isNoteref: boolean,
  insideSup: boolean,
  extraProps: Record<string, unknown>,
  handlers: LinkHandlers,
): React.ReactNode {
  let inner: React.ReactNode;

  if (!link) {
    inner = (
      <span key={key} className={isNoteref ? "chapter-noteref-plain" : undefined} {...extraProps}>
        {content}
      </span>
    );
  } else if (link.kind === "anchor") {
    inner = (
      <a
        key={key}
        href={link.href}
        className={isNoteref ? "chapter-noteref" : "chapter-link"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (link.hash) handlers.onAnchorClick?.(link.hash);
        }}
        {...extraProps}
      >
        {content}
      </a>
    );
  } else if (link.kind === "chapter") {
    inner = (
      <a
        key={key}
        href={link.href}
        className={isNoteref ? "chapter-noteref" : "chapter-link"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (link.chapterHref) {
            handlers.onNavigateChapter?.(link.chapterHref, link.hash);
          }
        }}
        {...extraProps}
      >
        {content}
      </a>
    );
  } else {
    inner = (
      <a
        key={key}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="chapter-link"
        onClick={(e) => e.stopPropagation()}
        {...extraProps}
      >
        {content}
      </a>
    );
  }

  if (isNoteref && !insideSup) {
    return (
      <sup key={key} className="chapter-sup">
        {inner}
      </sup>
    );
  }
  return inner;
}

function toReactSafeProps(attrs: Record<string, string> | undefined): Record<string, unknown> {
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

export function renderStaticAstNodes(
  nodes: ChapterDocumentNode[],
  handlers: LinkHandlers,
  options: { insidePre?: boolean; insideSup?: boolean; keyPrefix?: string } = {},
): React.ReactNode[] {
  const { insidePre = false, insideSup = false, keyPrefix = "n" } = options;

  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (node.kind === "text") {
      return <React.Fragment key={key}>{node.text}</React.Fragment>;
    }
    if (node.kind === "segment") {
      return null;
    }

    const tag = node.tagName;
    const rawProps = toReactSafeProps(node.attrs);
    const isNoteref = node.attrs?.["data-noteref"] === "true";

    if (tag === "a") {
      const children = renderStaticAstNodes(node.children, handlers, {
        insidePre,
        insideSup: insideSup || isNoteref,
        keyPrefix: key,
      });
      return buildAnchorElement(key, node.link, children, isNoteref, insideSup, rawProps, handlers);
    }

    if (tag === "img") {
      return (
        <img
          key={key}
          className="chapter-img"
          loading="lazy"
          decoding="async"
          alt={typeof rawProps.alt === "string" ? rawProps.alt : ""}
          {...rawProps}
        />
      );
    }

    if (VOID_HTML_TAGS.has(tag)) {
      const cls = tag === "hr" ? "chapter-hr" : undefined;
      return React.createElement(tag, { key, className: cls, ...rawProps });
    }

    const nextPre = insidePre || tag === "pre";
    const nextSup = insideSup || tag === "sup";
    const children = renderStaticAstNodes(node.children, handlers, {
      insidePre: nextPre,
      insideSup: nextSup,
      keyPrefix: key,
    });

    let className: string | undefined;
    if (tag === "code" && !insidePre) className = "inline-code-chip";
    else if (tag === "pre") className = "chapter-pre";
    else if (tag === "blockquote") className = "chapter-blockquote";
    else if (tag === "figure") className = "chapter-figure";
    else if (tag === "figcaption") className = "chapter-figcaption";
    else if (tag === "sup") className = "chapter-sup";
    else if (tag === "sub") className = "chapter-sub";
    else if (tag === "svg") className = "chapter-svg";
    else if (tag === "math") className = "chapter-math";
    else if (tag === "table") className = "chapter-table";

    const element = React.createElement(
      tag,
      { key, ...(className ? { className } : {}), ...rawProps },
      children,
    );

    if (tag === "table") {
      return (
        <div key={key} className="chapter-table-scroll">
          {element}
        </div>
      );
    }

    return element;
  });
}

function renderInlineNodes(
  nodes: InlineRenderNode[],
  handlers: LinkHandlers,
  insideSup: boolean,
  keyPrefix: string,
): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;

    if (node.kind === "text") {
      return <React.Fragment key={key}>{node.text}</React.Fragment>;
    }

    if (node.kind === "void_ast") {
      return (
        <React.Fragment key={key}>
          {renderStaticAstNodes(node.nodes, handlers, {
            insideSup,
            keyPrefix: key,
          })}
        </React.Fragment>
      );
    }

    if (node.kind === "void_fallback") {
      if (node.tagName === "br") {
        return <br key={key} />;
      }
      if (node.isCode) {
        return (
          <code key={key} className="inline-code-chip">
            {node.text}
          </code>
        );
      }
      if (node.isNoteref) {
        return buildAnchorElement(
          key,
          node.link,
          node.text,
          true,
          insideSup,
          {},
          handlers,
        );
      }
      return <span key={key}>{node.text}</span>;
    }

    // Paired inline node
    const tag = node.tagName;
    const nextSup = insideSup || tag === "sup" || Boolean(node.isNoteref);
    const children = renderInlineNodes(node.children, handlers, nextSup, key);

    if (tag === "a") {
      return buildAnchorElement(
        key,
        node.link,
        children,
        Boolean(node.isNoteref),
        insideSup,
        {},
        handlers,
      );
    }

    if (tag === "em" || tag === "i") return <em key={key}>{children}</em>;
    if (tag === "strong" || tag === "b") return <strong key={key}>{children}</strong>;
    if (tag === "u") return <u key={key}>{children}</u>;
    if (tag === "s" || tag === "del") return <del key={key}>{children}</del>;
    if (tag === "ins") return <ins key={key}>{children}</ins>;
    if (tag === "sup") {
      return (
        <sup key={key} className="chapter-sup">
          {children}
        </sup>
      );
    }
    if (tag === "sub") {
      return (
        <sub key={key} className="chapter-sub">
          {children}
        </sub>
      );
    }
    if (tag === "small") return <small key={key}>{children}</small>;
    if (tag === "mark") {
      return (
        <mark key={key} className="chapter-mark">
          {children}
        </mark>
      );
    }
    if (tag === "cite") return <cite key={key}>{children}</cite>;
    if (tag === "q") return <q key={key}>{children}</q>;
    if (tag === "abbr") return <abbr key={key}>{children}</abbr>;
    if (tag === "dfn") return <dfn key={key}>{children}</dfn>;

    return <span key={key}>{children}</span>;
  });
}

interface RichTemplateTextProps extends LinkHandlers {
  template: string | null;
  fallbackPlain: string;
  placeholders: InlinePlaceholder[];
  voidNodes?: Record<string, ChapterDocumentNode[]>;
  chapterHref?: string;
}

export function RichTemplateText({
  template,
  fallbackPlain,
  placeholders,
  voidNodes,
  chapterHref,
  onAnchorClick,
  onNavigateChapter,
}: RichTemplateTextProps) {
  const source = template ?? fallbackPlain;
  const parsed = parseInlineTemplate(source, placeholders, voidNodes, chapterHref);
  return (
    <>
      {renderInlineNodes(parsed, { onAnchorClick, onNavigateChapter }, false, "in")}
    </>
  );
}
