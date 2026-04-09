/**
 * Idempotent E2E data: fixed users + one book + one recommendation for the reader.
 * Run: `pnpm exec tsx e2e/seed.ts` (requires DATABASE_URL and prisma generate).
 */
import "dotenv/config";

import { prisma } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { ensureSystemShelves } from "../src/lib/shelves/system";

const E2E_BOOK_ID = "00000000-0000-4000-8000-0000000000e1";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for e2e/seed.ts");
  }

  const password = process.env.E2E_TEST_PASSWORD ?? "E2ESecurePass!123";
  const hash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email: "e2e-admin@test.local" },
    create: {
      email: "e2e-admin@test.local",
      username: "e2e_admin",
      passwordHash: hash,
      role: "admin",
    },
    update: { passwordHash: hash, deletedAt: null, role: "admin" },
  });
  await ensureSystemShelves(admin.id);

  const reader = await prisma.user.upsert({
    where: { email: "e2e-reader@test.local" },
    create: {
      email: "e2e-reader@test.local",
      username: "e2e_reader",
      passwordHash: hash,
      role: "reader",
    },
    update: { passwordHash: hash, deletedAt: null, role: "reader" },
  });
  await ensureSystemShelves(reader.id);

  await prisma.book.upsert({
    where: { id: E2E_BOOK_ID },
    create: {
      id: E2E_BOOK_ID,
      title: "E2E Recommendation Target",
      authors: ["E2E Author"],
      format: "physical",
      metadataSource: "manual",
      addedById: admin.id,
    },
    update: {
      deletedAt: null,
      title: "E2E Recommendation Target",
      authors: ["E2E Author"],
    },
  });

  await prisma.userRecommendation.upsert({
    where: {
      userId_bookId: { userId: reader.id, bookId: E2E_BOOK_ID },
    },
    create: {
      userId: reader.id,
      bookId: E2E_BOOK_ID,
      score: 1,
      reasons: [{ code: "e2e_seed", text: "E2E seed" }],
      computedAt: new Date(),
      dismissed: false,
      seen: false,
    },
    update: {
      dismissed: false,
      seen: false,
      score: 1,
    },
  });

  console.info("E2E seed OK (e2e-reader@test.local / e2e-admin@test.local).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
