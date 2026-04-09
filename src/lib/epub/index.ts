import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

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
  const normalized = raw
    .map((s) => s.replace(/[^0-9Xx]/g, "").toUpperCase())
    .filter(Boolean);
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

export async function extractEpubMetadata(epubBytes: Buffer): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(epubBytes);

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

  const opfXml = await readText(zip, opfPath);
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

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

