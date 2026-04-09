import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerShelfMcpPrompts } from "./registerPrompts";
import { registerShelfMcpResources } from "./registerResources";
import { registerShelfMcpTools } from "./registerTools";

/**
 * New MCP server instance per HTTP request (stateless transport requirement).
 */
export function createShelfMcpServer(): McpServer {
  const mcp = new McpServer({ name: "shelf", version: "0.1.0" });
  registerShelfMcpTools(mcp);
  registerShelfMcpResources(mcp);
  registerShelfMcpPrompts(mcp);
  return mcp;
}
