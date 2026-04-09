"use client";

import * as React from "react";

export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const url = "/sw.js";

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(url, { scope: "/" });
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      } catch {
        // Best-effort: PWA must not break the app if SW registration fails.
      }
    };

    void register();
  }, []);

  return null;
}
