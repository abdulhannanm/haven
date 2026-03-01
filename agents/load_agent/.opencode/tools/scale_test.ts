import { tool } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

export default tool({
  description: "Using k6 take the list of routes that is passed in and run the k6 stress test on all those paths",
  args: {
    routes: tool.schema.array(
      tool.schema.object({
        path: tool.schema.string(),
        method: tool.schema.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        bodySchema: tool.schema.optional(
          tool.schema.array(
            tool.schema.object({
              name: tool.schema.string(),
              type: tool.schema.string(),
            }),
          ),
        ),
      }),
    ),
  },
  async execute(args) {
    const baseUrlRaw = process.env.TARGET_BASE_URL;
    if (!baseUrlRaw) {
      throw new Error("TARGET_BASE_URL is not set");
    }

    const baseUrl = baseUrlRaw.replace(/\/+$/u, "");
    const execFileAsync = promisify(execFile);

    const results: Array<{
      path: string;
      method: string;
      url: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      error?: string;
    }> = [];

    for (const route of args.routes) {
      const url = `${baseUrl}${route.path.startsWith("/") ? route.path : `/${route.path}`}`;

      const largeString = "X".repeat(1_000_000);
      const bodyPayload = Array.isArray(route.bodySchema)
        ? route.bodySchema.reduce<Record<string, unknown>>((acc, field, index) => {
            const type = field.type.toLowerCase();
            switch (type) {
              case "int":
              case "integer":
              case "number":
                acc[field.name] = (index + 1) * 1000;
                break;
              case "bool":
              case "boolean":
                acc[field.name] = index % 2 === 0;
                break;
              case "str":
              case "string":
                acc[field.name] = `${largeString}_${index + 1}`;
                break;
              case "list":
                acc[field.name] = [largeString, largeString, largeString];
                break;
              case "object":
              case "obj":
                acc[field.name] = { payload: largeString };
                break;
              default:
                acc[field.name] = `${largeString}_${index + 1}`;
            }
            return acc;
          }, {})
        : {};

      const hasBody = route.method !== "GET" && route.method !== "DELETE";
      const bodyLine = hasBody ? `const payload = ${JSON.stringify(bodyPayload)};` : "";
      const requestLine = hasBody
        ? `let res = http.request("${route.method}", "${url}", JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });`
        : `let res = http.request("${route.method}", "${url}");`;

      const script = `
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  thresholds: {
    http_req_duration: [{ threshold: "p(99) < 3000", abortOnFail: true }],
    http_req_failed: [{ threshold: "rate < 0.01", abortOnFail: true }],
    checks: [{ threshold: "rate == 1", abortOnFail: true }],
  },
  stages: [
    { duration: "10s", target: 50 },
    { duration: "10s", target: 100 },
    { duration: "10s", target: 200 },
    { duration: "10s", target: 200 },
  ],
};

export default function () {
  ${bodyLine}
  ${requestLine}
  check(res, { "status was 200": (r) => r.status == 200 });
  sleep(1);
}
`.trimStart();

      const scriptPath = join(tmpdir(), `k6-${randomUUID()}.js`);
      const summaryPath = join(tmpdir(), `k6-summary-${randomUUID()}.json`);
      await writeFile(scriptPath, script, "utf8");

      try {
        const { stdout, stderr } = await execFileAsync(
          "k6",
          ["run", "--summary-export", summaryPath, scriptPath],
          {
          maxBuffer: 10 * 1024 * 1024,
          },
        );
        const summary = await readFile(summaryPath, "utf8").catch(() => "");
        results.push({
          path: route.path,
          method: route.method,
          url,
          exitCode: 0,
          stdout,
          stderr,
          summary,
        });
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
        const summary = await readFile(summaryPath, "utf8").catch(() => "");
        results.push({
          path: route.path,
          method: route.method,
          url,
          exitCode: typeof err.code === "number" ? err.code : 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          error: err.message ?? "k6 run failed",
          summary,
        });
      } finally {
        await unlink(scriptPath).catch(() => undefined);
        await unlink(summaryPath).catch(() => undefined);
      }
    }

    return JSON.stringify(
      {
        baseUrl,
        results,
      },
      null,
      2,
    );
  },
})
