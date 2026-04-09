import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { extractEpubMetadata, writeEpubOpfMetadata } from "./index";

async function buildMinimalEpub() {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>  The   Title </dc:title>
    <dc:creator>Jane Doe</dc:creator>
    <dc:creator> John   Smith </dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier>9781234567890</dc:identifier>
    <dc:identifier>0-306-40615-2</dc:identifier>
    <dc:description> Hello   world </dc:description>
  </metadata>
  <manifest>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image" />
  </manifest>
</package>`,
  );
  zip.file("OEBPS/images/cover.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("extractEpubMetadata", () => {
  it("extracts basic metadata + cover", async () => {
    const epub = await buildMinimalEpub();
    const meta = await extractEpubMetadata(epub);
    expect(meta.title).toBe("The Title");
    expect(meta.authors).toEqual(["Jane Doe", "John Smith"]);
    expect(meta.language).toBe("en");
    expect(meta.isbn13).toBe("9781234567890");
    expect(meta.isbn10).toBe("0306406152");
    expect(meta.description).toBe("Hello world");
    expect(meta.cover?.mimeType).toBe("image/jpeg");
    expect(meta.cover?.ext).toBe("jpg");
    expect(meta.cover?.bytes.length).toBeGreaterThan(0);
  });
});

describe("writeEpubOpfMetadata", () => {
  it("updates OPF metadata and keeps a valid ZIP", async () => {
    const epub = await buildMinimalEpub();
    const updated = await writeEpubOpfMetadata(epub, {
      title: "New Title",
      authors: ["Alice", "Bob"],
      language: "fr",
      description: "New Desc",
      isbn10: "0306406152",
      isbn13: "9781234567890",
      publisher: "Pub",
      publishDate: "2024-01-01",
      subjects: ["S1", "S2"],
    });

    const zip = await JSZip.loadAsync(updated);
    const opf = await zip.file("OEBPS/content.opf")?.async("text");
    expect(typeof opf).toBe("string");
    expect(opf).toMatch(/<dc:title>New Title<\/dc:title>/);
    expect(opf).toMatch(/<dc:language>fr<\/dc:language>/);
    expect(opf).toMatch(/<dc:publisher>Pub<\/dc:publisher>/);
    expect(opf).toMatch(/<dc:date>2024-01-01<\/dc:date>/);
    expect(opf).toMatch(/<dc:creator>Alice<\/dc:creator>/);
    expect(opf).toMatch(/<dc:creator>Bob<\/dc:creator>/);
    expect(opf).toMatch(/<dc:subject>S1<\/dc:subject>/);
    expect(opf).toMatch(/<dc:subject>S2<\/dc:subject>/);
  });
});
