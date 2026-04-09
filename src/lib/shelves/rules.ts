import { z } from "zod";
import { Prisma } from "@prisma/client";

export const ShelfRuleMatchSchema = z.enum(["all", "any"]);
export type ShelfRuleMatch = z.infer<typeof ShelfRuleMatchSchema>;

export const ShelfRuleFieldSchema = z.enum([
  "language",
  "format",
  "page_count",
  "added_at",
  "authors",
  "subjects",
  "tags",
]);
export type ShelfRuleField = z.infer<typeof ShelfRuleFieldSchema>;

export const ShelfRuleOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "after",
  "before",
  "has_any",
  "has_all",
  "is_empty",
  "is_not_empty",
]);
export type ShelfRuleOperator = z.infer<typeof ShelfRuleOperatorSchema>;

const StringArraySchema = z.array(z.string().trim().min(1).max(200)).min(1).max(50);

const ConditionBaseSchema = z.object({
  field: ShelfRuleFieldSchema,
  operator: ShelfRuleOperatorSchema,
  value: z.unknown().optional(),
});

export const ShelfRuleConditionSchema = ConditionBaseSchema.superRefine((c, ctx) => {
  const op = c.operator;

  const isNoValueOp = op === "is_empty" || op === "is_not_empty";
  if (isNoValueOp) return;

  if (c.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing value." });
    return;
  }

  const field = c.field;

  const requireString = () => {
    const parsed = z.string().trim().min(1).max(200).safeParse(c.value);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a string." });
    }
  };

  const requireStringArray = () => {
    const parsed = StringArraySchema.safeParse(c.value);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a string array." });
    }
  };

  const requireNumber = () => {
    const parsed = z.coerce.number().finite().safeParse(c.value);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a number." });
    }
  };

  const requireDateString = () => {
    const parsed = z.string().trim().min(1).max(40).safeParse(c.value);
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Value must be a date string." });
      return;
    }
    const d = new Date(parsed.data);
    if (!Number.isFinite(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date string." });
    }
  };

  if (field === "page_count") {
    if (!["gt", "gte", "lt", "lte", "eq", "neq", "in", "not_in"].includes(op)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Operator not supported for page_count." });
      return;
    }
    if (op === "in" || op === "not_in") requireStringArray(); // coerce later via SQL cast
    else requireNumber();
    return;
  }

  if (field === "added_at") {
    if (!["after", "before", "eq", "neq"].includes(op)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Operator not supported for added_at." });
      return;
    }
    requireDateString();
    return;
  }

  if (field === "tags") {
    if (op === "has_any" || op === "has_all" || op === "in" || op === "not_in") {
      requireStringArray();
      return;
    }
    if (op === "is_empty" || op === "is_not_empty") return;
    if (op === "contains" || op === "not_contains" || op === "eq" || op === "neq") {
      requireString();
      return;
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Operator not supported for tags." });
    return;
  }

  const isArrayField = field === "authors" || field === "subjects";
  if (isArrayField) {
    if (op === "contains" || op === "not_contains" || op === "eq" || op === "neq") {
      requireString();
      return;
    }
    if (op === "has_any" || op === "has_all" || op === "in" || op === "not_in") {
      requireStringArray();
      return;
    }
    if (op === "is_empty" || op === "is_not_empty") return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Operator not supported for array field." });
    return;
  }

  // scalar text fields: language, format
  if (field === "language" || field === "format") {
    if (op === "in" || op === "not_in") {
      requireStringArray();
      return;
    }
    if (op === "eq" || op === "neq" || op === "contains" || op === "not_contains") {
      requireString();
      return;
    }
    if (op === "is_empty" || op === "is_not_empty") return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Operator not supported for text field." });
  }
});

export const ShelfRuleSchema = z.object({
  match: ShelfRuleMatchSchema,
  conditions: z.array(ShelfRuleConditionSchema).max(50),
});
export type ShelfRule = z.infer<typeof ShelfRuleSchema>;

export function parseShelfRuleJson(input: unknown): ShelfRule {
  return ShelfRuleSchema.parse(input);
}

