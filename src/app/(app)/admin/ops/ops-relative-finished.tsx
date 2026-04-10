"use client";

import { useEffect, useState } from "react";

function formatRelativeFr(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffSec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  const diffMin = diffSec / 60;
  if (Math.abs(diffMin) < 60) return rtf.format(Math.round(diffMin), "minute");
  const diffHour = diffMin / 60;
  if (Math.abs(diffHour) < 48) return rtf.format(Math.round(diffHour), "hour");
  const diffDay = diffHour / 24;
  if (Math.abs(diffDay) < 60) return rtf.format(Math.round(diffDay), "day");
  const diffMonth = diffDay / 30;
  if (Math.abs(diffMonth) < 24) return rtf.format(Math.round(diffMonth), "month");
  return rtf.format(Math.round(diffMonth / 12), "year");
}

type Props = {
  iso: string;
  title: string;
};

export function OpsRelativeFinished({ iso, title }: Props) {
  const [label, setLabel] = useState(() => formatRelativeFr(iso, Date.now()));

  useEffect(() => {
    const tick = () => setLabel(formatRelativeFr(iso, Date.now()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <time
      dateTime={iso}
      title={title}
      className="text-eleven-muted eleven-body-airy text-sm tracking-wide"
    >
      {label}
    </time>
  );
}
