export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function mcpJsonResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function mcpErrorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
