import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { ensureSystemShelves } from "@/lib/shelves/system";

function getSessionMaxAgeSeconds() {
  const rawDays = process.env.SESSION_MAX_DAYS?.trim();
  const days = rawDays ? Number(rawDays) : 30;
  if (!Number.isFinite(days) || days <= 0) return 30 * 24 * 60 * 60;
  return Math.round(days * 24 * 60 * 60);
}

function getOptionalOidcProvider() {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();

  if (!issuer || !clientId || !clientSecret) return null;

  return {
    id: "oidc",
    name: "OIDC",
    type: "oidc",
    issuer,
    clientId,
    clientSecret,
  } as const;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds(), updateAge: 24 * 60 * 60 },
  jwt: { maxAge: getSessionMaxAgeSeconds() },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = z
          .object({
            email: z
              .string()
              .trim()
              .email()
              .transform((v) => v.toLowerCase()),
            password: z.string().min(8),
          })
          .safeParse(credentials);

        if (!parsed.success) return null;

        const user = await prisma.user.findFirst({
          where: {
            email: parsed.data.email,
            deletedAt: null,
          },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          role: user.role,
        };
      },
    }),
    ...(getOptionalOidcProvider() ? [getOptionalOidcProvider()!] : []),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        // Persist role for RBAC in session.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (token as any).role = (user as any).role;
        token.sub = user.id;
      }

      if (account?.provider === "oidc" && profile && !token.sub) {
        const sub = (profile as { sub?: string }).sub;
        const email = (profile as { email?: string }).email?.toLowerCase();
        const preferredUsername =
          (profile as { preferred_username?: string }).preferred_username ??
          (profile as { name?: string }).name ??
          (email ? email.split("@")[0] : undefined);

        if (sub) {
          const existing = await prisma.user.findFirst({
            where: { oidcProvider: "oidc", oidcSub: sub, deletedAt: null },
            select: { id: true, role: true },
          });

          const dbUser =
            existing ??
            (await (async () => {
              const usersCount = await prisma.user.count({ where: { deletedAt: null } });
              const role = usersCount === 0 ? "admin" : "reader";

              const baseUsername = (preferredUsername ?? "user")
                .trim()
                .slice(0, 80)
                .replace(/\s+/g, "-")
                .replace(/[^a-zA-Z0-9_-]/g, "")
                .toLowerCase();

              for (let attempt = 0; attempt < 5; attempt++) {
                const candidate =
                  attempt === 0
                    ? baseUsername
                    : `${baseUsername}-${Math.random().toString(16).slice(2, 6)}`;
                const taken = await prisma.user.findFirst({
                  where: { OR: [{ email: email ?? "__missing__" }, { username: candidate }] },
                  select: { id: true },
                });
                if (taken) continue;

                const created = await prisma.user.create({
                  data: {
                    email: email ?? `${sub}@oidc.local`,
                    username: candidate,
                    role,
                    oidcProvider: "oidc",
                    oidcSub: sub,
                  },
                  select: { id: true, role: true },
                });
                await ensureSystemShelves(created.id);
                return created;
              }

              const created = await prisma.user.create({
                data: {
                  email: email ?? `${sub}@oidc.local`,
                  username: `user-${sub.slice(0, 8)}`,
                  role,
                  oidcProvider: "oidc",
                  oidcSub: sub,
                },
                select: { id: true, role: true },
              });
              await ensureSystemShelves(created.id);
              return created;
            })());

          await ensureSystemShelves(dbUser.id);
          token.sub = dbUser.id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = dbUser.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },
});
