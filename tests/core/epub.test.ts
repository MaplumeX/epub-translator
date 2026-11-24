import * as cheerio from "cheerio";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  exportTranslatedEpub,
  parseEpubBuffer,
  restoreTemplateToXhtml,
  validateTranslatedPlaceholders,
} from "../../src/core/epub/index.js";
import { createSampleEpubBuffer } from "../fixtures/makeEpub.js";

describe("EPUB 2/3 parser, placeholder fidelity, and dual-mode exporter", () => {
  it("parses EPUB 3 metadata, nav TOC, protected inline placeholders, and skips <pre>", async () => {
    const buffer = await createSampleEpubBuffer({ version: "3" });
    const parsed = await parseEpubBuffer(buffer);

    expect(parsed.metadata.epubVersion).toBe("3");
    expect(parsed.metadata.title).toBe("The Distributed Systems Craft");
    expect(parsed.metadata.author).toBe("Ada Lovelace");
    expect(parsed.metadata.navXhtmlPath).toBe("OEBPS/nav.xhtml");
    expect(parsed.metadata.tocNcxPath).toBe("OEBPS/toc.ncx");
    expect(parsed.toc.map((t) => t.label)).toEqual(["Chapter 1: Foundations", "Chapter 2: Consensus"]);

    expect(parsed.chapters).toHaveLength(2);
    const ch1 = parsed.chapters[0];
    expect(ch1.title).toBe("Chapter 1: Foundations");

    // <h1>, <p> with code/em/noteref, <p> with math/link, 2x <li> (<pre> must be skipped)
    expect(ch1.segments).toHaveLength(5);
    expect(ch1.segments.some((s) => s.sourceTemplate.includes("untouchable"))).toBe(false);

    const codeSeg = ch1.segments[1];
    expect(codeSeg.sourceTemplate).toContain("[[V1]]");
    expect(codeSeg.sourceTemplate).toContain("[[I1]]strict ordering[[/I1]]");
    expect(codeSeg.sourceTemplate).toContain("[[V2]]");
    expect(codeSeg.placeholders.find((p) => p.id === "V1")?.rawHtml).toBe("<code>RaftNode.appendEntries()</code>");
    expect(codeSeg.placeholders.find((p) => p.id === "V2")?.rawHtml).toContain('epub:type="noteref"');

    const mathSeg = ch1.segments[2];
    expect(mathSeg.placeholders.find((p) => p.id === "V1")?.tagName).toBe("math");
    expect(mathSeg.placeholders.find((p) => p.id === "I1")?.openTag).toBe('<a href="chapter2.xhtml">');
  });

  it("parses EPUB 2 books with toc.ncx cleanly", async () => {
    const buffer = await createSampleEpubBuffer({ version: "2", title: "Classic Monograph" });
    const parsed = await parseEpubBuffer(buffer);

    expect(parsed.metadata.epubVersion).toBe("2");
    expect(parsed.metadata.navXhtmlPath).toBeUndefined();
    expect(parsed.metadata.tocNcxPath).toBe("OEBPS/toc.ncx");
    expect(parsed.toc).toHaveLength(2);
    expect(parsed.chapters[1].segments).toHaveLength(3); // h1, blockquote > p (not blockquote itself), p
  });

  it("validates placeholders strictly and escapes XML entities on restore", async () => {
    const buffer = await createSampleEpubBuffer({ version: "3" });
    const parsed = await parseEpubBuffer(buffer);
    const codeSeg = parsed.chapters[0].segments[1];

    expect(
      validateTranslatedPlaceholders(
        "在持久化日志前，按[[I1]]严格顺序[[/I1]][[V2]]调用 [[V1]]（保证 A < B & C > D）。",
        codeSeg.placeholders,
      ),
    ).toEqual({ valid: true });

    // Missing placeholder
    expect(
      validateTranslatedPlaceholders("按[[I1]]严格顺序[[/I1]]调用 [[V1]]。", codeSeg.placeholders).valid,
    ).toBe(false);

    // Unclosed paired placeholder
    expect(
      validateTranslatedPlaceholders("按[[I1]]严格顺序[[V2]]调用 [[V1]]。", codeSeg.placeholders).valid,
    ).toBe(false);

    const restored = restoreTemplateToXhtml(
      "在持久化日志前，按[[I1]]严格顺序[[/I1]][[V2]]调用 [[V1]]（A < B & C > D）。",
      codeSeg.placeholders,
    );
    expect(restored).toContain("<em>严格顺序</em>");
    expect(restored).toContain('epub:type="noteref"');
    expect(restored).toContain("<code>RaftNode.appendEntries()</code>");
    expect(restored).toContain("A &lt; B &amp; C &gt; D");
  });

  it("exports bilingual EPUB with uncompressed leading mimetype, CSS injection, intact <pre>, and translated TOC/metadata", async () => {
    const sourceBuffer = await createSampleEpubBuffer({ version: "3" });
    const parsed = await parseEpubBuffer(sourceBuffer);

    const ch1 = parsed.chapters[0];
    const ch2 = parsed.chapters[1];

    const exported = await exportTranslatedEpub({
      sourceBuffer,
      opfPath: parsed.metadata.opfPath,
      tocNcxPath: parsed.metadata.tocNcxPath,
      navXhtmlPath: parsed.metadata.navXhtmlPath,
      outputMode: "bilingual",
      translatedTitle: "分布式系统之道",
      translatedDescription: "一本简洁的可靠系统指南。",
      chapters: [
        {
          href: ch1.href,
          title: ch1.title,
          translatedTitle: "第 1 章：基础",
          segments: [
            {
              domPath: ch1.segments[0].domPath,
              placeholders: ch1.segments[0].placeholders,
              status: "translated",
              translatedTemplate: "第 1 章：基础",
            },
            {
              domPath: ch1.segments[1].domPath,
              placeholders: ch1.segments[1].placeholders,
              status: "translated",
              translatedTemplate: "在持久化日志前，按[[I1]]严格顺序[[/I1]][[V2]]调用 [[V1]]。",
            },
            {
              // Intentionally corrupted placeholder -> must safely fall back to untouched original
              domPath: ch1.segments[2].domPath,
              placeholders: ch1.segments[2].placeholders,
              status: "translated",
              translatedTemplate: "缺少占位符的坏译文",
            },
            {
              domPath: ch1.segments[3].domPath,
              placeholders: ch1.segments[3].placeholders,
              status: "translated",
              translatedTemplate: "第一条不变量保护[[I1]]持久状态[[/I1]]安全。",
            },
          ],
        },
        {
          href: ch2.href,
          title: ch2.title,
          translatedTitle: "第 2 章：共识",
          segments: [
            {
              domPath: ch2.segments[2].domPath,
              placeholders: ch2.segments[2].placeholders,
              status: "translated",
              translatedTemplate: "使用 A < B & C > D 进行比较而不破坏 XML。",
            },
          ],
        },
      ],
    });

    // Verify ZIP local file header starts with uncompressed "mimetype"
    expect(exported.subarray(30, 38).toString("ascii")).toBe("mimetype");
    expect(exported.readUInt16LE(8)).toBe(0); // compression method 0 = STORE

    const outZip = await JSZip.loadAsync(exported);
    expect(outZip.file("OEBPS/epub-translator-bilingual.css")).not.toBeNull();

    const opfXml = await outZip.file("OEBPS/content.opf")!.async("string");
    expect(opfXml).toContain("分布式系统之道 / The Distributed Systems Craft");
    expect(opfXml).toContain("epub-translator-bilingual.css");

    const navXml = await outZip.file("OEBPS/nav.xhtml")!.async("string");
    expect(navXml).toContain("第 1 章：基础 / Chapter 1: Foundations");

    const ncxXml = await outZip.file("OEBPS/toc.ncx")!.async("string");
    expect(ncxXml).toContain("第 2 章：共识 / Chapter 2: Consensus");

    const ch1Out = await outZip.file("OEBPS/text/chapter1.xhtml")!.async("string");
    const $ch1 = cheerio.load(ch1Out, { xmlMode: true });
    expect($ch1("pre code").text()).toBe("function untouchable(x) { return x * 2; }");
    expect($ch1('link[href="../epub-translator-bilingual.css"]').length).toBe(1);
    expect($ch1("h1 span.epub-tr-zh").text()).toBe("第 1 章：基础");
    expect($ch1("p.epub-tr-zh").first().html()).toContain("<code>RaftNode.appendEntries()</code>");
    expect($ch1("p.epub-tr-zh").first().html()).toContain('epub:type="noteref"');
    // Corrupted segment 2 fell back cleanly (not written)
    expect(ch1Out).not.toContain("缺少占位符的坏译文");
    // List numbering preserved: still exactly 2 <li> elements
    expect($ch1("ol > li")).toHaveLength(2);
    expect($ch1("ol > li").first().find("div.epub-tr-zh strong").text()).toBe("持久状态");

    // Untouched binary cover image preserved byte-for-byte
    const coverBytes = await outZip.file("OEBPS/images/cover.png")!.async("uint8array");
    expect(Array.from(coverBytes)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("exports translated_only EPUB replacing content in place without bilingual stylesheet", async () => {
    const sourceBuffer = await createSampleEpubBuffer({ version: "3" });
    const parsed = await parseEpubBuffer(sourceBuffer);
    const ch1 = parsed.chapters[0];

    const exported = await exportTranslatedEpub({
      sourceBuffer,
      opfPath: parsed.metadata.opfPath,
      tocNcxPath: parsed.metadata.tocNcxPath,
      navXhtmlPath: parsed.metadata.navXhtmlPath,
      outputMode: "translated_only",
      translatedTitle: "分布式系统之道",
      chapters: [
        {
          href: ch1.href,
          title: ch1.title,
          translatedTitle: "第 1 章：基础",
          segments: [
            {
              domPath: ch1.segments[0].domPath,
              placeholders: ch1.segments[0].placeholders,
              status: "translated",
              translatedTemplate: "第 1 章：基础",
            },
            {
              domPath: ch1.segments[1].domPath,
              placeholders: ch1.segments[1].placeholders,
              status: "translated",
              translatedTemplate: "在持久化日志前，按[[I1]]严格顺序[[/I1]][[V2]]调用 [[V1]]。",
            },
          ],
        },
      ],
    });

    const outZip = await JSZip.loadAsync(exported);
    expect(outZip.file("OEBPS/epub-translator-bilingual.css")).toBeNull();
    const ch1Out = await outZip.file("OEBPS/text/chapter1.xhtml")!.async("string");
    expect(ch1Out).not.toContain("Chapter 1: Foundations");
    expect(ch1Out).toContain("<h1>第 1 章：基础</h1>");
    expect(ch1Out).toContain("<code>RaftNode.appendEntries()</code>");
    expect(ch1Out).toContain("function untouchable(x) { return x * 2; }");
  });
});
