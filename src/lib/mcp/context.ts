import { AsyncLocalStorage } from "node:async_hooks";

import type { UserRole } from "@prisma/client";

export type McpRequestContext = {
  userId: string;
  role: UserRole;
  apiKeyId: string;
};

const storage = new AsyncLocalStorage<McpRequestContext>();

export function getMcpContext(): McpRequestContext | undefined {
  return storage.getStore();
}

export function requireMcpContext(): McpRequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("MCP_CONTEXT_MISSING");
  return ctx;
}

export function runWithMcpContext<T>(ctx: McpRequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}
