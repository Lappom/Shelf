"use server";

import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/auditLog";
import { logShelfEvent } from "@/lib/observability/structuredLog";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

const IgnoreSchema = z.object({
  pairId: z.string().uuid(),
});

const MergeSchema = z.object({
  pairId: z.string().uuid(),
  primaryBookId: z.string().uuid(),
  absorbedBookId: z.string().uuid(),
});

function chooseProgressStatus(a: string, b: string) {
  const order = ["not_started", "reading", "finished", "abandoned"] as const;
  const ia = order.indexOf(a as (typeof order)[number]);
  const ib = order.indexOf(b as (typeof order)[number]);
  return order[Math.max(0, ia, ib)] ?? a;
}

export async function ignoreDuplicatePairAction(formData: FormData) {
  const admin = await requireAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actorId = (admin as any).id as string;

  const parsed = IgnoreSchema.safeParse({
    pairId: formData.get("pairId"),
  });
  if (!parsed.success) throw new Error("Invalid pair id");

  const pair = await prisma.duplicatePair.findFirst({
    where: { id: parsed.data.pairId },
    select: { id: true, status: true },
  });
  if (!pair) throw new Error("Not found");

  await prisma.$transaction(async (tx) => {
    await tx.duplicatePair.update({
      where: { id: pair.id },
      data: { status: "ignored" },
    });
    await tx.duplicateResolutionAudit.create({
      data: {
        pairId: pair.id,
        actorId,
        action: "ignored",
        meta: {},
      },
    });
  });

  await logAdminAudit({
    action: "duplicate_ignore",
    actorId,
    meta: { pairId: pair.id },
  });

  return { ok: true as const };
}

