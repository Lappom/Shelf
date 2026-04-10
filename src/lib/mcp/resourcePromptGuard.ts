import { requireMcpContext } from "@/lib/mcp/context";
import { denyUnlessMcpScopes, MCP_PROMPT_SCOPES, MCP_RESOURCE_SCOPES } from "@/lib/mcp/scopes";
import { getMcpToolRateLimit } from "@/lib/mcp/toolRateLimits";
import { rateLimit } from "@/lib/security/rateLimit";

type ResourceKey = keyof typeof MCP_RESOURCE_SCOPES;
type PromptKey = keyof typeof MCP_PROMPT_SCOPES;

export async function mcpGuardResource(resourceKey: ResourceKey): Promise<void> {
  const ctx = requireMcpContext();
  const required = MCP_RESOURCE_SCOPES[resourceKey];
  const denied = denyUnlessMcpScopes(ctx, required);
  if (denied) throw new Error(denied.content[0]?.text ?? "Forbidden");

  const rl = await rateLimit({
    key: `mcp:tool:${ctx.apiKeyId}:resource:${resourceKey}`,
    limit: getMcpToolRateLimit(`resource:${resourceKey}`),
    windowMs: 60_000,
  });
  if (!rl.ok) throw new Error("Rate limit exceeded for MCP resources. Try again later.");
}

export async function mcpGuardPrompt(promptName: PromptKey): Promise<void> {
  const ctx = requireMcpContext();
  const required = MCP_PROMPT_SCOPES[promptName];
  const denied = denyUnlessMcpScopes(ctx, required);
  if (denied) throw new Error(denied.content[0]?.text ?? "Forbidden");

  const rl = await rateLimit({
    key: `mcp:tool:${ctx.apiKeyId}:prompt:${promptName}`,
    limit: getMcpToolRateLimit(`prompt:${promptName}`),
    windowMs: 60_000,
  });
  if (!rl.ok) throw new Error("Rate limit exceeded for MCP prompts. Try again later.");
}
