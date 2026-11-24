import * as cheerio from "cheerio";
import type {
  ChapterDocumentNode,
  ChapterLinkMeta,
  SegmentRecord,
} from "../types.js";
import { dirnamePosix, resolveZipPath } from "./container.js";
import {
  extractChapterSegments,
  isTagElement,
  selectTranslatableBlocks,
  type DomElement,
  type DomNode,
} from "./xhtml.js";

// Mapping translatable leaves via selectTranslatableBlocks keeps document anchors 1:1 with DB segment domPaths,
// and strict tag/attribute/URL whitelists keep browser rendering XSS-free without dangerouslySetInnerHTML.
// See ADR 2026-11-24-continuous-chapter-reader.

const DROP_SUBTREE_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "head",
  "meta",
  "link",
  "base",
  "foreignobject",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
]);

const ALLOWED_HTML_TAGS = new Set([
  "section",
  "article",
  "div",
  "header",
  "footer",
  "aside",
  "main",
  "nav",
  "blockquote",
  "figure",
  "figcaption",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "hr",
  "br",
  "wbr",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
  "del",
  "ins",
  "sup",
  "sub",
  "small",
  "mark",
  "cite",
  "q",
  "abbr",
  "dfn",
  "time",
  "bdi",
  "bdo",
  "a",
  "img",
  "ruby",
  "rt",
  "rp",
]);

const ALLOWED_SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "use",
  "image",
  "symbol",
  "view",
  "title",
  "desc",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
]);

const ALLOWED_MATH_TAGS = new Set([
  "math",
  "mrow",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "mspace",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "mtable",
  "mtr",
  "mtd",
  "mover",
  "munder",
  "munderover",
  "mfenced",
  "semantics",
  "annotation",
]);

const BLOCK_WHITESPACE_CONTAINERS = new Set([
  "body",
  "section",
  "article",
  "div",
  "header",
  "footer",
  "aside",
  "main",
  "nav",
  "blockquote",
  "figure",
  "ul",
  "ol",
  "dl",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "colgroup",
]);

const SVG_TAG_CASE_MAP: Record<string, string> = {
  clippath: "clipPath",
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
};

const SVG_ATTR_CASE_MAP: Record<string, string> = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-opacity": "strokeOpacity",
  "fill-rule": "fillRule",
  "fill-opacity": "fillOpacity",
  "clip-rule": "clipRule",
  "clip-path": "clipPath",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-family": "fontFamily",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  patternunits: "patternUnits",
  spreadmethod: "spreadMethod",
};

const ALLOWED_SVG_ATTRS = new Set([
  "id",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "stroke",
  "opacity",
  "offset",
  "dx",
  "dy",
  "xmlns",
  ...Object.keys(SVG_ATTR_CASE_MAP),
]);

const ALLOWED_MATH_ATTRS = new Set([
  "id",
  "display",
  "mathvariant",
  "stretchy",
  "fence",
  "separator",
  "linethickness",
  "columnalign",
  "rowalign",
  "columnspacing",
  "rowspacing",
  "open",
  "close",
  "separators",
  "xmlns",
]);

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_HTTP_REGEX = /^https?:\/\//i;
const HAS_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;

function encodeZipPath(zipPath: string): string {
  return zipPath
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function buildAssetUrl(assetBaseUrl: string, chapterDir: string, rawSrc: string): string | null {
  const trimmed = rawSrc.trim();
  if (!trimmed) return null;
  if (SAFE_DATA_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }
  if (HAS_SCHEME_REGEX.test(trimmed) || trimmed.startsWith("//")) {
    return null;
  }
  const resolved = resolveZipPath(chapterDir, trimmed);
  if (!resolved) return null;
  const base = assetBaseUrl.replace(/\/+$/, "");
  return `${base}/${encodeZipPath(resolved)}`;
}

export function classifyChapterLink(
  rawHref: string,
  chapterHref: string,
): ChapterLinkMeta | undefined {
  const trimmed = rawHref.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("#")) {
    const hash = trimmed.slice(1).trim();
    return hash ? { kind: "anchor", href: `#${hash}`, hash } : undefined;
  }

  if (SAFE_HTTP_REGEX.test(trimmed)) {
    return { kind: "external", href: trimmed };
  }

  // Reject javascript:, vbscript:, data:, file:, mailto:, protocol-relative URLs, etc.
  if (HAS_SCHEME_REGEX.test(trimmed) || trimmed.startsWith("//")) {
    return undefined;
  }

  const hashIdx = trimmed.indexOf("#");
  const pathPart = hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx);
  const hash = hashIdx === -1 ? undefined : trimmed.slice(hashIdx + 1).trim() || undefined;
  const resolvedTarget = resolveZipPath(dirnamePosix(chapterHref), pathPart);
  if (!resolvedTarget) {
    return hash ? { kind: "anchor", href: `#${hash}`, hash } : undefined;
  }

  const normalizedCurrent = resolveZipPath("", chapterHref);
  if (resolvedTarget === normalizedCurrent && hash) {
    return { kind: "anchor", href: `#${hash}`, hash };
  }

  return {
    kind: "chapter",
    href: trimmed,
    chapterHref: resolvedTarget,
    hash,
  };
}

