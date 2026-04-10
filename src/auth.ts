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

const sessionCookieSecure = process.env.NODE_ENV === "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: getSessionMaxAgeSeconds(), updateAge: 24 * 60 * 60 },
  jwt: { maxAge: getSessionMaxAgeSeconds() },
  cookies: {
    // JWT session cookie: explicit hardening (csrf/callback cookies keep Auth.js defaults).
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: sessionCookieSecure,
      },
    },
  },
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
      // Legacy bug: OIDC stored the provider `sub` in token.sub instead of our User.id. Heal on each JWT refresh.
      const rawSub = typeof token.sub === "string" ? token.sub : "";
      const subIsUuid = rawSub.length > 0 && z.string().uuid().safeParse(rawSub).success;
      if (rawSub && !subIsUuid) {
        const linked = await prisma.user.findFirst({
          where: { oidcProvider: "oidc", oidcSub: rawSub, deletedAt: null },
          select: { id: true, role: true },
        });
        if (linked) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).oidcSub = rawSub;
          token.sub = linked.id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = linked.role;
        }
      }

      // OIDC: always resolve DB user on sign-in. Do not use OAuth `user.id` as token.sub (it is not our User.id UUID).
      if (account?.provider === "oidc" && profile) {
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
          (token as any).oidcSub = sub;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = dbUser.role;
        }
      }

      if (user && account?.provider !== "oidc") {
        // Credentials (and any non-OIDC): session id is the DB user id.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (token as any).role = (user as any).role;
        token.sub = user.id;
      }

      // Orphan JWT: valid-looking User.id UUID but no row (DB reset, wrong DATABASE_URL, etc.).
      const resolvedSub = typeof token.sub === "string" ? token.sub : "";
      if (resolvedSub.length > 0 && z.string().uuid().safeParse(resolvedSub).success) {
        const row = await prisma.user.findFirst({
          where: { id: resolvedSub, deletedAt: null },
          select: { id: true, role: true },
        });
        if (!row) {
          token.sub = undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (token as any).role;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (token as any).oidcSub;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (token as any).role = row.role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Do not fall back to a previous session user id when token.sub was cleared (invalid session).
        session.user.id = typeof token.sub === "string" && token.sub.length > 0 ? token.sub : "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },
});