function ilikePattern(value: string) {
  const v = value.trim();
  return `%${v.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function buildTextScalarCondition(args: {
  columnSql: Prisma.Sql;
  operator: ShelfRuleOperator;
  value: unknown;
}): Prisma.Sql {
  const v =
    typeof args.value === "string"
      ? args.value.trim()
      : Array.isArray(args.value)
        ? String(args.value[0] ?? "").trim()
        : String(args.value ?? "").trim();

  switch (args.operator) {
    case "eq":
      return Prisma.sql`LOWER(${args.columnSql}) = LOWER(${v})`;
    case "neq":
      return Prisma.sql`LOWER(${args.columnSql}) <> LOWER(${v})`;
    case "contains":
      return Prisma.sql`${args.columnSql} ILIKE ${ilikePattern(v)} ESCAPE '\\'`;
    case "not_contains":
      return Prisma.sql`NOT (${args.columnSql} ILIKE ${ilikePattern(v)} ESCAPE '\\')`;
    case "is_empty":
      return Prisma.sql`(${args.columnSql} IS NULL OR ${args.columnSql} = '')`;
    case "is_not_empty":
      return Prisma.sql`(${args.columnSql} IS NOT NULL AND ${args.columnSql} <> '')`;
    case "in": {
      const list = StringArraySchema.parse(args.value).map((x) => x.trim());
      return Prisma.sql`LOWER(${args.columnSql}) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})`;
    }
    case "not_in": {
      const list = StringArraySchema.parse(args.value).map((x) => x.trim());
      return Prisma.sql`LOWER(${args.columnSql}) NOT IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})`;
    }
    default:
      return Prisma.sql`TRUE`;
  }
}

function buildJsonArrayStringCondition(args: {
  jsonColumnName: "authors" | "subjects";
  operator: ShelfRuleOperator;
  value: unknown;
}): Prisma.Sql {
  const col = Prisma.raw(`b.${args.jsonColumnName}`);

  const elemMatches = (needle: string) =>
    Prisma.sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${col}) AS elem(value)
      WHERE elem.value ILIKE ${ilikePattern(needle)} ESCAPE '\\'
    )`;

  switch (args.operator) {
    case "contains": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return elemMatches(needle);
    }
    case "not_contains": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return Prisma.sql`NOT (${elemMatches(needle)})`;
    }
    case "eq": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${col}) AS elem(value)
        WHERE LOWER(elem.value) = LOWER(${needle})
      )`;
    }
    case "neq": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${col}) AS elem(value)
        WHERE LOWER(elem.value) = LOWER(${needle})
      )`;
    }
    case "has_any":
    case "in": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${col}) AS elem(value)
        WHERE LOWER(elem.value) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`;
    }
    case "has_all": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`${Prisma.sql`(
        SELECT COUNT(DISTINCT LOWER(elem.value))
        FROM jsonb_array_elements_text(${col}) AS elem(value)
        WHERE LOWER(elem.value) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`} = ${list.length}`;
    }
    case "not_in": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${col}) AS elem(value)
        WHERE LOWER(elem.value) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`;
    }
    case "is_empty":
      return Prisma.sql`(jsonb_typeof(${col}) <> 'array' OR jsonb_array_length(${col}) = 0)`;
    case "is_not_empty":
      return Prisma.sql`(jsonb_typeof(${col}) = 'array' AND jsonb_array_length(${col}) > 0)`;
    default:
      return Prisma.sql`TRUE`;
  }
}