function isFootnoteAnchor(el: DomElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== "a") return false;
  const epubType = el.attribs?.["epub:type"] ?? "";
  if (epubType.split(/\s+/).includes("noteref")) return true;
  const text = collectPlainText(el.children ?? []).trim();
  return /^[\[\(]?[\d*†‡§]+[\]\)]?$/.test(text);
}

function collectPlainText(nodes: DomNode[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") {
      out += n.data ?? "";
    } else if (isTagElement(n)) {
      out += collectPlainText(n.children ?? []);
    }
  }
  return out;
}

function pickSegmentAttrs(el: DomElement): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  const tag = el.tagName.toLowerCase();
  const raw = el.attribs ?? {};

  if (tag === "td" || tag === "th") {
    if (raw.colspan && /^\d+$/.test(raw.colspan.trim())) attrs.colSpan = raw.colspan.trim();
    if (raw.rowspan && /^\d+$/.test(raw.rowspan.trim())) attrs.rowSpan = raw.rowspan.trim();
    if (raw.scope && /^(row|col|rowgroup|colgroup)$/i.test(raw.scope.trim())) {
      attrs.scope = raw.scope.trim().toLowerCase();
    }
  }
  if (tag === "li" && raw.value && /^-?\d+$/.test(raw.value.trim())) {
    attrs.value = raw.value.trim();
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function sanitizeElementAttrs(
  el: DomElement,
  tag: string,
  ctx: {
    chapterHref: string;
    chapterDir: string;
    assetBaseUrl: string;
    inSvg: boolean;
    inMath: boolean;
  },
): { attrs?: Record<string, string>; link?: ChapterLinkMeta } {
  const raw = el.attribs ?? {};
  const attrs: Record<string, string> = {};
  let link: ChapterLinkMeta | undefined;

  if (ctx.inSvg) {
    for (const [k, v] of Object.entries(raw)) {
      const lower = k.toLowerCase();
      if (lower.startsWith("on") || lower === "style") continue;

      if (lower === "href" || lower === "xlink:href") {
        const val = v.trim();
        if (tag === "image") {
          const url = buildAssetUrl(ctx.assetBaseUrl, ctx.chapterDir, val);
          if (url) attrs.href = url;
        } else if (tag === "use" && val.startsWith("#")) {
          attrs.href = val;
        }
        continue;
      }

      if (!ALLOWED_SVG_ATTRS.has(lower)) continue;
      // Reject url(...) referencing external schemes in fill/stroke/clip-path
      if (/url\s*\(\s*['"]?(?!#)/i.test(v)) continue;
      const normalizedKey = SVG_ATTR_CASE_MAP[lower] ?? lower;
      attrs[normalizedKey] = v;
    }
    return { attrs: Object.keys(attrs).length > 0 ? attrs : undefined };
  }

  if (ctx.inMath) {
    for (const [k, v] of Object.entries(raw)) {
      const lower = k.toLowerCase();
      if (!ALLOWED_MATH_ATTRS.has(lower)) continue;
      attrs[lower] = v;
    }
    return { attrs: Object.keys(attrs).length > 0 ? attrs : undefined };
  }

  // Standard HTML element attributes
  if (raw.id?.trim()) attrs.id = raw.id.trim();
  if (raw.title?.trim()) attrs.title = raw.title.trim();
  if (raw.dir && /^(ltr|rtl|auto)$/i.test(raw.dir.trim())) attrs.dir = raw.dir.trim().toLowerCase();

  if (tag === "img") {
    const src = raw.src ? buildAssetUrl(ctx.assetBaseUrl, ctx.chapterDir, raw.src) : null;
    if (src) attrs.src = src;
    attrs.alt = (raw.alt ?? "").trim();
    if (raw.width && /^\d+(?:px)?$/i.test(raw.width.trim())) attrs.width = raw.width.trim().replace(/px$/i, "");
    if (raw.height && /^\d+(?:px)?$/i.test(raw.height.trim())) attrs.height = raw.height.trim().replace(/px$/i, "");
  } else if (tag === "a") {
    if (raw.href) {
      link = classifyChapterLink(raw.href, ctx.chapterHref);
    }
    if (isFootnoteAnchor(el)) {
      attrs["data-noteref"] = "true";
    }
  } else if (tag === "td" || tag === "th") {
    if (raw.colspan && /^\d+$/.test(raw.colspan.trim())) attrs.colSpan = raw.colspan.trim();
    if (raw.rowspan && /^\d+$/.test(raw.rowspan.trim())) attrs.rowSpan = raw.rowspan.trim();
    if (raw.scope && /^(row|col|rowgroup|colgroup)$/i.test(raw.scope.trim())) {
      attrs.scope = raw.scope.trim().toLowerCase();
    }
  } else if (tag === "col" || tag === "colgroup") {
    if (raw.span && /^\d+$/.test(raw.span.trim())) attrs.span = raw.span.trim();
  } else if (tag === "ol") {
    if (raw.start && /^-?\d+$/.test(raw.start.trim())) attrs.start = raw.start.trim();
    if (raw.type && /^[1aAiI]$/.test(raw.type.trim())) attrs.type = raw.type.trim();
  } else if (tag === "li") {
    if (raw.value && /^-?\d+$/.test(raw.value.trim())) attrs.value = raw.value.trim();
  }

  return {
    attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    link,
  };
}

export interface BuildChapterDocumentOptions {
  chapterHref: string;
  assetBaseUrl: string;
}

export interface BuiltChapterDocument {
  nodes: ChapterDocumentNode[];
  placeholderNodes: Record<string, Record<string, ChapterDocumentNode[]>>;
}

function walkNodes(
  rawNodes: DomNode[],
  blockDomPath: Map<DomElement, string>,
  ctx: {
    chapterHref: string;
    chapterDir: string;
    assetBaseUrl: string;
    parentTag: string;
    inPre: boolean;
    inSvg: boolean;
    inMath: boolean;
  },
): ChapterDocumentNode[] {
  const out: ChapterDocumentNode[] = [];

  for (const raw of rawNodes) {
    if (raw.type === "text") {
      const text = raw.data ?? "";
      if (!text) continue;
      if (!ctx.inPre && BLOCK_WHITESPACE_CONTAINERS.has(ctx.parentTag) && !text.trim()) {
        continue;
      }
      out.push({ kind: "text", text });
      continue;
    }

    if (!isTagElement(raw)) {
      continue;
    }

    const rawTag = raw.tagName.toLowerCase();

    // Check if this element is an extracted translatable leaf block
    const domPath = blockDomPath.get(raw);
    if (domPath) {
      const id = raw.attribs?.id?.trim() || undefined;
      const attrs = pickSegmentAttrs(raw);
      out.push({
        kind: "segment",
        domPath,
        tagName: rawTag,
        ...(id ? { id } : {}),
        ...(attrs ? { attrs } : {}),
      });
      continue;
    }

    if (DROP_SUBTREE_TAGS.has(rawTag)) {
      continue;
    }

    // HTML <title> is metadata; SVG <title> is allowed inside <svg>
    if (rawTag === "title" && !ctx.inSvg) {
      continue;
    }

    const enteringSvg = ctx.inSvg || rawTag === "svg";
    const enteringMath = ctx.inMath || rawTag === "math";
    const enteringPre = ctx.inPre || rawTag === "pre";

    const isAllowed = enteringSvg
      ? ALLOWED_SVG_TAGS.has(rawTag)
      : enteringMath
        ? ALLOWED_MATH_TAGS.has(rawTag)
        : ALLOWED_HTML_TAGS.has(rawTag);

    if (!isAllowed) {
      // Unwrap unknown wrapper tags safely while preserving their children
      const unwrapped = walkNodes(raw.children ?? [], blockDomPath, ctx);
      out.push(...unwrapped);
      continue;
    }

    const { attrs, link } = sanitizeElementAttrs(raw, rawTag, {
      chapterHref: ctx.chapterHref,
      chapterDir: ctx.chapterDir,
      assetBaseUrl: ctx.assetBaseUrl,
      inSvg: enteringSvg,
      inMath: enteringMath,
    });

    // Drop broken/unsafe <img> elements without a sanitized src
    if (rawTag === "img" && !attrs?.src) {
      continue;
    }

    const children = walkNodes(raw.children ?? [], blockDomPath, {
      chapterHref: ctx.chapterHref,
      chapterDir: ctx.chapterDir,
      assetBaseUrl: ctx.assetBaseUrl,
      parentTag: rawTag,
      inPre: enteringPre,
      inSvg: enteringSvg,
      inMath: enteringMath,
    });

    // Skip empty non-void decorative anchors/spans that carry neither id nor content
    const isVoidTag = rawTag === "img" || rawTag === "hr" || rawTag === "br" || rawTag === "wbr" || rawTag === "col";
    if (!isVoidTag && !enteringSvg && !enteringMath && children.length === 0 && !attrs?.id) {
      if (rawTag === "div" || rawTag === "section" || rawTag === "span") {
        continue;
      }
    }

    const outputTag = enteringSvg ? (SVG_TAG_CASE_MAP[rawTag] ?? rawTag) : rawTag;

    out.push({
      kind: "element",
      tagName: outputTag,
      ...(attrs ? { attrs } : {}),
      ...(link ? { link } : {}),
      children,
    });
  }

  return out;
}

export function sanitizeInlineHtmlFragment(
  rawHtml: string,
  options: BuildChapterDocumentOptions,
): ChapterDocumentNode[] {
  const wrapped = `<__frag__>${rawHtml}</__frag__>`;
  const $ = cheerio.load(wrapped, { xmlMode: true });
  const root = $("__frag__")[0] as unknown as DomElement | undefined;
  if (!root || !isTagElement(root)) return [];

  return walkNodes(root.children ?? [], new Map(), {
    chapterHref: options.chapterHref,
    chapterDir: dirnamePosix(options.chapterHref),
    assetBaseUrl: options.assetBaseUrl,
    parentTag: "span",
    inPre: false,
    inSvg: false,
    inMath: false,
  });
}

export function buildChapterDocument(
  xhtml: string,
  options: BuildChapterDocumentOptions,
): BuiltChapterDocument {
  const $ = cheerio.load(xhtml, { xmlMode: true });
  const blocks = selectTranslatableBlocks($);
  const blockDomPath = new Map<DomElement, string>();
  blocks.forEach((block, index) => {
    blockDomPath.set(block, `seg-${index}`);
  });

  const bodyEl = $("body")[0] as unknown as DomElement | undefined;
  const rootChildren: DomNode[] =
    bodyEl && isTagElement(bodyEl)
      ? bodyEl.children ?? []
      : (($.root()[0] as unknown as DomNode | undefined)?.children ?? []);

  const nodes = walkNodes(rootChildren, blockDomPath, {
    chapterHref: options.chapterHref,
    chapterDir: dirnamePosix(options.chapterHref),
    assetBaseUrl: options.assetBaseUrl,
    parentTag: "body",
    inPre: false,
    inSvg: false,
    inMath: false,
  });

  const extracted = extractChapterSegments(xhtml);
  const placeholderNodes: Record<string, Record<string, ChapterDocumentNode[]>> = {};

  for (const seg of extracted) {
    const voidMap: Record<string, ChapterDocumentNode[]> = {};
    for (const ph of seg.placeholders) {
      if (ph.kind === "void" && ph.rawHtml) {
        const sanitized = sanitizeInlineHtmlFragment(ph.rawHtml, options);
        if (sanitized.length > 0) {
          voidMap[ph.id] = sanitized;
        }
      }
    }
    if (Object.keys(voidMap).length > 0) {
      placeholderNodes[seg.domPath] = voidMap;
    }
  }

  return { nodes, placeholderNodes };
}

export function buildFallbackChapterNodes(
  segments: Array<Pick<SegmentRecord, "domPath" | "tagName">>,
): ChapterDocumentNode[] {
  return segments.map((seg) => ({
    kind: "segment",
    domPath: seg.domPath,
    tagName: seg.tagName,
  }));
}
