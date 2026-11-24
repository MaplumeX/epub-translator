import type {
  ChapterDocumentNode,
  ChapterLinkMeta,
  InlinePlaceholder,
} from "../../core/types.js";

// Parsing placeholder templates into typed AST nodes avoids dangerouslySetInnerHTML while restoring
// inline emphasis, code chips, superscript footnotes, and links safely in React.
// See ADR 2026-11-24-continuous-chapter-reader.

export type InlineRenderNode =
  | { kind: "text"; text: string }
  | {
      kind: "paired";
      tagName: string;
      link?: ChapterLinkMeta;
      isNoteref?: boolean;
      children: InlineRenderNode[];
    }
  | { kind: "void_ast"; nodes: ChapterDocumentNode[] }
  | {
      kind: "void_fallback";
      tagName: string;
      text: string;
      isCode?: boolean;
      isNoteref?: boolean;
      link?: ChapterLinkMeta;
    };

const TOKEN_REGEX = /\[\[(\/?)([IV]\d+)\]\]/g;
const SAFE_HTTP_REGEX = /^https?:\/\//i;
const HAS_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;

function dirnamePosix(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

function resolvePosixPath(baseDir: string, rel: string): string {
  const clean = decodeURIComponentSafe(rel.split("#")[0] ?? "");
  const parts = (baseDir ? `${baseDir}/${clean}` : clean).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function classifySafeClientLink(
  rawHref: string | undefined,
  chapterHref?: string,
): ChapterLinkMeta | undefined {
  if (!rawHref) return undefined;
  const trimmed = rawHref.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("#")) {
    const hash = trimmed.slice(1).trim();
    return hash ? { kind: "anchor", href: `#${hash}`, hash } : undefined;
  }

  if (SAFE_HTTP_REGEX.test(trimmed)) {
    return { kind: "external", href: trimmed };
  }

  if (HAS_SCHEME_REGEX.test(trimmed) || trimmed.startsWith("//")) {
    return undefined;
  }

  const hashIdx = trimmed.indexOf("#");
  const pathPart = hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx);
  const hash = hashIdx === -1 ? undefined : trimmed.slice(hashIdx + 1).trim() || undefined;
  if (!chapterHref) {
    return hash ? { kind: "anchor", href: `#${hash}`, hash } : undefined;
  }

  const resolved = resolvePosixPath(dirnamePosix(chapterHref), pathPart);
  if (!resolved) {
    return hash ? { kind: "anchor", href: `#${hash}`, hash } : undefined;
  }
  const current = resolvePosixPath("", chapterHref);
  if (resolved === current && hash) {
    return { kind: "anchor", href: `#${hash}`, hash };
  }

  return {
    kind: "chapter",
    href: trimmed,
    chapterHref: resolved,
    hash,
  };
}

function extractAttrFromTag(tagHtml: string | undefined, attrName: string): string | undefined {
  if (!tagHtml) return undefined;
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = tagHtml.match(regex);
  return match?.[1] ?? match?.[2];
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTagsToPlain(rawHtml: string): string {
  return decodeBasicEntities(rawHtml.replace(/<[^>]+>/g, ""));
}

function buildVoidFallback(
  ph: InlinePlaceholder,
  chapterHref?: string,
): InlineRenderNode {
  const tag = ph.tagName.toLowerCase();
  const raw = ph.rawHtml ?? "";

  if (tag === "br") {
    return { kind: "void_fallback", tagName: "br", text: "" };
  }
  if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "var") {
    return {
      kind: "void_fallback",
      tagName: tag,
      text: stripTagsToPlain(raw),
      isCode: true,
    };
  }
  if (tag === "math" || tag === "svg") {
    return { kind: "void_fallback", tagName: tag, text: "[公式/图形]" };
  }
  if (tag === "img") {
    const alt = extractAttrFromTag(raw, "alt")?.trim();
    return {
      kind: "void_fallback",
      tagName: "img",
      text: alt ? `[图片: ${alt}]` : "[图片]",
    };
  }

  const href = extractAttrFromTag(raw, "href");
  const epubType = extractAttrFromTag(raw, "epub:type") ?? "";
  const plainText = stripTagsToPlain(raw).trim();
  const isNoteref =
    tag === "sup" ||
    epubType.split(/\s+/).includes("noteref") ||
    (tag === "a" && /^[\[\(]?[\d*†‡§]+[\]\)]?$/.test(plainText));

  return {
    kind: "void_fallback",
    tagName: tag,
    text: plainText,
    isNoteref,
    link: classifySafeClientLink(href, chapterHref),
  };
}

export function parseInlineTemplate(
  template: string,
  placeholders: InlinePlaceholder[],
  voidNodes?: Record<string, ChapterDocumentNode[]>,
  chapterHref?: string,
): InlineRenderNode[] {
  const byId = new Map(placeholders.map((p) => [p.id, p]));
  const root: InlineRenderNode[] = [];
  const stack: Array<{
    id: string;
    node: Extract<InlineRenderNode, { kind: "paired" }>;
  }> = [];

  const currentChildren = (): InlineRenderNode[] =>
    stack.length > 0 ? stack[stack.length - 1].node.children : root;

  let lastIndex = 0;

  for (const match of template.matchAll(TOKEN_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      currentChildren().push({ kind: "text", text: template.slice(lastIndex, idx) });
    }

    const isClose = match[1] === "/";
    const id = match[2];
    const ph = byId.get(id);

    if (!ph) {
      // Unknown placeholder marker: ignore cleanly rather than leaking raw [[...]] tokens
      lastIndex = idx + match[0].length;
      continue;
    }

    if (ph.kind === "void") {
      if (!isClose) {
        const ast = voidNodes?.[id];
        if (ast && ast.length > 0) {
          currentChildren().push({ kind: "void_ast", nodes: ast });
        } else {
          currentChildren().push(buildVoidFallback(ph, chapterHref));
        }
      }
      lastIndex = idx + match[0].length;
      continue;
    }

    // Paired inline placeholder
    if (!isClose) {
      const tag = ph.tagName.toLowerCase();
      const href = tag === "a" ? extractAttrFromTag(ph.openTag, "href") : undefined;
      const epubType = extractAttrFromTag(ph.openTag, "epub:type") ?? "";
      const pairedNode: Extract<InlineRenderNode, { kind: "paired" }> = {
        kind: "paired",
        tagName: tag,
        link: classifySafeClientLink(href, chapterHref),
        isNoteref: tag === "sup" || epubType.split(/\s+/).includes("noteref"),
        children: [],
      };
      currentChildren().push(pairedNode);
      stack.push({ id, node: pairedNode });
    } else {
      // Unwind back to the matching open id if present; tolerate mismatched nesting safely
      let matchPos = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].id === id) {
          matchPos = i;
          break;
        }
      }
      if (matchPos !== -1) {
        stack.length = matchPos;
      }
    }

    lastIndex = idx + match[0].length;
  }

  if (lastIndex < template.length) {
    currentChildren().push({ kind: "text", text: template.slice(lastIndex) });
  }

  return root;
}