function buildTagsCondition(args: { operator: ShelfRuleOperator; value: unknown }): Prisma.Sql {
  const tagExists = (name: string) =>
    Prisma.sql`EXISTS (
      SELECT 1
      FROM "book_tags" bt
      JOIN "tags" t ON t.id = bt.tag_id
      WHERE bt.book_id = b.id
        AND LOWER(t.name) = LOWER(${name})
    )`;

  const tagLikeExists = (pattern: string) =>
    Prisma.sql`EXISTS (
      SELECT 1
      FROM "book_tags" bt
      JOIN "tags" t ON t.id = bt.tag_id
      WHERE bt.book_id = b.id
        AND t.name ILIKE ${ilikePattern(pattern)} ESCAPE '\\'
    )`;

  switch (args.operator) {
    case "contains": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return tagLikeExists(needle);
    }
    case "not_contains": {
      const needle = z.string().trim().min(1).max(200).parse(args.value);
      return Prisma.sql`NOT (${tagLikeExists(needle)})`;
    }
    case "eq": {
      const name = z.string().trim().min(1).max(200).parse(args.value);
      return tagExists(name);
    }
    case "neq": {
      const name = z.string().trim().min(1).max(200).parse(args.value);
      return Prisma.sql`NOT (${tagExists(name)})`;
    }
    case "has_any":
    case "in": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM "book_tags" bt
        JOIN "tags" t ON t.id = bt.tag_id
        WHERE bt.book_id = b.id
          AND LOWER(t.name) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`;
    }
    case "has_all": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`${Prisma.sql`(
        SELECT COUNT(DISTINCT LOWER(t.name))
        FROM "book_tags" bt
        JOIN "tags" t ON t.id = bt.tag_id
        WHERE bt.book_id = b.id
          AND LOWER(t.name) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`} = ${list.length}`;
    }
    case "not_in": {
      const list = StringArraySchema.parse(args.value);
      return Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM "book_tags" bt
        JOIN "tags" t ON t.id = bt.tag_id
        WHERE bt.book_id = b.id
          AND LOWER(t.name) IN (${Prisma.join(list.map((x) => Prisma.sql`LOWER(${x})`))})
      )`;
    }
    case "is_empty":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "book_tags" bt WHERE bt.book_id = b.id)`;
    case "is_not_empty":
      return Prisma.sql`EXISTS (SELECT 1 FROM "book_tags" bt WHERE bt.book_id = b.id)`;
    default:
      return Prisma.sql`TRUE`;
  }
}

function buildConditionSql(c: ShelfRule["conditions"][number]): Prisma.Sql {
  switch (c.field) {
    case "language":
      return buildTextScalarCondition({
        columnSql: Prisma.raw("b.language"),
        operator: c.operator,
        value: c.value,
      });
    case "format":
      return buildTextScalarCondition({
        columnSql: Prisma.raw("b.format"),
        operator: c.operator,
        value: c.value,
      });
    case "page_count": {
      const v = c.value;
      const col = Prisma.raw("b.page_count");
      if (c.operator === "in" || c.operator === "not_in") {
        const list = StringArraySchema.parse(v).map((x) => Number(x));
        const nums = list.filter((n) => Number.isFinite(n));
        if (!nums.length) return Prisma.sql`FALSE`;
        const inSql = Prisma.sql`${col} IN (${Prisma.join(nums.map((n) => Prisma.sql`${n}`))})`;
        return c.operator === "in" ? inSql : Prisma.sql`NOT (${inSql})`;
      }
      const num = z.coerce.number().finite().parse(v);
      switch (c.operator) {
        case "eq":
          return Prisma.sql`${col} = ${num}`;
        case "neq":
          return Prisma.sql`${col} <> ${num}`;
        case "gt":
          return Prisma.sql`${col} > ${num}`;
        case "gte":
          return Prisma.sql`${col} >= ${num}`;
        case "lt":
          return Prisma.sql`${col} < ${num}`;
        case "lte":
          return Prisma.sql`${col} <= ${num}`;
        default:
          return Prisma.sql`TRUE`;
      }
    }
    case "added_at": {
      const col = Prisma.raw("b.created_at");
      const d = new Date(z.string().parse(c.value));
      if (!Number.isFinite(d.getTime())) return Prisma.sql`FALSE`;
      const iso = d.toISOString();
      switch (c.operator) {
        case "after":
          return Prisma.sql`${col} > ${iso}::timestamptz`;
        case "before":
          return Prisma.sql`${col} < ${iso}::timestamptz`;
        case "eq":
          return Prisma.sql`DATE(${col}) = DATE(${iso}::timestamptz)`;
        case "neq":
          return Prisma.sql`DATE(${col}) <> DATE(${iso}::timestamptz)`;
        default:
          return Prisma.sql`TRUE`;
      }
    }
    case "authors":
      return buildJsonArrayStringCondition({
        jsonColumnName: "authors",
        operator: c.operator,
        value: c.value,
      });
    case "subjects":
      return buildJsonArrayStringCondition({
        jsonColumnName: "subjects",
        operator: c.operator,
        value: c.value,
      });
    case "tags":
      return buildTagsCondition({ operator: c.operator, value: c.value });
  }
}

export function buildShelfRuleWhereSql(rule: ShelfRule): Prisma.Sql {
  const conditions = rule.conditions.map(buildConditionSql);
  if (!conditions.length) return Prisma.sql`TRUE`;
  const joiner = rule.match === "all" ? Prisma.sql` AND ` : Prisma.sql` OR `;
  return Prisma.sql`(${Prisma.join(conditions, joiner)})`;
}

