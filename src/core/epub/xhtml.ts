import * as cheerio from "cheerio";
import type { ExtractedSegment, InlinePlaceholder, OutputMode } from "../types.js";

type DomNode = {
  type: string;
  data?: string;
  tagName?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
  parent?: DomNode | null;
};

type DomElement = DomNode & {
  type: "tag";
  tagName: string;
  attribs: Record<string, string>;
  children: DomNode[];
};

function isTagElement(node: unknown): node is DomElement {
  return typeof node === "object" && node !== null && (node as DomNode).type === "tag" && typeof (node as DomNode).tagName === "string";
}

// Extracting and restoring blocks via identical deterministic DOM traversal keeps segment domPaths stable
// and guarantees failed translations safely fall back to untouched XHTML.
// See ADR 2026-11-24-epub-translator-architecture.

const CANDIDATE_BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "figcaption",
  "td",
  "th",
  "dt",
  "dd",
]);

const CONTAINER_OR_SKIP_DESCENDANT_TAGS = new Set([
  ...CANDIDATE_BLOCK_TAGS,
  "pre",
  "div",
  "ul",
  "ol",
  "dl",
  "table",
  "section",
  "article",
  "aside",
  "nav",
  "header",
  "footer",
  "figure",
  "hr",
]);

const SKIP_ANCESTOR_TAGS = new Set(["pre", "script", "style", "svg", "math", "head", "title"]);

const OPAQUE_INLINE_TAGS = new Set([
  "code",
  "kbd",
  "samp",
  "var",
  "math",
  "svg",
  "img",
  "br",
  "hr",
  "wbr",
  "ruby",
  "audio",
  "video",
  "iframe",
  "object",
  "input",
]);

const PAIRED_INLINE_TAGS = new Set([
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "small",
  "span",
  "a",
  "sup",
  "sub",
  "cite",
  "q",
  "abbr",
  "dfn",
  "time",
  "bdi",
  "bdo",
]);

const INLINE_BILINGUAL_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "figcaption", "td", "th", "dt", "dd"]);

export function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function serializeOpenTag(el: DomElement): string {
  const attrs = el.attribs ?? {};
  const attrParts = Object.entries(attrs).map(([k, v]) => `${k}="${escapeXmlAttr(String(v))}"`);
  return attrParts.length > 0 ? `<${el.tagName} ${attrParts.join(" ")}>` : `<${el.tagName}>`;
}

function isFootnoteMarker($: cheerio.CheerioAPI, el: DomElement): boolean {
  const tag = el.tagName.toLowerCase();
  const text = $(el as never).text().trim();
  const epubType = el.attribs?.["epub:type"] ?? "";
  if (epubType.split(/\s+/).includes("noteref")) {
    return true;
  }
  if ((tag === "sup" || tag === "a") && /^[\[\(]?[\d*†‡§]+[\]\)]?$/.test(text)) {
    return true;
  }
  if (tag === "sup") {
    const childA = $(el as never).children("a");
    if (childA.length === 1 && $(el as never).text().trim() === childA.text().trim() && text.length <= 6) {
      return true;
    }
  }
  return false;
}

function hasTranslatableContent(text: string): boolean {
  const stripped = text.replace(/\s+/g, " ").trim();
  if (!stripped) return false;
  // Must contain at least one letter (Latin, CJK, Greek, Cyrillic, etc.)
  return /\p{L}/u.test(stripped);
}

