import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import { assertSafeEpubZip, assertZipSlipSafePath } from "@/lib/epub/zipLimits";

export type EpubCover = {
  bytes: Buffer;
  mimeType: string;
  ext: string;
};

export type EpubMetadata = {
  title: string | null;
  authors: string[];
  language: string | null;
  description: string | null;
  isbn10: string | null;
  isbn13: string | null;
  cover: EpubCover | null;
};

type OpfPackage = {
  package?: {
    metadata?: unknown;
    manifest?: unknown;
  };
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function getText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const text = o["#text"];
    if (typeof text === "string") return text.trim() || null;
  }
  return null;
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function extractIsbns(raw: string[]) {
  const normalized = raw.map((s) => s.replace(/[^0-9Xx]/g, "").toUpperCase()).filter(Boolean);
  const isbn13 = normalized.find((s) => s.length === 13 && /^\d{13}$/.test(s)) ?? null;
  const isbn10 = normalized.find((s) => s.length === 10 && /^[0-9X]{10}$/.test(s)) ?? null;
  return { isbn10, isbn13 };
}

function guessImageExt(mimeType: string, path: string) {
  const mt = mimeType.toLowerCase();
  if (mt === "image/jpeg" || mt === "image/jpg") return "jpg";
  if (mt === "image/png") return "png";
  if (mt === "image/webp") return "webp";
  if (mt === "image/gif") return "gif";
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return (m?.[1] ?? "jpg").toLowerCase();
}

function joinPosix(baseDir: string, rel: string) {
  if (!baseDir) return rel.replace(/^\//, "");
  const b = baseDir.replace(/\/+$/, "");
  const r = rel.replace(/^\/+/, "");
  return `${b}/${r}`;
}

function dirnamePosix(p: string) {
  const s = p.replace(/\/+$/, "");
  const idx = s.lastIndexOf("/");
  if (idx <= 0) return "";
  return s.slice(0, idx);
}

async function readText(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) return null;
  return await f.async("text");
}

async function readBinary(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) return null;
  const arr = await f.async("uint8array");
  return Buffer.from(arr);
}

function escapeXmlText(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replaceOrInsertSingleTag(args: {
  metadataXml: string;
  tag: string; // without namespace, e.g. "title"
  value: string | null;
}) {
  const { metadataXml, tag, value } = args;
  if (value == null) return metadataXml;

  const escaped = escapeXmlText(value);
  const re = new RegExp(`<(dc:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(dc:)?${tag}>`, "i");
  if (re.test(metadataXml)) {
    return metadataXml.replace(re, `<dc:${tag}>${escaped}</dc:${tag}>`);
  }

  // Insert near the start of metadata for predictable ordering.
  const insertAfter = /<metadata\b[^>]*>/i;
  if (insertAfter.test(metadataXml)) {
    return metadataXml.replace(insertAfter, (m) => `${m}\n    <dc:${tag}>${escaped}</dc:${tag}>`);
  }

  return metadataXml;
}

function removeAllTags(args: { metadataXml: string; tag: string }) {
  const { metadataXml, tag } = args;
  const re = new RegExp(`\\s*<(dc:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(dc:)?${tag}>\\s*`, "gi");
  return metadataXml.replace(re, "\n");
}

function insertMultipleTags(args: { metadataXml: string; tag: string; values: string[] }) {
  const { metadataXml, tag, values } = args;
  if (!values.length) return metadataXml;
  const insertAfter = /<metadata\b[^>]*>/i;
  if (!insertAfter.test(metadataXml)) return metadataXml;
  const xml = values.map((v) => `    <dc:${tag}>${escapeXmlText(v)}</dc:${tag}>`).join("\n");
  return metadataXml.replace(insertAfter, (m) => `${m}\n${xml}`);
}

async function getOpfPathAndXml(zip: JSZip) {
  const containerXml = await readText(zip, "META-INF/container.xml");
  if (!containerXml) {
    throw new Error("Invalid EPUB: missing META-INF/container.xml");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  const container = parser.parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: unknown } };
  };
  const rootfiles = asArray(container?.container?.rootfiles?.rootfile as unknown);
  const rootfile = rootfiles.find((r) => {
    const o = r as Record<string, unknown>;
    return typeof o["@_full-path"] === "string";
  }) as Record<string, unknown> | undefined;
  const opfPath = (rootfile?.["@_full-path"] as string | undefined)?.trim();
  if (!opfPath) throw new Error("Invalid EPUB: missing OPF path in container.xml");
  assertZipSlipSafePath(opfPath);

  const opfXml = await readText(zip, opfPath);
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  return { opfPath, opfXml };
}

