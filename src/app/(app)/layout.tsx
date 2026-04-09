import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LogoMark } from "@/components/LogoMark";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link
            aria-label="Shelf"
            className="flex items-center gap-2 font-semibold tracking-tight"
            href="/library"
          >
            <LogoMark className="h-6 w-6" title="" />
            <span>Shelf</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{session?.user?.email ?? ""}</span>
            <Button asChild variant="outline">
              <Link href="/api/auth/signout">Déconnexion</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
