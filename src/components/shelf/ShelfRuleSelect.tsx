"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function ShelfRuleSelect({
  value,
  onChange,
  options,
  disabled,
  className,
  "data-testid": dataTestId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      data-testid={dataTestId}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "eleven-body-airy bg-background h-9 rounded-xl border border-(--eleven-border-subtle) px-2 text-[0.94rem] outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
        "disabled:opacity-50",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
