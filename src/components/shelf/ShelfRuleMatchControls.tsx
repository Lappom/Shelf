"use client";

import { SparklesIcon } from "lucide-react";

import { ShelfRuleSelect } from "@/components/shelf/ShelfRuleSelect";
import { Button } from "@/components/ui/button";

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
      <div className="text-eleven-muted text-xs">Match</div>
      <ShelfRuleSelect
        value={match}
        onChange={(v) => onMatchChange(v === "any" ? "any" : "all")}
        options={[...MATCH_OPTIONS]}
        disabled={busy}
        data-testid="shelf-rule-match-select"
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