function hasSkippedAncestor(el: DomElement): boolean {
  let curr = el.parent;
  while (curr && isTagElement(curr)) {
    if (SKIP_ANCESTOR_TAGS.has(curr.tagName.toLowerCase())) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

function hasNestedBlockDescendant($: cheerio.CheerioAPI, el: DomElement): boolean {
  const descendants = $(el as never).find("*");
  for (let i = 0; i < descendants.length; i++) {
    const node: unknown = descendants[i];
    if (isTagElement(node) && CONTAINER_OR_SKIP_DESCENDANT_TAGS.has(node.tagName.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function selectTranslatableBlocks($: cheerio.CheerioAPI): DomElement[] {
  const body = $("body");
  const candidates = body.length > 0 ? body.find("*") : $("*");
  const blocks: DomElement[] = [];

  candidates.each((_, rawNode) => {
    const node: unknown = rawNode;
    if (!isTagElement(node)) return;
    const tag = node.tagName.toLowerCase();
    if (!CANDIDATE_BLOCK_TAGS.has(tag)) return;
    if (hasSkippedAncestor(node)) return;
    if (hasNestedBlockDescendant($, node)) return;

    // Inspect whether there is actual translatable text outside opaque inline tags
    const clone = $(node as never).clone();
    clone.find("code,kbd,samp,var,math,svg,script,style").remove();
    const visibleText = clone.text();
    if (!hasTranslatableContent(visibleText)) return;

    blocks.push(node);
  });

  return blocks;
}

interface FoldResult {
  template: string;
  plain: string;
  placeholders: InlinePlaceholder[];
}

function foldChildren($: cheerio.CheerioAPI, nodes: DomNode[]): FoldResult {
  const placeholders: InlinePlaceholder[] = [];
  let inlineCounter = 0;
  let voidCounter = 0;

  function walk(children: DomNode[]): { template: string; plain: string } {
    let tpl = "";
    let plain = "";

    for (const child of children) {
      if (child.type === "text") {
        const txt = child.data ?? "";
        tpl += txt;
        plain += txt;
        continue;
      }

      if (!isTagElement(child)) {
        continue;
      }

      const tag = child.tagName.toLowerCase();

      if (OPAQUE_INLINE_TAGS.has(tag) || isFootnoteMarker($, child)) {
        voidCounter += 1;
        const id = `V${voidCounter}`;
        const rawHtml = $.html(child as never);
        placeholders.push({
          id,
          kind: "void",
          tagName: tag,
          rawHtml,
        });
        tpl += `[[${id}]]`;
        if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "var") {
          plain += `\`${$(child as never).text()}\``;
        } else if (tag === "math" || tag === "svg") {
          plain += "[公式/图形]";
        } else if (tag === "br") {
          plain += " ";
        } else if (tag === "img") {
          const alt = child.attribs?.alt?.trim();
          plain += alt ? `[图片:${alt}]` : "[图片]";
        } else {
          plain += $(child as never).text();
        }
        continue;
      }

      if (PAIRED_INLINE_TAGS.has(tag)) {
        const inner = walk(child.children ?? []);
        if (!inner.template) {
          // Preserve empty anchor/span (e.g. `<a id="page_12"/>`) as opaque void placeholder
          voidCounter += 1;
          const id = `V${voidCounter}`;
          placeholders.push({
            id,
            kind: "void",
            tagName: tag,
            rawHtml: $.html(child as never),
          });
          tpl += `[[${id}]]`;
        } else {
          inlineCounter += 1;
          const id = `I${inlineCounter}`;
          placeholders.push({
            id,
            kind: "paired",
            tagName: tag,
            openTag: serializeOpenTag(child),
            closeTag: `</${child.tagName}>`,
          });
          tpl += `[[${id}]]${inner.template}[[/${id}]]`;
          plain += inner.plain;
        }
        continue;
      }

      // Unknown inline element: preserve verbatim as opaque payload so XHTML never breaks
      voidCounter += 1;
      const id = `V${voidCounter}`;
      placeholders.push({
        id,
        kind: "void",
        tagName: tag,
        rawHtml: $.html(child as never),
      });
      tpl += `[[${id}]]`;
      plain += $(child as never).text();
    }

    return { template: tpl, plain };
  }

  const walked = walk(nodes);
  return {
    template: walked.template.replace(/\s+/g, " ").trim(),
    plain: walked.plain.replace(/\s+/g, " ").trim(),
    placeholders,
  };
}

const XML_LOAD_OPTIONS = { xmlMode: true };

/** Serialize XML safely with &/< /> escaped while decoding non-ASCII hex entities back to clean UTF-8. */
export function serializeUtf8Xml($: cheerio.CheerioAPI): string {
  return $.xml().replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    // Keep ASCII & XML-sensitive chars encoded; emit clean UTF-8 for printable non-ASCII characters (incl. CJK)
    if (code >= 0xa0 && code <= 0x10ffff) {
      return String.fromCodePoint(code);
    }
    return match;
  });
}

export function extractChapterSegments(xhtml: string): ExtractedSegment[] {
  const $ = cheerio.load(xhtml, XML_LOAD_OPTIONS);
  const blocks = selectTranslatableBlocks($);

  return blocks.map((block, index) => {
    const folded = foldChildren($, block.children ?? []);
    return {
      orderIndex: index,
      domPath: `seg-${index}`,
      tagName: block.tagName.toLowerCase(),
      sourceTemplate: folded.template,
      sourcePlain: folded.plain,
      sourceHtml: $(block as never).html() ?? "",
      placeholders: folded.placeholders,
    };
  });
}

export function templateToPlainText(template: string, placeholders: InlinePlaceholder[]): string {
  const map = new Map(placeholders.map((p) => [p.id, p]));
  return template
    .replace(/\[\[(\/?)([IV]\d+)\]\]/g, (_match, slash: string, id: string) => {
      const ph = map.get(id);
      if (!ph) return "";
      if (ph.kind === "paired") return "";
      if (slash) return "";
      if (ph.rawHtml) {
        const $ = cheerio.load(ph.rawHtml, { xmlMode: true });
        if (ph.tagName === "code" || ph.tagName === "kbd" || ph.tagName === "samp" || ph.tagName === "var") {
          return `\`${$.root().text()}\``;
        }
        if (ph.tagName === "math" || ph.tagName === "svg") return "[公式/图形]";
        if (ph.tagName === "br") return " ";
        return $.root().text();
      }
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export interface PlaceholderValidationResult {
  valid: boolean;
  reason?: string;
}

const TOKEN_REGEX = /\[\[(\/?)([IV]\d+)\]\]/g;

export function validateTranslatedPlaceholders(
  translatedTemplate: string,
  placeholders: InlinePlaceholder[],
): PlaceholderValidationResult {
  const expectedById = new Map(placeholders.map((p) => [p.id, p]));
  const openCounts = new Map<string, number>();
  const closeCounts = new Map<string, number>();
  const stack: string[] = [];

  for (const match of translatedTemplate.matchAll(TOKEN_REGEX)) {
    const isClose = match[1] === "/";
    const id = match[2];
    const spec = expectedById.get(id);

    if (!spec) {
      return { valid: false, reason: `存在未知占位符 [[${isClose ? "/" : ""}${id}]]` };
    }

    if (spec.kind === "void") {
      if (isClose) {
        return { valid: false, reason: `单标签占位符 [[${id}]] 不应出现闭合标记` };
      }
      openCounts.set(id, (openCounts.get(id) ?? 0) + 1);
      continue;
    }

    // Paired placeholder nesting check
    if (!isClose) {
      openCounts.set(id, (openCounts.get(id) ?? 0) + 1);
      stack.push(id);
    } else {
      closeCounts.set(id, (closeCounts.get(id) ?? 0) + 1);
      const top = stack.pop();
      if (top !== id) {
        return { valid: false, reason: `成对占位符 [[${id}]] 嵌套或闭合顺序错误` };
      }
    }
  }

  if (stack.length > 0) {
    return { valid: false, reason: `成对占位符 [[${stack[stack.length - 1]}]] 缺少闭合标记` };
  }

  for (const ph of placeholders) {
    const opens = openCounts.get(ph.id) ?? 0;
    if (opens !== 1) {
      return {
        valid: false,
        reason: opens === 0 ? `缺少必需占位符 [[${ph.id}]]` : `占位符 [[${ph.id}]] 重复出现 ${opens} 次`,
      };
    }
    if (ph.kind === "paired") {
      const closes = closeCounts.get(ph.id) ?? 0;
      if (closes !== 1) {
        return { valid: false, reason: `成对占位符 [[/${ph.id}]] 数量不匹配` };
      }
    }
  }

  return { valid: true };
}

export function restoreTemplateToXhtml(
  translatedTemplate: string,
  placeholders: InlinePlaceholder[],
): string {
  const check = validateTranslatedPlaceholders(translatedTemplate, placeholders);
  if (!check.valid) {
    throw new Error(check.reason ?? "占位符校验失败");
  }

  const byId = new Map(placeholders.map((p) => [p.id, p]));
  let out = "";
  let lastIndex = 0;

  for (const match of translatedTemplate.matchAll(TOKEN_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      out += escapeXmlText(translatedTemplate.slice(lastIndex, idx));
    }
    const isClose = match[1] === "/";
    const id = match[2];
    const spec = byId.get(id)!;

    if (spec.kind === "void") {
      out += spec.rawHtml ?? "";
    } else {
      out += isClose ? (spec.closeTag ?? `</${spec.tagName}>`) : (spec.openTag ?? `<${spec.tagName}>`);
    }
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < translatedTemplate.length) {
    out += escapeXmlText(translatedTemplate.slice(lastIndex));
  }

  return out;
}

export interface ChapterSegmentTranslation {
  domPath: string;
  translatedTemplate: string | null;
  placeholders: InlinePlaceholder[];
  status: string;
}

export function applyTranslationsToChapterXhtml(
  originalXhtml: string,
  translationsByDomPath: Map<string, ChapterSegmentTranslation>,
  outputMode: OutputMode,
  bilingualCssHref?: string,
): string {
  const $ = cheerio.load(originalXhtml, XML_LOAD_OPTIONS);
  const blocks = selectTranslatableBlocks($);

  blocks.forEach((block, index) => {
    const domPath = `seg-${index}`;
    const entry = translationsByDomPath.get(domPath);
    if (!entry || entry.status !== "translated" || !entry.translatedTemplate?.trim()) {
      return;
    }

    let restoredXhtml: string;
    try {
      restoredXhtml = restoreTemplateToXhtml(entry.translatedTemplate, entry.placeholders);
    } catch {
      // Fall back to untouched original block rather than emitting broken XHTML
      return;
    }

    const $block = $(block as never);
    const tag = block.tagName.toLowerCase();

    if (outputMode === "translated_only") {
      $block.html(restoredXhtml);
      return;
    }

    // Bilingual writeback: preserve list numbering and table columns safely
    if (INLINE_BILINGUAL_TAGS.has(tag)) {
      $block.append(`<br/><span class="epub-tr-zh">${restoredXhtml}</span>`);
      return;
    }

    if (tag === "li") {
      $block.addClass("epub-tr-orig");
      $block.append(`<div class="epub-tr-zh">${restoredXhtml}</div>`);
      return;
    }

    $block.addClass("epub-tr-orig");
    $block.after(`<p class="epub-tr-zh">${restoredXhtml}</p>`);
  });

  if (outputMode === "bilingual" && bilingualCssHref) {
    const head = $("head");
    if (head.length > 0 && head.find(`link[href="${bilingualCssHref}"]`).length === 0) {
      head.append(`\n  <link rel="stylesheet" type="text/css" href="${escapeXmlAttr(bilingualCssHref)}"/>\n`);
    }
  }

  return serializeUtf8Xml($);
}
