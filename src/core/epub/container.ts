import * as cheerio from "cheerio";
import JSZip from "jszip";
import type { BookMetadata, ParsedChapter, ParsedEpub, TocEntry } from "../types.js";
import { extractChapterSegments } from "./xhtml.js";

export function dirnamePosix(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

export function resolveZipPath(baseDir: string, relativeHref: string): string {
  const cleanHref = decodeURIComponent(relativeHref.split("#")[0] ?? "");
  const rawParts = (baseDir ? `${baseDir}/${cleanHref}` : cleanHref).split("/");
  const stack: string[] = [];
  for (const part of rawParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
}

export function relativePosixPath(fromDir: string, toPath: string): string {
  const fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
  const toParts = toPath.split("/").filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const ups = Array(fromParts.length - common).fill("..");
  const downs = toParts.slice(common);
  return [...ups, ...downs].join("/") || toPath;
}

function parseTocNcx(ncxXml: string, ncxDir: string, ncxPath: string): TocEntry[] {
  const $ = cheerio.load(ncxXml, { xmlMode: true });
  const entries: TocEntry[] = [];
  $("navPoint").each((index, el) => {
    const label = $(el).children("navLabel").children("text").first().text().trim();
    const src = $(el).children("content").first().attr("src")?.trim();
    if (!label || !src) return;
    entries.push({
      id: $(el).attr("id") ?? `ncx-${index}`,
      label,
      href: resolveZipPath(ncxDir, src),
      sourceFile: ncxPath,
      orderIndex: index,
    });
  });
  return entries;
}

function parseNavXhtml(navXml: string, navDir: string, navPath: string): TocEntry[] {
  const $ = cheerio.load(navXml, { xmlMode: true });
  let tocNav = $("nav").filter((_, el) => {
    const epubType = ($(el).attr("epub:type") ?? $(el).attr("type") ?? "").split(/\s+/);
    return epubType.includes("toc");
  }).first();
  if (tocNav.length === 0) {
    tocNav = $("nav").first();
  }

  const entries: TocEntry[] = [];
  tocNav.find("a[href]").each((index, el) => {
    const label = $(el).text().replace(/\s+/g, " ").trim();
    const href = $(el).attr("href")?.trim();
    if (!label || !href) return;
    entries.push({
      id: `nav-${index}`,
      label,
      href: resolveZipPath(navDir, href),
      sourceFile: navPath,
      orderIndex: index,
    });
  });
  return entries;
}

function extractChapterTitle(xhtml: string, fallbackIndex: number): string {
  const $ = cheerio.load(xhtml, { xmlMode: true });
  const heading = $("h1, h2, h3").first().text().replace(/\s+/g, " ").trim();
  if (heading) return heading;
  const docTitle = $("head title").first().text().replace(/\s+/g, " ").trim();
  if (docTitle) return docTitle;
  return `Chapter ${fallbackIndex + 1}`;
}

export async function parseEpubBuffer(buffer: Buffer | Uint8Array): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(buffer);
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("无效 EPUB：缺少 META-INF/container.xml");
  }

  const containerXml = await containerFile.async("string");
  const $container = cheerio.load(containerXml, { xmlMode: true });
  const opfPath = $container("rootfile").first().attr("full-path")?.trim();
  if (!opfPath) {
    throw new Error("无效 EPUB：container.xml 中未找到 OPF rootfile");
  }

  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`无效 EPUB：找不到 OPF 文件 (${opfPath})`);
  }

  const opfXml = await opfFile.async("string");
  const $opf = cheerio.load(opfXml, { xmlMode: true });
  const opfDir = dirnamePosix(opfPath);

  const packageVersion = $opf("package").first().attr("version") ?? "2.0";
  const epubVersion: "2" | "3" = packageVersion.trim().startsWith("3") ? "3" : "2";

  const getMetaText = (tag: string): string => {
    const prefixed = $opf(`metadata ${tag.replace(":", "\\:")}`).first().text().trim();
    if (prefixed) return prefixed;
    const local = tag.includes(":") ? tag.split(":")[1] : tag;
    return $opf("metadata *")
      .filter((_, el) => el.type === "tag" && (el.tagName.toLowerCase() === tag || el.tagName.toLowerCase().endsWith(`:${local}`)))
      .first()
      .text()
      .trim();
  };

  interface ManifestItem {
    id: string;
    href: string;
    mediaType: string;
    properties: string[];
  }

  const manifestById = new Map<string, ManifestItem>();
  let tocNcxPath: string | undefined;
  let navXhtmlPath: string | undefined;

  $opf("manifest item").each((_, el) => {
    const id = $opf(el).attr("id")?.trim();
    const rawHref = $opf(el).attr("href")?.trim();
    const mediaType = $opf(el).attr("media-type")?.trim() ?? "";
    const properties = ($opf(el).attr("properties") ?? "").split(/\s+/).filter(Boolean);
    if (!id || !rawHref) return;

    const href = resolveZipPath(opfDir, rawHref);
    manifestById.set(id, { id, href, mediaType, properties });

    if (mediaType === "application/x-dtbncx+xml") {
      tocNcxPath = href;
    }
    if (properties.includes("nav")) {
      navXhtmlPath = href;
    }
  });

  const spineTocId = $opf("spine").first().attr("toc")?.trim();
  if (!tocNcxPath && spineTocId && manifestById.has(spineTocId)) {
    tocNcxPath = manifestById.get(spineTocId)!.href;
  }

  const toc: TocEntry[] = [];
  if (navXhtmlPath) {
    const navFile = zip.file(navXhtmlPath);
    if (navFile) {
      toc.push(...parseNavXhtml(await navFile.async("string"), dirnamePosix(navXhtmlPath), navXhtmlPath));
    }
  }
  if (toc.length === 0 && tocNcxPath) {
    const ncxFile = zip.file(tocNcxPath);
    if (ncxFile) {
      toc.push(...parseTocNcx(await ncxFile.async("string"), dirnamePosix(tocNcxPath), tocNcxPath));
    }
  }

  const tocTitleByHref = new Map<string, string>();
  for (const entry of toc) {
    if (!tocTitleByHref.has(entry.href)) {
      tocTitleByHref.set(entry.href, entry.label);
    }
  }

  const chapters: ParsedChapter[] = [];
  const spineItems = $opf("spine itemref").toArray();
  let chapterIdx = 0;

  for (const itemref of spineItems) {
    const idref = $opf(itemref).attr("idref")?.trim();
    if (!idref) continue;
    const item = manifestById.get(idref);
    if (!item) continue;

    const isHtml =
      item.mediaType === "application/xhtml+xml" ||
      item.mediaType === "text/html" ||
      /\.(xhtml|html|htm)$/i.test(item.href);
    if (!isHtml) continue;
    // Skip dedicated EPUB 3 nav document from body chapters (it is translated as TOC)
    if (item.properties.includes("nav")) continue;

    const entryFile = zip.file(item.href);
    if (!entryFile) continue;

    const xhtml = await entryFile.async("string");
    const segments = extractChapterSegments(xhtml);
    const title = tocTitleByHref.get(item.href) ?? extractChapterTitle(xhtml, chapterIdx);

    chapters.push({
      orderIndex: chapterIdx,
      spineId: idref,
      href: item.href,
      title,
      segments,
    });
    chapterIdx += 1;
  }

  const metadata: BookMetadata = {
    title: getMetaText("dc:title") || "Untitled EPUB",
    author: getMetaText("dc:creator") || "Unknown Author",
    language: getMetaText("dc:language") || "en",
    description: getMetaText("dc:description") || undefined,
    identifier: getMetaText("dc:identifier") || undefined,
    epubVersion,
    opfPath,
    tocNcxPath,
    navXhtmlPath,
  };

  return { metadata, chapters, toc };
}
