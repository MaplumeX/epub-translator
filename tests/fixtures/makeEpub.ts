import JSZip from "jszip";

export interface SampleEpubOptions {
  version?: "2" | "3";
  title?: string;
  author?: string;
  description?: string;
}

export async function createSampleEpubBuffer(options: SampleEpubOptions = {}): Promise<Buffer> {
  const version = options.version ?? "3";
  const title = options.title ?? "The Distributed Systems Craft";
  const author = options.author ?? "Ada Lovelace";
  const description = options.description ?? "A concise field guide to reliable systems and quiet prose.";

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const navManifestItem =
    version === "3"
      ? `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
      : "";

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version === "3" ? "3.0" : "2.0"}" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:12345678-1234-1234-1234-1234567890ab</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>${description}</dc:description>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${navManifestItem}
    <item id="ch1" href="text/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover-img" href="images/cover.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx">
    ${version === "3" ? '<itemref idref="nav" linear="no"/>' : ""}
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

  zip.file("OEBPS/content.opf", opf);

  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-1234567890ab"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel><text>Chapter 1: Foundations</text></navLabel>
      <content src="text/chapter1.xhtml"/>
    </navPoint>
    <navPoint id="np-2" playOrder="2">
      <navLabel><text>Chapter 2: Consensus</text></navLabel>
      <content src="text/chapter2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
  );

  if (version === "3") {
    zip.file(
      "OEBPS/nav.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc">
      <h1>Contents</h1>
      <ol>
        <li><a href="text/chapter1.xhtml">Chapter 1: Foundations</a></li>
        <li><a href="text/chapter2.xhtml">Chapter 2: Consensus</a></li>
      </ol>
    </nav>
  </body>
</html>`,
    );
  }

  zip.file(
    "OEBPS/text/chapter1.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>Chapter 1</title>
  </head>
  <body>
    <h1>Chapter 1: Foundations</h1>
    <p>Call <code>RaftNode.appendEntries()</code> with <em>strict ordering</em><a epub:type="noteref" href="#fn1">1</a> before persisting logs.</p>
    <pre><code>function untouchable(x) { return x * 2; }</code></pre>
    <p>The latency bound <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>O</mi><mo>(</mo><mi>n</mi><mo>)</mo></math> holds when <a href="chapter2.xhtml">quorum consensus</a> succeeds.</p>
    <ol>
      <li>First invariant keeps <strong>durable state</strong> safe.</li>
      <li>Second invariant isolates transient faults.</li>
    </ol>
  </body>
</html>`,
  );

  zip.file(
    "OEBPS/text/chapter2.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>Chapter 2</title>
  </head>
  <body>
    <h1>Chapter 2: Consensus</h1>
    <blockquote>
      <p>Simplicity is prerequisite for reliability.</p>
    </blockquote>
    <p>Compare values using A &lt; B &amp; C &gt; D without breaking XML.</p>
  </body>
</html>`,
  );

  // Tiny valid PNG binary payload to verify untouched binary passthrough
  zip.file(
    "OEBPS/images/cover.png",
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  return zip.generateAsync({ type: "nodebuffer" });
}