export async function mergeDuplicatePairAction(formData: FormData) {
  const admin = await requireAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actorId = (admin as any).id as string;

  const parsed = MergeSchema.safeParse({
    pairId: formData.get("pairId"),
    primaryBookId: formData.get("primaryBookId"),
    absorbedBookId: formData.get("absorbedBookId"),
  });
  if (!parsed.success) throw new Error("Invalid merge request");

  const { pairId, primaryBookId, absorbedBookId } = parsed.data;
  if (primaryBookId === absorbedBookId) throw new Error("Books must differ");

  await prisma.$transaction(async (tx) => {
    const pair = await tx.duplicatePair.findFirst({
      where: { id: pairId },
      select: { id: true, status: true, bookIdA: true, bookIdB: true },
    });
    if (!pair) throw new Error("Not found");
    if (pair.status === "merged") throw new Error("Already merged");

    const matches =
      (pair.bookIdA === primaryBookId && pair.bookIdB === absorbedBookId) ||
      (pair.bookIdA === absorbedBookId && pair.bookIdB === primaryBookId);
    if (!matches) throw new Error("Pair does not match books");

    const primary = await tx.book.findFirst({
      where: { id: primaryBookId, deletedAt: null },
      select: { id: true },
    });
    if (!primary) throw new Error("Primary book not found");

    const absorbed = await tx.book.findFirst({
      where: { id: absorbedBookId, deletedAt: null },
      select: { id: true },
    });
    if (!absorbed) throw new Error("Absorbed book not found");

    // Transfer shelves (skip duplicates via composite PK)
    const absorbedShelves = await tx.bookShelf.findMany({
      where: { bookId: absorbedBookId },
      select: { shelfId: true, addedAt: true, sortOrder: true },
    });
    if (absorbedShelves.length) {
      await tx.bookShelf.createMany({
        data: absorbedShelves.map((s) => ({
          bookId: primaryBookId,
          shelfId: s.shelfId,
          addedAt: s.addedAt,
          sortOrder: s.sortOrder,
        })),
        skipDuplicates: true,
      });
      await tx.bookShelf.deleteMany({ where: { bookId: absorbedBookId } });
    }

    // Transfer tags (skip duplicates via composite PK)
    const absorbedTags = await tx.bookTag.findMany({
      where: { bookId: absorbedBookId },
      select: { tagId: true },
    });
    if (absorbedTags.length) {
      await tx.bookTag.createMany({
        data: absorbedTags.map((t) => ({ bookId: primaryBookId, tagId: t.tagId })),
        skipDuplicates: true,
      });
      await tx.bookTag.deleteMany({ where: { bookId: absorbedBookId } });
    }

    // Transfer files
    await tx.bookFile.updateMany({
      where: { bookId: absorbedBookId },
      data: { bookId: primaryBookId },
    });

    // Transfer annotations
    await tx.userAnnotation.updateMany({
      where: { bookId: absorbedBookId },
      data: { bookId: primaryBookId },
    });

    // Transfer progress (merge per user)
    const absorbedProgress = await tx.userBookProgress.findMany({
      where: { bookId: absorbedBookId },
      select: {
        userId: true,
        progress: true,
        currentCfi: true,
        currentPage: true,
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    for (const p of absorbedProgress) {
      const existing = await tx.userBookProgress.findFirst({
        where: { userId: p.userId, bookId: primaryBookId },
        select: {
          id: true,
          progress: true,
          currentCfi: true,
          currentPage: true,
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      });
      if (!existing) {
        await tx.userBookProgress.create({
          data: {
            userId: p.userId,
            bookId: primaryBookId,
            progress: p.progress,
            currentCfi: p.currentCfi,
            currentPage: p.currentPage,
            status: p.status,
            startedAt: p.startedAt,
            finishedAt: p.finishedAt,
          },
        });
      } else {
        await tx.userBookProgress.update({
          where: { id: existing.id },
          data: {
            progress: Math.max(existing.progress, p.progress),
            currentCfi: existing.currentCfi ?? p.currentCfi,
            currentPage: existing.currentPage ?? p.currentPage,
            status: chooseProgressStatus(existing.status, p.status),
            startedAt: existing.startedAt ?? p.startedAt,
            finishedAt: existing.finishedAt ?? p.finishedAt,
          },
        });
      }
    }
    await tx.userBookProgress.deleteMany({ where: { bookId: absorbedBookId } });

    // Transfer recommendations (merge per user)
    const absorbedRecs = await tx.userRecommendation.findMany({
      where: { bookId: absorbedBookId },
      select: {
        userId: true,
        score: true,
        reasons: true,
        seen: true,
        dismissed: true,
        computedAt: true,
      },
    });
    for (const r of absorbedRecs) {
      const existing = await tx.userRecommendation.findFirst({
        where: { userId: r.userId, bookId: primaryBookId },
        select: {
          id: true,
          score: true,
          reasons: true,
          seen: true,
          dismissed: true,
          computedAt: true,
        },
      });
      if (!existing) {
        await tx.userRecommendation.create({
          data: {
            userId: r.userId,
            bookId: primaryBookId,
            score: r.score,
            reasons: r.reasons ?? [],
            seen: r.seen,
            dismissed: r.dismissed,
            computedAt: r.computedAt,
          },
        });
      } else {
        const mergedScore = Math.max(existing.score, r.score);
        const mergedSeen = existing.seen || r.seen;
        const mergedDismissed = existing.dismissed && r.dismissed;
        await tx.userRecommendation.update({
          where: { id: existing.id },
          data: {
            score: mergedScore,
            seen: mergedSeen,
            dismissed: mergedDismissed,
            computedAt: existing.computedAt > r.computedAt ? existing.computedAt : r.computedAt,
          },
        });
      }
    }
    await tx.userRecommendation.deleteMany({ where: { bookId: absorbedBookId } });

    // Snapshot: keep primary if present; otherwise move absorbed to primary.
    const primarySnap = await tx.bookMetadataSnapshot.findFirst({
      where: { bookId: primaryBookId },
      select: { id: true },
    });
    const absorbedSnap = await tx.bookMetadataSnapshot.findFirst({
      where: { bookId: absorbedBookId },
      select: { id: true },
    });
    if (!primarySnap && absorbedSnap) {
      await tx.bookMetadataSnapshot.update({
        where: { id: absorbedSnap.id },
        data: { bookId: primaryBookId },
      });
    } else if (absorbedSnap) {
      await tx.bookMetadataSnapshot.delete({ where: { id: absorbedSnap.id } });
    }

    // Soft delete absorbed book
    await tx.book.update({
      where: { id: absorbedBookId },
      data: { deletedAt: new Date() },
    });

    // Mark pair merged + audit
    await tx.duplicatePair.update({
      where: { id: pairId },
      data: { status: "merged", mergedIntoBookId: primaryBookId },
    });
    await tx.duplicateResolutionAudit.create({
      data: {
        pairId,
        actorId,
        action: "merged",
        primaryBookId,
        absorbedBookId,
        meta: {},
      },
    });
  });

  await logAdminAudit({
    action: "duplicate_merge",
    actorId,
    meta: { pairId, primaryBookId, absorbedBookId },
  });

  logShelfEvent("duplicate_merge", {
    ok: true,
    actorId,
    pairId,
    primaryBookId,
    absorbedBookId,
  });

  return { ok: true as const };
}
