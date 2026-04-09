import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { extractEpubMetadata } from "./index";
import { assertSafeEpubZip, assertZipSlipSafePath } from "./zipLimits";

describe("assertZipSlipSafePath", () => {
  it("allows normal epub paths", () => {
    expect(() => assertZipSlipSafePath("META-INF/container.xml")).not.toThrow();
    expect(() => assertZipSlipSafePath("OEBPS/content.opf")).not.toThrow();
  });

  it("rejects parent segments", () => {
    expect(() => assertZipSlipSafePath("../evil")).toThrow(/traversal/);
    expect(() => assertZipSlipSafePath("OEBPS/../../evil")).toThrow(/traversal/);
  });

  it("rejects absolute posix paths", () => {
    expect(() => assertZipSlipSafePath("/etc/passwd")).toThrow(/absolute/);
  });

  it("rejects windows drive paths", () => {
    expect(() => assertZipSlipSafePath("C:/Windows")).toThrow(/absolute/);
  });
});

describe("assertSafeEpubZip", () => {
  it("rejects archives with too many entries", async () => {
    const zip = new JSZip();
    for (let i = 0; i < 12; i++) {
      zip.file(`f${i}.txt`, "x");
    }
    const buf = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    const loaded = await JSZip.loadAsync(buf);
    expect(() => assertSafeEpubZip(loaded, { ...process.env, EPUB_ZIP_MAX_ENTRIES: "5" })).toThrow(
      /too many zip entries/,
    );
  });
});

describe("extractEpubMetadata zip guards", () => {
  it("rejects malicious OPF path in container.xml", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="../../outside.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`,
    );
    const buf = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    await expect(extractEpubMetadata(buf)).rejects.toThrow(/traversal|Invalid EPUB/);
  });
});
