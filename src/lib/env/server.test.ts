import { describe, expect, it } from "vitest";

import { ServerEnvValidationError, validateServerEnv } from "./server";

function env(p: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return p as NodeJS.ProcessEnv;
}

const prodBase = env({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  NEXTAUTH_SECRET: "x".repeat(32),
  NEXTAUTH_URL: "http://localhost:3000",
});

describe("validateServerEnv", () => {
  it("skips when SKIP_ENV_VALIDATION=1", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "production",
          SKIP_ENV_VALIDATION: "1",
        }),
      ),
    ).not.toThrow();
  });

  it("skips when SKIP_ENV_VALIDATION=true", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "production",
          SKIP_ENV_VALIDATION: "true",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects partial OIDC configuration", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "development",
          OIDC_ISSUER: "https://idp.example.com",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("accepts full OIDC configuration", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "development",
          OIDC_ISSUER: "https://idp.example.com",
          OIDC_CLIENT_ID: "client",
          OIDC_CLIENT_SECRET: "secret",
        }),
      ),
    ).not.toThrow();
  });

  it("requires DATABASE_URL in production", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "production",
          NEXTAUTH_SECRET: "x".repeat(32),
          NEXTAUTH_URL: "http://localhost:3000",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("requires NEXTAUTH_SECRET min length in production", () => {
    expect(() =>
      validateServerEnv(
        env({
          ...prodBase,
          NEXTAUTH_SECRET: "short",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("requires absolute NEXTAUTH_URL in production", () => {
    expect(() =>
      validateServerEnv(
        env({
          ...prodBase,
          NEXTAUTH_URL: "localhost:3000",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("requires all S3 vars when STORAGE_TYPE=s3", () => {
    expect(() =>
      validateServerEnv(
        env({
          ...prodBase,
          STORAGE_TYPE: "s3",
          S3_ENDPOINT: "http://minio:9000",
          S3_BUCKET: "b",
          S3_ACCESS_KEY: "k",
          // missing S3_SECRET_KEY, S3_REGION
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("accepts s3 when all vars set", () => {
    expect(() =>
      validateServerEnv(
        env({
          ...prodBase,
          STORAGE_TYPE: "s3",
          S3_ENDPOINT: "http://minio:9000",
          S3_BUCKET: "b",
          S3_ACCESS_KEY: "k",
          S3_SECRET_KEY: "s",
          S3_REGION: "us-east-1",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects invalid OPENLIBRARY_RATE_LIMIT", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "development",
          OPENLIBRARY_RATE_LIMIT: "0",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });

  it("rejects invalid DEFAULT_LOCALE", () => {
    expect(() =>
      validateServerEnv(
        env({
          NODE_ENV: "development",
          DEFAULT_LOCALE: "FR_fr",
        }),
      ),
    ).toThrow(ServerEnvValidationError);
  });
});
