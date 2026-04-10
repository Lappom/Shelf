"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminSettingsCopyValueProps = {
  value: string;
  label: string;
  className?: string;
};

export function AdminSettingsCopyValue({ value, label, className }: AdminSettingsCopyValueProps) {
  const [copied, setCopied] = useState(false);
  const disabled = !value.trim() || value === "—";

  const onCopy = useCallback(() => {
    if (disabled) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [disabled, value]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "shrink-0 rounded-lg text-eleven-muted hover:text-foreground",
        "motion-reduce:transition-none",
        className,
      )}
      disabled={disabled}
      aria-label={copied ? "Copié dans le presse-papiers" : `${label} — copier`}
      onClick={onCopy}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </Button>
  );
}
