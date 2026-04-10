"use client";

import type { IScannerControls } from "@zxing/browser";
import { ScanLine } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { normalizeIsbn } from "@/lib/books/isbn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NATIVE_FORMATS = ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"] as const;

const DETECT_INTERVAL_MS = 240;

function canUseNativeBarcodeDetector() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.BarcodeDetector !== "undefined"
  );
}

function mediaErrorMessage(err: unknown): string {
  if (!(err instanceof DOMException))
    return "Caméra indisponible. Réessaie ou saisis l’ISBN à la main.";
  if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
    return "Accès à la caméra refusé. Autorise la caméra dans le navigateur ou utilise une douchette USB.";
  }
  if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
    return "Aucune caméra détectée.";
  }
  if (err.name === "NotReadableError" || err.name === "TrackStartError") {
    return "La caméra est déjà utilisée ou inaccessible.";
  }
  return "Caméra indisponible. Réessaie ou saisis l’ISBN à la main.";
}

function waitForVideoPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Dialog portals can mount <video> after the first layout pass; never bail permanently on a null ref. */
async function waitForConnectedVideo(
  getVideo: () => HTMLVideoElement | null,
  cancelled: () => boolean,
  maxFrames = 90,
): Promise<HTMLVideoElement | null> {
  for (let i = 0; i < maxFrames; i++) {
    if (cancelled()) return null;
    const el = getVideo();
    if (el?.isConnected) return el;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  return null;
}

async function getFrontOrDefaultVideoStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    // Desktop / some browsers reject "environment"; accept any camera.
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function IsbnBarcodeScanner({
  onIsbnDecoded,
  onRawNotIsbn,
  onScanError,
  disabled,
  presentation = "inline",
}: {
  onIsbnDecoded: (isbn: string) => void;
  onRawNotIsbn?: (raw: string) => void;
  onScanError?: (message: string) => void;
  disabled?: boolean;
  presentation?: "inline" | "modal";
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onIsbnDecodedRef = useRef(onIsbnDecoded);
  const onRawNotIsbnRef = useRef(onRawNotIsbn);
  const onScanErrorRef = useRef(onScanError);
  onIsbnDecodedRef.current = onIsbnDecoded;
  onRawNotIsbnRef.current = onRawNotIsbn;
  onScanErrorRef.current = onScanError;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const stoppedRef = useRef(false);
  const invalidReportedRef = useRef<Set<string>>(new Set());

  const clearAnimation = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopNative = useCallback(() => {
    clearAnimation();
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
    }
  }, [clearAnimation]);

  const stopZxing = useCallback(() => {
    try {
      zxingControlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    zxingControlsRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.srcObject = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    stopNative();
    stopZxing();
    setStatus(null);
  }, [stopNative, stopZxing]);

  useLayoutEffect(() => {
    if (!panelOpen) {
      stoppedRef.current = true;
      clearAnimation();
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        zxingControlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      zxingControlsRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      invalidReportedRef.current = new Set();
      return;
    }

    stoppedRef.current = false;
    invalidReportedRef.current = new Set();

    let cancelled = false;
    /** Stable target for cleanup (avoids stale videoRef in modal portal teardown). */
    let mountTarget: HTMLVideoElement | null = null;

    const fail = (msg: string) => {
      if (cancelled) return;
      onScanErrorRef.current?.(msg);
      setStatus(msg);
      stoppedRef.current = true;
      clearAnimation();
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        zxingControlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      zxingControlsRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
      setPanelOpen(false);
    };

    const runNative = async (video: HTMLVideoElement): Promise<"started" | "failed" | "try-zxing"> => {
      const Ctor = window.BarcodeDetector;
      if (!Ctor) return "try-zxing";

      let stream: MediaStream;
      try {
        stream = await getFrontOrDefaultVideoStream();
      } catch (e) {
        fail(mediaErrorMessage(e));
        return "failed";
      }
      if (cancelled || stoppedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return "failed";
      }

      streamRef.current = stream;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        video.srcObject = null;
        fail("Impossible de lancer la prévisualisation vidéo.");
        return "failed";
      }

      let detector: {
        detect: (image: ImageBitmapSource) => Promise<Array<{ format: string; rawValue: string }>>;
      };
      try {
        detector = new Ctor({ formats: [...NATIVE_FORMATS] });
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        video.srcObject = null;
        return "try-zxing";
      }

      setStatus("Place le code-barres dans le cadre…");

      let lastRun = 0;
      const tick = (now: number) => {
        if (cancelled || stoppedRef.current) return;
        if (now - lastRun < DETECT_INTERVAL_MS) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastRun = now;

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          void detector
            .detect(video)
            .then((codes) => {
              if (cancelled || stoppedRef.current || !codes?.length) return;
              for (const c of codes) {
                const raw = c.rawValue?.trim() ?? "";
                if (!raw) continue;
                const n = normalizeIsbn(raw);
                if (n) {
                  stoppedRef.current = true;
                  clearAnimation();
                  stream.getTracks().forEach((t) => t.stop());
                  streamRef.current = null;
                  video.srcObject = null;
                  setPanelOpen(false);
                  onIsbnDecodedRef.current(n);
                  return;
                }
                if (!invalidReportedRef.current.has(raw)) {
                  invalidReportedRef.current.add(raw);
                  onRawNotIsbnRef.current?.(raw);
                }
              }
            })
            .catch(() => {
              /* ignore single-frame errors */
            });
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return "started";
    };

    const runZxing = async (video: HTMLVideoElement) => {
      setStatus("Chargement du lecteur…");
      let mod: typeof import("@zxing/browser");
      try {
        mod = await import("@zxing/browser");
      } catch {
        fail("Impossible de charger le lecteur de codes-barres.");
        return;
      }
      if (cancelled || stoppedRef.current) return;

      const reader = new mod.BrowserMultiFormatReader();
      setStatus("Place le code-barres dans le cadre…");

      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, _err, ctrl) => {
            if (cancelled || stoppedRef.current) return;
            zxingControlsRef.current = ctrl;
            if (!result) return;
            const raw = result.getText()?.trim() ?? "";
            if (!raw) return;
            const n = normalizeIsbn(raw);
            if (n) {
              stoppedRef.current = true;
              try {
                ctrl.stop();
              } catch {
                /* ignore */
              }
              zxingControlsRef.current = null;
              video.srcObject = null;
              setPanelOpen(false);
              onIsbnDecodedRef.current(n);
              return;
            }
            if (!invalidReportedRef.current.has(raw)) {
              invalidReportedRef.current.add(raw);
              onRawNotIsbnRef.current?.(raw);
            }
          },
        );
        zxingControlsRef.current = controls;
      } catch (e) {
        fail(e instanceof Error ? e.message : mediaErrorMessage(e));
      }
    };

    void (async () => {
      await waitForVideoPaint();
      if (cancelled || stoppedRef.current) return;

      const video = await waitForConnectedVideo(
        () => videoRef.current,
        () => cancelled || stoppedRef.current,
      );
      mountTarget = video;
      if (cancelled || stoppedRef.current) return;
      if (!video) {
        fail("Élément vidéo indisponible. Ferme puis rouvre le scan.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        fail("Ce contexte ne permet pas d’accéder à la caméra (HTTPS requis en général).");
        return;
      }

      if (canUseNativeBarcodeDetector()) {
        const nativeOutcome = await runNative(video);
        if (nativeOutcome === "try-zxing" && !cancelled && !stoppedRef.current) {
          await runZxing(video);
        }
      } else {
        await runZxing(video);
      }
    })();

    return () => {
      cancelled = true;
      clearAnimation();
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      try {
        zxingControlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      zxingControlsRef.current = null;
      const v = mountTarget ?? videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [panelOpen, clearAnimation]);

  const handleStopClick = () => {
    stopAll();
    setPanelOpen(false);
  };

  const handleOpenScan = () => {
    setStatus(null);
    setPanelOpen(true);
  };

  const scanPanelInner = (
    <div className="space-y-2">
      <div className="bg-muted/40 overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
        <video
          ref={videoRef}
          className="aspect-video w-full object-cover"
          muted
          playsInline
          autoPlay
        />
      </div>
      {status ? <div className="text-muted-foreground text-xs">{status}</div> : null}
      <Button type="button" variant="outline" size="sm" onClick={handleStopClick}>
        Arrêter la caméra
      </Button>
    </div>
  );

  if (presentation === "modal") {
    return (
      <div className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl"
          disabled={disabled}
          aria-label="Scanner le code-barres (ISBN)"
          onClick={handleOpenScan}
        >
          <ScanLine className="h-4 w-4" aria-hidden />
        </Button>
        <Dialog
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) {
              stopAll();
              setPanelOpen(false);
            }
          }}
        >
          <DialogContent className="gap-3 motion-reduce:data-closed:animate-none motion-reduce:animate-none sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Scanner un ISBN</DialogTitle>
              <DialogDescription>
                Cadre le code-barres du livre. HTTPS est recommandé ; certains codes ne sont pas des
                ISBN (ISSN, etc.).
              </DialogDescription>
            </DialogHeader>
            {scanPanelInner}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!panelOpen ? (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={handleOpenScan}>
          Scanner la caméra
        </Button>
      ) : (
        scanPanelInner
      )}
    </div>
  );
}
