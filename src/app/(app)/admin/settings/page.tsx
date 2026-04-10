import { requireAdminPage } from "@/lib/auth/rbac";
import { getAppNameFromEnv, pickServerEnvVars } from "@/lib/env/server";

import { AdminSettingsSections } from "./AdminSettingsSections";

export default async function AdminSettingsPage() {
  await requireAdminPage();

  const env = pickServerEnvVars(process.env);
  const appName = getAppNameFromEnv(process.env);
  const storageType = env.STORAGE_TYPE ?? "local";
  const oidcConfigured = Boolean(
    env.OIDC_ISSUER?.trim() && env.OIDC_CLIENT_ID?.trim() && env.OIDC_CLIENT_SECRET?.trim(),
  );

  return (
    <AdminSettingsSections
      data={{
        appName,
        nodeEnv: env.NODE_ENV,
        defaultLocale: env.DEFAULT_LOCALE,
        nextAuthUrl: env.NEXTAUTH_URL,
        oidcConfigured,
        oidcIssuer: env.OIDC_ISSUER,
        storageType,
        storagePath: env.STORAGE_PATH,
        s3Bucket: env.S3_BUCKET,
        s3Endpoint: env.S3_ENDPOINT,
        s3Region: env.S3_REGION,
      }}
    />
  );
}
