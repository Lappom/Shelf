"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OpsRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="rounded-eleven-pill motion-reduce:transition-none"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw
        className={`mr-1.5 size-3.5 ${pending ? "animate-spin" : ""} motion-reduce:animate-none`}
        aria-hidden
      />
      Rafraîchir
    </Button>
  );
}
