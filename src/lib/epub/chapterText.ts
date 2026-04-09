import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

import { assertSafeEpubZip, assertZipSlipSafePath } from "@/lib/epub/zipLimits";

const DEFAULT_MAX_CHARS = 32_000;

function dirnamePosix(p: string) {
  const s = p.replace(/\/+$/, "");
  const idx = s.lastIndexOf("/");
  if (idx <= 0) return "";
  return s.slice(0, idx);
}

function joinPosix(baseDir: string, rel: string) {
  if (!baseDir) return rel.replace(/^\//, "");
  const b = baseDir.replace(/\/+$/, "");
  const r = rel.replace(/^\/+/, "");
  return `${b}/${r}`;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

async function readZipText(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) return null;
  return await f.async("text");
}

async function getOpfPathAndXml(zip: JSZip) {
  const containerXml = await readZipText(zip, "META-INF/container.xml");
  if (!containerXml) throw new Error("Invalid EPUB: missing META-INF/container.xml");

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

  const opfXml = await readZipText(zip, opfPath);
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF file");

  return { opfPath, opfXml };
}

function htmlToPlainText(html: string, maxChars: number): { text: string; truncated: boolean } {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScripts.replace(/<[^>]+>/g, " ");
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return { text: collapsed, truncated: false };
  return { text: collapsed.slice(0, maxChars), truncated: true };
}

export type EpubChapterExtractResult = {
  chapterIndex: number;
  chapterCount: number;
  href: string | null;
  text: string;
  truncated: boolean;
  approxTokens: number;
};

/**
 * Extract plain text for spine item at `chapterIndex` (0-based).
 */
export async function extractEpubChapterPlainText(args: {
  epubBytes: Buffer;
  chapterIndex: number;
  maxChars?: number;
}): Promise<EpubChapterExtractResult> {
  const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS;
  const zip = await JSZip.loadAsync(args.epubBytes);
  assertSafeEpubZip(zip);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
  });

  const { opfPath, opfXml } = await getOpfPathAndXml(zip);
  const opf = parser.parse(opfXml) as {
    package?: { manifest?: { item?: unknown }; spine?: { itemref?: unknown } };
  };
  const pkg = opf.package as Record<string, unknown> | undefined;
  const manifest = pkg?.manifest as Record<string, unknown> | undefined;
  const spine = pkg?.spine as Record<string, unknown> | undefined;

  const items = manifest ? asArray(manifest["item"] as unknown) : [];
  const idToHref = new Map<string, { href: string; media: string }>();
  for (const it of items) {
    const o = it as Record<string, unknown>;
    const id = o["@_id"];
    const href = o["@_href"];
    const media = (o["@_media-type"] as string | undefined) ?? "";
    if (typeof id === "string" && typeof href === "string") {
      assertZipSlipSafePath(href);
      idToHref.set(id, { href, media });
    }
  }

  const itemrefs = spine ? asArray(spine["itemref"] as unknown) : [];
  const spineHrefs: string[] = [];
  for (const ref of itemrefs) {
    const o = ref as Record<string, unknown>;
    const idref = o["@_idref"];
    if (typeof idref !== "string") continue;
    const mapped = idToHref.get(idref);
    if (!mapped) continue;
    const mt = mapped.media.toLowerCase();
    if (
      mt.includes("html") ||
      mapped.href.toLowerCase().endsWith(".xhtml") ||
      mapped.href.toLowerCase().endsWith(".html") ||
      mapped.href.toLowerCase().endsWith(".htm")
    ) {
      spineHrefs.push(mapped.href);
    }
  }

  const chapterCount = spineHrefs.length;
  if (chapterCount === 0) {
    throw new Error("No readable chapters in EPUB spine");
  }
  if (args.chapterIndex < 0 || args.chapterIndex >= chapterCount) {
    throw new Error(`Invalid chapter index (0..${chapterCount - 1})`);
  }

  const opfDir = dirnamePosix(opfPath);
  const href = spineHrefs[args.chapterIndex];
  const absPath = joinPosix(opfDir, href);
  assertZipSlipSafePath(absPath);

  const raw = await readZipText(zip, absPath);
  if (!raw) throw new Error("Chapter file missing in EPUB");

  const { text, truncated } = htmlToPlainText(raw, maxChars);
  const approxTokens = Math.ceil(text.length / 4);

  return {
    chapterIndex: args.chapterIndex,
    chapterCount,
    href,
    text,
    truncated,
    approxTokens,
  };
}
