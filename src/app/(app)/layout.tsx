import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { LogoMark } from "@/components/LogoMark";
import { AppHeaderNav } from "@/components/layout/AppHeaderNav";
import { ThemeProvider, type ThemePreference } from "@/components/theme/ThemeProvider";
import { UserMenu } from "@/components/layout/UserMenu";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = z.string().uuid().parse(session.user.id);
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { theme: true },
  });
  const initialTheme = (pref?.theme ?? "system") as ThemePreference;
  const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <div className="min-h-screen">
        <header className="bg-background/80 sticky top-0 z-40 border-b border-(--eleven-border-subtle) backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <Link
                aria-label="Shelf"
                className="flex items-center gap-2 font-semibold tracking-tight"
                href="/library"
              >
                <LogoMark className="h-6 w-6" title="" />
                <span className="eleven-body-airy">Shelf</span>
              </Link>

              <AppHeaderNav isAdmin={isAdmin} />
            </div>

            <div className="flex items-center gap-1.5">
              <UserMenu email={session.user.email ?? null} />
            </div>
          </div>
        </header>

        <main className="pb-24 sm:pb-0">{children}</main>
        <MobileBottomNav showAdmin={isAdmin} />
      </div>
    </ThemeProvider>
  );
}
