import { z } from "zod";

function trimmedOptionalString(env: NodeJS.ProcessEnv, key: string) {
  const v = env[key];
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Raw env slice used for validation (testable). */
export function pickServerEnvVars(env: NodeJS.ProcessEnv) {
  return {
    NODE_ENV: env.NODE_ENV,
    SKIP_ENV_VALIDATION: env.SKIP_ENV_VALIDATION,
    DATABASE_URL: trimmedOptionalString(env, "DATABASE_URL"),
    NEXTAUTH_SECRET: trimmedOptionalString(env, "NEXTAUTH_SECRET"),
    NEXTAUTH_URL: trimmedOptionalString(env, "NEXTAUTH_URL"),
    OIDC_ISSUER: trimmedOptionalString(env, "OIDC_ISSUER"),
    OIDC_CLIENT_ID: trimmedOptionalString(env, "OIDC_CLIENT_ID"),
    OIDC_CLIENT_SECRET: trimmedOptionalString(env, "OIDC_CLIENT_SECRET"),
    STORAGE_TYPE: trimmedOptionalString(env, "STORAGE_TYPE"),
    STORAGE_PATH: trimmedOptionalString(env, "STORAGE_PATH"),
    S3_ENDPOINT: trimmedOptionalString(env, "S3_ENDPOINT"),
    S3_BUCKET: trimmedOptionalString(env, "S3_BUCKET"),
    S3_ACCESS_KEY: trimmedOptionalString(env, "S3_ACCESS_KEY"),
    S3_SECRET_KEY: trimmedOptionalString(env, "S3_SECRET_KEY"),
    S3_REGION: trimmedOptionalString(env, "S3_REGION"),
    OPENLIBRARY_RATE_LIMIT: trimmedOptionalString(env, "OPENLIBRARY_RATE_LIMIT"),
    APP_NAME: trimmedOptionalString(env, "APP_NAME"),
    DEFAULT_LOCALE: trimmedOptionalString(env, "DEFAULT_LOCALE"),
  };
}

function isAbsoluteHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    SKIP_ENV_VALIDATION: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL: z.string().optional(),
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    STORAGE_TYPE: z
      .string()
      .optional()
      .transform((v) => (v?.trim() ? v.trim() : "local")),
    STORAGE_PATH: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_REGION: z.string().optional(),
    OPENLIBRARY_RATE_LIMIT: z.string().optional(),
    APP_NAME: z.string().optional(),
    DEFAULT_LOCALE: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.STORAGE_TYPE !== "local" && data.STORAGE_TYPE !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `STORAGE_TYPE must be "local" or "s3", got "${data.STORAGE_TYPE}"`,
        path: ["STORAGE_TYPE"],
      });
    }

    const oidcSet = [data.OIDC_ISSUER, data.OIDC_CLIENT_ID, data.OIDC_CLIENT_SECRET].filter(
      Boolean,
    ).length;
    if (oidcSet > 0 && oidcSet < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "OIDC: set all of OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, or none for credentials-only auth",
        path: ["OIDC_ISSUER"],
      });
    }

    if (data.NODE_ENV === "production") {
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABASE_URL is required in production",
          path: ["DATABASE_URL"],
        });
      }
      if (!data.NEXTAUTH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NEXTAUTH_SECRET is required in production",
          path: ["NEXTAUTH_SECRET"],
        });
      } else if (data.NEXTAUTH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NEXTAUTH_SECRET must be at least 32 characters in production",
          path: ["NEXTAUTH_SECRET"],
        });
      }
      if (!data.NEXTAUTH_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NEXTAUTH_URL is required in production",
          path: ["NEXTAUTH_URL"],
        });
      } else if (!isAbsoluteHttpUrl(data.NEXTAUTH_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NEXTAUTH_URL must be an absolute http(s) URL",
          path: ["NEXTAUTH_URL"],
        });
      }
    }

    if (data.STORAGE_TYPE === "s3") {
      const s3Keys: [string, string | undefined][] = [
        ["S3_ENDPOINT", data.S3_ENDPOINT],
        ["S3_BUCKET", data.S3_BUCKET],
        ["S3_ACCESS_KEY", data.S3_ACCESS_KEY],
        ["S3_SECRET_KEY", data.S3_SECRET_KEY],
        ["S3_REGION", data.S3_REGION],
      ];
      for (const [name, val] of s3Keys) {
        if (!val?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} is required when STORAGE_TYPE=s3`,
            path: [name],
          });
        }
      }
    }

    if (data.OPENLIBRARY_RATE_LIMIT !== undefined) {
      const n = Number(data.OPENLIBRARY_RATE_LIMIT);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "OPENLIBRARY_RATE_LIMIT must be a positive number",
          path: ["OPENLIBRARY_RATE_LIMIT"],
        });
      }
    }

    if (data.DEFAULT_LOCALE !== undefined) {
      if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(data.DEFAULT_LOCALE)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'DEFAULT_LOCALE must match /^[a-z]{2}(-[A-Z]{2})?$/ (e.g. "fr" or "en-US")',
          path: ["DEFAULT_LOCALE"],
        });
      }
    }
  });

export class ServerEnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerEnvValidationError";
  }
}

/**
 * Validates process env for the Node server. Call from instrumentation on startup.
 * Set SKIP_ENV_VALIDATION=1 (or "true") to skip (e.g. Docker build, CI).
 */
export function validateServerEnv(env: NodeJS.ProcessEnv = process.env): void {
  const skip = env.SKIP_ENV_VALIDATION?.trim();
  if (skip === "1" || skip?.toLowerCase() === "true") return;

  const picked = pickServerEnvVars(env);
  const parsed = serverEnvSchema.safeParse(picked);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => {
      const path = i.path.length ? i.path.join(".") : "env";
      return `  - ${path}: ${i.message}`;
    });
    throw new ServerEnvValidationError(`Invalid environment:\n${lines.join("\n")}`);
  }
}

export function getAppNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_NAME?.trim() || "Shelf";
}

export function getDefaultLocaleFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DEFAULT_LOCALE?.trim();
  if (raw && /^[a-z]{2}(-[A-Z]{2})?$/.test(raw)) return raw;
  return "fr";
}
