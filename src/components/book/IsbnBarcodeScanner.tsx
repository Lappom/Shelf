"use client";

import type { IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeIsbn } from "@/lib/books/isbn";
import { Button } from "@/components/ui/button";

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
  if (!(err instanceof DOMException)) return "Caméra indisponible. Réessaie ou saisis l’ISBN à la main.";
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

export function IsbnBarcodeScanner({
  onIsbnDecoded,
  onRawNotIsbn,
  onScanError,
  disabled,
}: {
  onIsbnDecoded: (isbn: string) => void;
  onRawNotIsbn?: (raw: string) => void;
  onScanError?: (message: string) => void;
  disabled?: boolean;
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

  useEffect(() => {
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
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

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
      video.srcObject = null;
      setPanelOpen(false);
    };

    const runNative = async () => {
      const Ctor = window.BarcodeDetector;
      if (!Ctor) {
        fail("Détection native indisponible.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        fail(mediaErrorMessage(e));
        return;
      }
      if (cancelled || stoppedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        fail("Impossible de lancer la prévisualisation vidéo.");
        return;
      }

      let detector: { detect: (image: ImageBitmapSource) => Promise<Array<{ format: string; rawValue: string }>> };
      try {
        detector = new Ctor({ formats: [...NATIVE_FORMATS] });
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        fail("Ce navigateur ne prend pas en charge ces formats de code-barres.");
        return;
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
    };

    const runZxing = async () => {
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
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result, _err, ctrl) => {
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
        });
        zxingControlsRef.current = controls;
      } catch (e) {
        fail(e instanceof Error ? e.message : mediaErrorMessage(e));
      }
    };

    void (async () => {
      await waitForVideoPaint();
      if (cancelled || stoppedRef.current) return;
      if (!videoRef.current) {
        fail("Élément vidéo manquant.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("Ce contexte ne permet pas d’accéder à la caméra (HTTPS requis en général).");
        return;
      }
      if (canUseNativeBarcodeDetector()) {
        await runNative();
      } else {
        await runZxing();
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
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [panelOpen, clearAnimation]);

  const handleStopClick = () => {
    stopAll();
    setPanelOpen(false);
  };

  return (
    <div className="space-y-2">
      {!panelOpen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setStatus(null);
            setPanelOpen(true);
          }}
        >
          Scanner la caméra
        </Button>
      ) : (
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
          {status && <div className="text-muted-foreground text-xs">{status}</div>}
          <Button type="button" variant="outline" size="sm" onClick={handleStopClick}>
            Arrêter la caméra
          </Button>
        </div>
      )}
    </div>
  );
}