export async function extractEpubMetadata(epubBytes: Buffer): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(epubBytes);
  assertSafeEpubZip(zip);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  const { opfPath, opfXml } = await getOpfPathAndXml(zip);

  const opf = parser.parse(opfXml) as OpfPackage;
  const metadata = (opf.package as Record<string, unknown> | undefined)?.metadata as
    | Record<string, unknown>
    | undefined;
  const manifest = (opf.package as Record<string, unknown> | undefined)?.manifest as
    | Record<string, unknown>
    | undefined;

  const title = metadata ? getText(metadata["title"]) : null;
  const language = metadata ? getText(metadata["language"]) : null;
  const description = metadata ? getText(metadata["description"]) : null;

  const creators = metadata ? asArray(metadata["creator"] as unknown) : [];
  const authors = creators
    .map((c) => getText(c))
    .filter((s): s is string => Boolean(s))
    .map(normalizeWhitespace);

  const identifiers = metadata ? asArray(metadata["identifier"] as unknown) : [];
  const identifierTexts = identifiers
    .map((id) => getText(id))
    .filter((s): s is string => Boolean(s));
  const { isbn10, isbn13 } = extractIsbns(identifierTexts);

  const opfDir = dirnamePosix(opfPath);

  const items = manifest ? asArray((manifest as Record<string, unknown>)["item"] as unknown) : [];
  const coverItem =
    items.find((it) => (it as Record<string, unknown>)?.["@_properties"] === "cover-image") ??
    items.find((it) => {
      const o = it as Record<string, unknown>;
      const id = (o["@_id"] as string | undefined)?.toLowerCase();
      return id === "cover" || id === "cover-image" || id === "coverimage";
    }) ??
    null;

  let cover: EpubCover | null = null;
  if (coverItem) {
    const o = coverItem as Record<string, unknown>;
    const href = (o["@_href"] as string | undefined)?.trim();
    const mediaType = (o["@_media-type"] as string | undefined)?.trim() || "image/jpeg";
    if (href) {
      const coverPath = joinPosix(opfDir, href);
      assertZipSlipSafePath(coverPath);
      const bytes = await readBinary(zip, coverPath);
      if (bytes) {
        cover = {
          bytes,
          mimeType: mediaType,
          ext: guessImageExt(mediaType, coverPath),
        };
      }
    }
  }

  return {
    title: title ? normalizeWhitespace(title) : null,
    authors,
    language: language ? normalizeWhitespace(language) : null,
    description: description ? normalizeWhitespace(description) : null,
    isbn10,
    isbn13,
    cover,
  };
}

export async function writeEpubOpfMetadata(
  epubBytes: Buffer,
  updates: {
    title: string | null;
    authors: string[];
    language: string | null;
    description: string | null;
    isbn10: string | null;
    isbn13: string | null;
    publisher: string | null;
    publishDate: string | null;
    subjects: string[];
  },
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(epubBytes);
  assertSafeEpubZip(zip);
  const { opfPath, opfXml } = await getOpfPathAndXml(zip);

  const metaMatch = /<metadata\b[^>]*>[\s\S]*?<\/metadata>/i.exec(opfXml);
  if (!metaMatch) throw new Error("Invalid EPUB: missing <metadata> in OPF");

  let metadataXml = metaMatch[0];

  metadataXml = replaceOrInsertSingleTag({ metadataXml, tag: "title", value: updates.title });
  metadataXml = replaceOrInsertSingleTag({ metadataXml, tag: "language", value: updates.language });
  metadataXml = replaceOrInsertSingleTag({
    metadataXml,
    tag: "description",
    value: updates.description,
  });
  metadataXml = replaceOrInsertSingleTag({
    metadataXml,
    tag: "publisher",
    value: updates.publisher,
  });
  metadataXml = replaceOrInsertSingleTag({ metadataXml, tag: "date", value: updates.publishDate });

  // Multi-value tags: remove and re-insert.
  metadataXml = removeAllTags({ metadataXml, tag: "creator" });
  metadataXml = removeAllTags({ metadataXml, tag: "subject" });
  metadataXml = removeAllTags({ metadataXml, tag: "identifier" });

  metadataXml = insertMultipleTags({
    metadataXml,
    tag: "creator",
    values: updates.authors.map(normalizeWhitespace).filter(Boolean),
  });
  metadataXml = insertMultipleTags({
    metadataXml,
    tag: "subject",
    values: updates.subjects.map(normalizeWhitespace).filter(Boolean),
  });

  const identifiers: string[] = [];
  if (updates.isbn13) identifiers.push(updates.isbn13);
  if (updates.isbn10) identifiers.push(updates.isbn10);
  metadataXml = insertMultipleTags({
    metadataXml,
    tag: "identifier",
    values: identifiers.map(normalizeWhitespace).filter(Boolean),
  });

  const updatedOpfXml = opfXml.replace(metaMatch[0], metadataXml);
  zip.file(opfPath, updatedOpfXml);

  const arr = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(arr);
}
