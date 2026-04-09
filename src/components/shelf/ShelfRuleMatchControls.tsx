"use client";

import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

function SmallSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid="shelf-rule-match-select"
      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const MATCH_OPTIONS = [
  { value: "all", label: "all (AND)" },
  { value: "any", label: "any (OR)" },
] as const;

export function ShelfRuleMatchControls({
  match,
  onMatchChange,
  onAddCondition,
  onPreview,
  busy,
  conditionCount,
  maxConditions = 50,
}: {
  match: "all" | "any";
  onMatchChange: (m: "all" | "any") => void;
  onAddCondition: () => void;
  onPreview: () => void;
  busy: boolean;
  conditionCount: number;
  maxConditions?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-muted-foreground text-xs">Match</div>
      <SmallSelect
        value={match}
        onChange={(v) => onMatchChange(v === "any" ? "any" : "all")}
        options={[...MATCH_OPTIONS]}
        disabled={busy}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="shelf-rule-add-condition"
        onClick={onAddCondition}
        disabled={busy || conditionCount >= maxConditions}
      >
        + Condition
      </Button>

      <Button type="button" variant="ghost" size="sm" onClick={onPreview} disabled={busy}>
        <SparklesIcon />
        Prévisualiser
      </Button>
    </div>
  );
}
