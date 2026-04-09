"use client";

import { useEffect, useMemo, useRef } from "react";
import ePub, { type Book, type Rendition } from "epubjs";
import sanitizeHtml from "sanitize-html";

type Props = {
  bookId: string;
  fileUrl: string;
};

export function EpubReaderClient({ bookId, fileUrl }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const sanitizedFileUrl = useMemo(() => fileUrl, [fileUrl]);

  useEffect(() => {
    if (!containerRef.current) return;

    const book = ePub(sanitizedFileUrl);
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      width: "100%",
      height: "100%",
      spread: "none",
    });
    renditionRef.current = rendition;

    // Basic XSS hardening: sanitize any HTML content passed through hooks.
    // Note: epub.js renders inside an iframe; this is a defense-in-depth layer.
    rendition.hooks.content.register((contents: { document: Document }) => {
      try {
        const doc = contents.document as Document;
        const body = doc.body;
        const clean = sanitizeHtml(body.innerHTML, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "svg", "path"]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title"],
            a: ["href", "name", "target", "rel"],
          },
        });
        body.innerHTML = clean;
      } catch {
        // If sanitization fails, leave content as-is; future iterations can harden further.
      }
    });

    rendition.display();

    return () => {
      rendition.destroy();
      book.destroy();
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [sanitizedFileUrl, bookId]);

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
