import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Post a single update message to the host UI over HTTP",
  args: {
    message: tool.schema.string(),
  },
  async execute(args) {
    const url = "http://host.docker.internal:3001/api/agents/agent_update"

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        timestamp: new Date().toISOString(),
        scanId: process.env.SCAN_ID || "unknown",
      }),
    })

    return JSON.stringify(
      {
        url,
        status: response.status,
        ok: response.ok,
        body: await response.text().catch(() => ""),
      },
      null,
      2,
    )
  },
})
