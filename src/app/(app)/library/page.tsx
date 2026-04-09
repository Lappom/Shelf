import Link from "next/link";

import { requireUser } from "@/lib/auth/rbac";
import { Button } from "@/components/ui/button";
import { UploadEpubDialog } from "@/components/book/UploadEpubDialog";

export default async function LibraryPage() {
  const user = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (user as any).role as string | undefined;
  const isAdmin = role === "admin";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bibliothèque</h1>
          <p className="text-muted-foreground text-sm">
            Base d’app prête (upload/reader/search arrivent).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && <UploadEpubDialog />}
          <Button asChild variant="outline">
            <Link href="/reader/00000000-0000-0000-0000-000000000000">Ouvrir le reader</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
