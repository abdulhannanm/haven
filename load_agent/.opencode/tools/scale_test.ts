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
        jsonBody: tool.schema.optional(tool.schema.any()),
        bodySchema: tool.schema.optional(
          tool.schema.array(
            tool.schema.object({
              name: tool.schema.string(),
              type: tool.schema.string(),
              required: tool.schema.optional(tool.schema.boolean()),
              default: tool.schema.optional(tool.schema.any()),
              example: tool.schema.optional(tool.schema.any()),
              enum: tool.schema.optional(tool.schema.array(tool.schema.any())),
            }),
          ),
        ),
      }),
    ),
    auth: tool.schema.optional(
      tool.schema.object({
        token: tool.schema.optional(tool.schema.string()),
        email: tool.schema.optional(tool.schema.string()),
        password: tool.schema.optional(tool.schema.string()),
        roleHint: tool.schema.optional(tool.schema.string()),
        headers: tool.schema.optional(
          tool.schema.object({}).passthrough(),
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
    const authHeaders = await resolveAuthHeaders(baseUrl, args.auth ?? {});

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

      const bodyPayload = route.jsonBody ?? (Array.isArray(route.bodySchema)
        ? route.bodySchema.reduce<Record<string, unknown>>((acc, field, index) => {
            acc[field.name] = buildSampleValue(
              field.name,
              field.type,
              index,
              field.example,
              field.default,
              field.enum,
            );
            return acc;
          }, {})
        : {});

      const hasBody = route.method !== "GET" && route.method !== "DELETE";
      const headers = {
        ...(Object.keys(authHeaders).length > 0 ? authHeaders : {}),
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      };
      const bodyLine = hasBody ? `const payload = ${JSON.stringify(bodyPayload)};` : "";
      const requestLine = hasBody
        ? `let res = http.request("${route.method}", "${url}", JSON.stringify(payload), { headers: ${JSON.stringify(headers)} });`
        : `let res = http.request("${route.method}", "${url}", { headers: ${JSON.stringify(headers)} });`;

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
    { duration: "30s", target: 1000 },
    { duration: "30s", target: 2000 },
    { duration: "30s", target: 3500 },
    { duration: "30s", target: 5000 },
    { duration: "30s", target: 5000 },
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

async function resolveAuthHeaders(
  baseUrl: string,
  auth: {
    token?: string;
    email?: string;
    password?: string;
    roleHint?: string;
    headers?: Record<string, string>;
  },
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(auth.headers ?? {}) };
  if (auth.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
    return headers;
  }
  if (auth.email && auth.password) {
    const token = await ensureToken(baseUrl, auth.email, auth.password, auth.roleHint);
    if (!token) {
      throw new Error(`Authentication failed for ${auth.email}`);
    }
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function ensureToken(
  baseUrl: string,
  email: string,
  password: string,
  roleHint?: string,
): Promise<string | undefined> {
  const existingToken = await loginForToken(baseUrl, email, password);
  if (existingToken) return existingToken;

  const isAdmin = roleHint?.toLowerCase() === "admin" || email.toLowerCase().includes("admin@");
  if (isAdmin) return undefined;

  const registered = await registerIfAvailable(baseUrl, email, password);
  if (!registered) return undefined;

  return loginForToken(baseUrl, email, password);
}

async function loginForToken(baseUrl: string, email: string, password: string): Promise<string | undefined> {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return undefined;
  const json = (await response.json().catch(() => undefined)) as { access_token?: string } | undefined;
  if (json && typeof json.access_token === "string" && json.access_token.length > 0) {
    return json.access_token;
  }
  return undefined;
}

async function registerIfAvailable(baseUrl: string, email: string, password: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: deriveNameFromEmail(email),
      email,
      password,
    }),
  });

  if (response.ok) return true;
  if (response.status === 400 || response.status === 409) return true;
  return false;
}

function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "load-user";
  const words = localPart
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.length > 0 ? words.join(" ") : "Load User";
}

function buildSampleValue(
  name: string,
  type: string,
  index: number,
  example?: unknown,
  defaultValue?: unknown,
  enumValues?: unknown[],
): unknown {
  if (example !== undefined) return example;
  if (defaultValue !== undefined) return defaultValue;
  if (Array.isArray(enumValues) && enumValues.length > 0) return enumValues[0];

  const normalizedName = name.toLowerCase();
  const normalizedType = type.toLowerCase();

  switch (normalizedType) {
    case "int":
    case "integer":
      return index + 1;
    case "number":
      return index + 1;
    case "bool":
    case "boolean":
      return true;
    case "list":
    case "array":
      if (normalizedName.includes("skill") || normalizedName.includes("tag")) {
        return ["sample"];
      }
      return ["item"];
    case "object":
    case "obj":
      return {};
    case "str":
    case "string":
    default:
      return sampleStringForField(normalizedName, index);
  }
}

function sampleStringForField(name: string, index: number): string {
  if (name.includes("email")) return `loadtest${index + 1}@example.com`;
  if (name.includes("password")) return "alice-pass";
  if (name.includes("name")) return `Load Test ${index + 1}`;
  if (name.includes("title")) return `Load Test Title ${index + 1}`;
  if (name.includes("description")) return "Load test description";
  if (name.includes("message")) return "Load test message";
  if (name.includes("location")) return "Test Location";
  if (name.includes("category")) return "general";
  if (name.includes("availability")) return "Weekdays";
  if (name.includes("phone")) return "5550100";
  if (name.includes("token")) return "sample-token";
  return `sample-${index + 1}`;
}
