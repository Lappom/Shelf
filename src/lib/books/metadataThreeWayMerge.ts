import type { SyncMetadata } from "./syncMetadataSchema";

export type MergeDecision = "no_change" | "take_epub" | "take_db" | "conflict_take_epub";

export type MergeFieldResult = {
  field: keyof SyncMetadata;
  decision: MergeDecision;
  changed: boolean;
  epubValue: unknown;
  dbValue: unknown;
  snapValue: unknown;
  chosenValue: unknown;
  conflict: boolean;
};

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function threeWayMergeField(args: {
  field: keyof SyncMetadata;
  epubValue: unknown;
  dbValue: unknown;
  snapValue: unknown;
  mergeWithEpub: boolean;
}): MergeFieldResult {
  const { field, epubValue, dbValue, snapValue, mergeWithEpub } = args;

  if (!mergeWithEpub) {
    if (deepEqual(dbValue, snapValue)) {
      return {
        field,
        decision: "no_change",
        changed: false,
        epubValue,
        dbValue,
        snapValue,
        chosenValue: dbValue,
        conflict: false,
      };
    }

    return {
      field,
      decision: "take_db",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  const epubEqSnap = deepEqual(epubValue, snapValue);
  const dbEqSnap = deepEqual(dbValue, snapValue);

  if (epubEqSnap && dbEqSnap) {
    return {
      field,
      decision: "no_change",
      changed: false,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  if (!epubEqSnap && dbEqSnap) {
    return {
      field,
      decision: "take_epub",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: epubValue,
      conflict: false,
    };
  }

  if (!dbEqSnap && epubEqSnap) {
    return {
      field,
      decision: "take_db",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  return {
    field,
    decision: "conflict_take_epub",
    changed: true,
    epubValue,
    dbValue,
    snapValue,
    chosenValue: epubValue,
    conflict: true,
  };
}

export function threeWayMergeAllFields(args: {
  epub: SyncMetadata;
  db: SyncMetadata;
  snapshot: SyncMetadata;
}): { mergedDb: SyncMetadata; fields: MergeFieldResult[]; requiresWriteback: boolean } {
  const { epub, db, snapshot } = args;

  const fieldsConfig = [
    { field: "title" as const, mergeWithEpub: true },
    { field: "authors" as const, mergeWithEpub: true },
    { field: "language" as const, mergeWithEpub: true },
    { field: "description" as const, mergeWithEpub: true },
    { field: "isbn10" as const, mergeWithEpub: true },
    { field: "isbn13" as const, mergeWithEpub: true },
    { field: "publisher" as const, mergeWithEpub: true },
    { field: "publishDate" as const, mergeWithEpub: true },
    { field: "subjects" as const, mergeWithEpub: true },
    { field: "pageCount" as const, mergeWithEpub: false },
    { field: "openLibraryId" as const, mergeWithEpub: false },
  ] as const;

  const fieldResults = fieldsConfig.map(({ field, mergeWithEpub }) =>
    threeWayMergeField({
      field,
      epubValue: epub[field],
      dbValue: db[field],
      snapValue: snapshot[field],
      mergeWithEpub,
    }),
  );

  const mergedDb = { ...db } as SyncMetadata;
  for (const r of fieldResults) {
    if (r.decision === "take_epub" || r.decision === "conflict_take_epub") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mergedDb as any)[r.field] = r.chosenValue;
    }
  }

  const requiresWriteback = fieldResults.some(
    (r) => r.decision === "take_db" && r.field !== "pageCount" && r.field !== "openLibraryId",
  );

  return { mergedDb, fields: fieldResults, requiresWriteback };
}
