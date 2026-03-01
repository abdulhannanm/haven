import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"

type RawRoute = any

type NormalizedRoute = {
  method: string
  path: string
  json?: any
  schemaName?: string
}

type ContextInput = {
  name: string
  email?: string
  password?: string
  token?: string
  headers?: Record<string, string>
  roleHint?: string
}

type NormalizedContext = {
  name: string
  headers: Record<string, string>
  roleHint?: string
  isAdmin: boolean
  isAnon: boolean
}

type RequestResult = {
  url: string
  method: string
  status: number
  ok: boolean
  durationMs: number
  contentType: string
  jsonBody?: any
  textBodyTrunc?: string
  error?: string
}

type ScanOptions = {
  timeoutMs: number
  maxRoutes: number
  maxIdorAttempts: number
  sensitiveKeys: string[]
}

type FindingType = "MISSING_AUTH" | "PRIV_ESC" | "IDOR" | "SENSITIVE_LEAK"

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

type Finding = {
  type: FindingType
  severity: Severity
  route: { method: string; path: string }
  evidence: Record<string, unknown>
  recommendation: string
}

const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "authorization",
]

const DEFAULT_OPTIONS: ScanOptions = {
  timeoutMs: 3000,
  maxRoutes: 25,
  maxIdorAttempts: 2,
  sensitiveKeys: DEFAULT_SENSITIVE_KEYS,
}

export default tool({
  description: "Scan API routes for security boundary and data authentication issues",
  args: {
    routes: tool.schema.array(
      tool.schema.object({
        method: tool.schema.optional(tool.schema.string()),
        httpMethod: tool.schema.optional(tool.schema.string()),
        verb: tool.schema.optional(tool.schema.string()),
        path: tool.schema.optional(tool.schema.string()),
        url: tool.schema.optional(tool.schema.string()),
        schemaName: tool.schema.optional(tool.schema.string()),
        json: tool.schema.optional(tool.schema.object({}).passthrough()),
        body: tool.schema.optional(tool.schema.object({}).passthrough()),
      }).passthrough(),
    ),
    contexts: tool.schema.array(
      tool.schema.object({
        name: tool.schema.string(),
        email: tool.schema.optional(tool.schema.string()),
        password: tool.schema.optional(tool.schema.string()),
        token: tool.schema.optional(tool.schema.string()),
        headers: tool.schema.optional(tool.schema.object({}).passthrough()),
        roleHint: tool.schema.optional(tool.schema.string()),
      }),
    ),
    options: tool.schema.optional(
      tool.schema.object({
        timeoutMs: tool.schema.optional(tool.schema.number()),
        maxRoutes: tool.schema.optional(tool.schema.number()),
        maxIdorAttempts: tool.schema.optional(tool.schema.number()),
        sensitiveKeys: tool.schema.optional(tool.schema.array(tool.schema.string())),
      }),
    ),
  },
  async execute(args) {
    const baseUrlRaw = process.env.TARGET_BASE_URL
    if (!baseUrlRaw || baseUrlRaw.trim().length === 0) {
      throw new Error("TARGET_BASE_URL env var is required")
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/u, "")

    const startedAt = new Date().toISOString()
    const options: ScanOptions = {
      ...DEFAULT_OPTIONS,
      ...(args.options ?? {}),
      sensitiveKeys: (args.options?.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS).map((key: string) =>
        String(key).toLowerCase(),
      ),
    }

    const routes = normalizeRoutes(args.routes ?? [], options.maxRoutes)
    const contexts = await buildContexts(args.contexts ?? [], baseUrl, options.timeoutMs)

    const anonContext = contexts.find((ctx) => ctx.isAnon) ?? {
      name: "anon",
      headers: {},
      roleHint: undefined,
      isAdmin: false,
      isAnon: true,
    }

    const nonAnonContexts = contexts.filter((ctx) => !ctx.isAnon)
    const adminContext = nonAnonContexts.find((ctx) => ctx.isAdmin)

    const nonAdminAuthContexts = nonAnonContexts.filter((ctx) => !ctx.isAdmin && hasAuthHeader(ctx.headers))
    const primaryUser = pickPrimaryUser(nonAdminAuthContexts)

    const contextsUsed = Array.from(
      new Set(
        [anonContext, ...nonAnonContexts].map((ctx) => ctx.name),
      ),
    )

    let requestsMade = 0
    const listCache = new Map<string, string[]>()
    const listRouteSet = new Set(
      routes
        .filter((route) => route.method === "GET" && !route.path.includes("{"))
        .map((route) => route.path),
    )

    const findings: Finding[] = []
    const sensitiveDedup = new Set<string>()

    const sendWithCount = async (
      method: string,
      url: string,
      headers: Record<string, string>,
      jsonBody: any,
    ): Promise<RequestResult> => {
      requestsMade += 1
      return sendRequest({
        method,
        url,
        headers,
        jsonBody,
        timeoutMs: options.timeoutMs,
      })
    }

    const getListIds = async (ctx: NormalizedContext, listPath: string): Promise<string[] | null> => {
      if (!listRouteSet.has(listPath)) {
        return null
      }
      const cacheKey = `${ctx.name}::${listPath}`
      if (listCache.has(cacheKey)) {
        return listCache.get(cacheKey) ?? []
      }
      const url = `${baseUrl}${listPath}`
      const result = await sendWithCount("GET", url, ctx.headers, undefined)
      const ids = extractIdsFromList(result.jsonBody)
      listCache.set(cacheKey, ids)
      return ids
    }

    const resolvePath = async (route: NormalizedRoute, ctx: NormalizedContext): Promise<string> => {
      if (!route.path.includes("{")) {
        return route.path
      }
      const listPath = getListPath(route.path)
      if (listPath && listRouteSet.has(listPath)) {
        const ids = await getListIds(ctx, listPath)
        if (ids && ids.length > 0) {
          return substituteFirstParam(route.path, ids[0])
        }
      }
      return substituteAllParams(route.path, "1")
    }

    const scanResponseForSensitive = (route: NormalizedRoute, ctxName: string, res: RequestResult) => {
      if (!res.jsonBody) return
      const scan = scanSensitive(res.jsonBody, options.sensitiveKeys)
      if (scan.keyPaths.length === 0) return
      const dedupKey = `${route.method}::${route.path}::${scan.keyPaths.join("|")}`
      if (sensitiveDedup.has(dedupKey)) return
      sensitiveDedup.add(dedupKey)

      const severity = scan.severity
      findings.push(
        makeFinding("SENSITIVE_LEAK", severity, route, {
          context: ctxName,
          status: res.status,
          key_paths: scan.keyPaths,
          response_snippet: redactText(responseSnippet(res)),
        }),
      )
    }

    const shouldBeProtectedRoute = (route: NormalizedRoute): boolean => {
      if (route.path === "/" && route.method === "GET") return false
      if (route.method !== "GET") return true
      return /\/(donations|volunteers|users|admin|stats)(\/|$)/iu.test(route.path)
    }

    for (const route of routes) {
      const routeBody = route.json

      let anonResult: RequestResult | undefined
      if (anonContext) {
        const anonPath = await resolvePath(route, anonContext)
        const anonUrl = `${baseUrl}${anonPath}`
        anonResult = await sendWithCount(route.method, anonUrl, anonContext.headers, routeBody)
        scanResponseForSensitive(route, anonContext.name, anonResult)
      }

      let userResult: RequestResult | undefined
      let userUrl: string | undefined
      if (primaryUser) {
        const userPath = await resolvePath(route, primaryUser)
        userUrl = `${baseUrl}${userPath}`
        userResult = await sendWithCount(route.method, userUrl, primaryUser.headers, routeBody)
        scanResponseForSensitive(route, primaryUser.name, userResult)
      }

      if (anonResult && anonResult.ok && shouldBeProtectedRoute(route)) {
        if (primaryUser && userResult) {
          findings.push(
            makeFinding("MISSING_AUTH", "HIGH", route, {
              anon_status: anonResult.status,
              auth_status: userResult.status,
              url: anonResult.url,
              response_snippet: redactText(responseSnippet(anonResult)),
            }),
          )
        } else {
          findings.push(
            makeFinding("MISSING_AUTH", "HIGH", route, {
              anon_status: anonResult.status,
              url: anonResult.url,
              response_snippet: redactText(responseSnippet(anonResult)),
              basis: "anon_access_to_protected_route",
            }),
          )
        }
      }

      if (adminContext && anonResult && primaryUser && userResult) {
        const isAdminRoute =
          route.path.includes("/admin") || route.path.includes("/stats") || route.method === "DELETE"
        if (isAdminRoute) {
          const adminPath = await resolvePath(route, adminContext)
          const adminUrl = `${baseUrl}${adminPath}`
          const adminResult = await sendWithCount(route.method, adminUrl, adminContext.headers, routeBody)
          scanResponseForSensitive(route, adminContext.name, adminResult)

          if (adminResult.ok && userResult.ok && !anonResult.ok) {
            findings.push(
              makeFinding("PRIV_ESC", "HIGH", route, {
                anon_status: anonResult.status,
                user_status: userResult.status,
                admin_status: adminResult.status,
                user_context: primaryUser.name,
                admin_context: adminContext.name,
                user_is_non_admin: !primaryUser.isAdmin,
                user_url: userUrl,
                admin_url: adminResult.url,
              }),
            )
          }
        }
      }
    }

    if (nonAdminAuthContexts.length >= 2) {
      const [userA, userB] = nonAdminAuthContexts
      let attempts = 0
      for (const route of routes) {
        if (!route.path.includes("{")) continue
        if (attempts >= options.maxIdorAttempts) break

        const listPath = getListPath(route.path)
        if (!listPath) continue

        const listA = await getListIds(userA, listPath)
        const listB = await getListIds(userB, listPath)
        if (!listA || !listB || listB.length === 0) continue

        const idB = pickIdNotInList(listB, listA)
        if (!idB) continue
        const userAHasIdB = listA.includes(idB)
        const userBHasIdB = listB.includes(idB)
        if (!userBHasIdB || userAHasIdB) continue

        const userAPath = substituteFirstParam(route.path, idB)
        const userAUrl = `${baseUrl}${userAPath}`
        const detail = await sendWithCount(route.method, userAUrl, userA.headers, route.json)
        scanResponseForSensitive(route, userA.name, detail)

        if (detail.ok) {
          findings.push(
            makeFinding("IDOR", "CRITICAL", route, {
              user_a: userA.name,
              user_b: userB.name,
              list_path: listPath,
              id_used: "<REDACTED>",
              user_b_list_contains_id: userBHasIdB,
              user_a_list_contains_id: userAHasIdB,
              user_a_list_count: listA.length,
              user_b_list_count: listB.length,
              user_a_status: detail.status,
              url: detail.url,
            }),
          )
        }
        attempts += 1
      }
    }

    const finishedAt = new Date().toISOString()

    const summary = {
      critical: findings.filter((f) => f.severity === "CRITICAL").length,
      high: findings.filter((f) => f.severity === "HIGH").length,
      medium: findings.filter((f) => f.severity === "MEDIUM").length,
      low: findings.filter((f) => f.severity === "LOW").length,
    }

    const report = {
      scan_id: randomUUID(),
      base_url: baseUrl,
      started_at: startedAt,
      finished_at: finishedAt,
      summary,
      findings,
      stats: {
        routes_tested: routes.length,
        requests_made: requestsMade,
        contexts_used: contextsUsed,
      },
    }

    return JSON.stringify(report, null, 2)
  },
})

function normalizeRoutes(inputRoutes: RawRoute[], maxRoutes: number): NormalizedRoute[] {
  const normalized: NormalizedRoute[] = []
  for (const raw of inputRoutes) {
    if (!raw) continue
    const method =
      typeof raw.method === "string"
        ? raw.method
        : typeof raw.httpMethod === "string"
          ? raw.httpMethod
          : typeof raw.verb === "string"
            ? raw.verb
            : undefined
    const path = typeof raw.path === "string" ? raw.path : typeof raw.url === "string" ? raw.url : undefined
    if (!method || !path) continue

    const route: NormalizedRoute = {
      method: method.toUpperCase(),
      path: path.startsWith("/") ? path : `/${path}`,
    }

    if (raw.json !== undefined) {
      route.json = raw.json
    } else if (raw.body !== undefined) {
      route.json = raw.body
    }

    if (typeof raw.schemaName === "string") {
      route.schemaName = raw.schemaName
    }

    normalized.push(route)
    if (normalized.length >= maxRoutes) break
  }
  return normalized
}

async function buildContexts(
  inputs: ContextInput[],
  baseUrl: string,
  timeoutMs: number,
): Promise<NormalizedContext[]> {
  const contexts: NormalizedContext[] = []
  for (const input of inputs) {
    const name = input.name
    const headers: Record<string, string> = { ...(input.headers ?? {}) }
    const roleHint = input.roleHint
    const isAdmin =
      roleHint?.toLowerCase() === "admin" || name.toLowerCase().includes("admin")
    const isAnon = name.toLowerCase() === "anon"

    if (input.token) {
      headers["Authorization"] = `Bearer ${input.token}`
    } else if (input.email && input.password) {
      const token = await loginIfNeeded(baseUrl, input.email, input.password, timeoutMs)
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
    }

    if (isAnon) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "authorization") {
          delete headers[key]
        }
      }
    }

    contexts.push({ name, headers, roleHint, isAdmin, isAnon })
  }

  return contexts
}

async function loginIfNeeded(
  baseUrl: string,
  email: string,
  password: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const url = `${baseUrl}/login`
  const result = await sendRequest({
    method: "POST",
    url,
    headers: { "Content-Type": "application/json" },
    jsonBody: { email, password },
    timeoutMs,
  })
  if (!result.ok || !result.jsonBody || typeof result.jsonBody !== "object") return undefined
  const token = result.jsonBody.access_token
  if (typeof token === "string" && token.length > 0) {
    return token
  }
  return undefined
}

function hasAuthHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization")
}

function pickPrimaryUser(contexts: NormalizedContext[]): NormalizedContext | undefined {
  if (contexts.length === 0) return undefined
  const preferred = contexts.find((ctx) => ctx.name.toLowerCase().includes("user"))
  return preferred ?? contexts[0]
}

function getListPath(path: string): string | null {
  if (!path.includes("{")) return null
  const parts = path.split("/")
  const last = parts[parts.length - 1]
  if (!last || !last.includes("{")) return null
  const listPath = parts.slice(0, -1).join("/")
  return listPath.length === 0 ? "/" : listPath
}

function substituteAllParams(path: string, value: string): string {
  return path.replace(/\{[^}]+\}/gu, value)
}

function substituteFirstParam(path: string, value: string): string {
  let replaced = false
  return path.replace(/\{[^}]+\}/gu, (match) => {
    if (replaced) return "1"
    replaced = true
    return value
  })
}

function extractIdsFromList(jsonBody: any): string[] {
  if (!jsonBody) return []
  let items: any[] | undefined
  if (Array.isArray(jsonBody)) {
    items = jsonBody
  } else if (Array.isArray(jsonBody.items)) {
    items = jsonBody.items
  } else if (Array.isArray(jsonBody.data)) {
    items = jsonBody.data
  } else if (Array.isArray(jsonBody.results)) {
    items = jsonBody.results
  }
  if (!items) return []
  const ids: string[] = []
  for (const item of items) {
    if (item && (typeof item.id === "string" || typeof item.id === "number")) {
      ids.push(String(item.id))
    }
  }
  return ids
}

function pickIdNotInList(listB: string[], listA: string[]): string | undefined {
  if (listA.length === 0) {
    return listB[0]
  }
  for (const id of listB) {
    if (!listA.includes(id)) return id
  }
  return undefined
}

function responseSnippet(res: RequestResult): string {
  if (res.jsonBody !== undefined) {
    try {
      const safe = redactJson(res.jsonBody)
      return JSON.stringify(safe).slice(0, 500)
    } catch {
      return ""
    }
  }
  if (res.textBodyTrunc) return res.textBodyTrunc
  return ""
}

function redactJson(value: any): any {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactJson(item))
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = "<REDACTED>"
      } else if (typeof val === "string" && isSensitiveValue(val)) {
        result[key] = "<REDACTED>"
      } else {
        result[key] = redactJson(val)
      }
    }
    return result
  }
  if (typeof value === "string" && isSensitiveValue(value)) {
    return "<REDACTED>"
  }
  return value
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    lower.includes("password") ||
    lower.includes("passwd") ||
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("api_key") ||
    lower.includes("authorization")
  )
}

function isSensitiveValue(value: string): boolean {
  return value.includes("eyJ") || value.includes("BEGIN PRIVATE KEY")
}

function redactText(text: string): string {
  return text
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gu, "<REDACTED_JWT>")
    .replace(/-----BEGIN PRIVATE KEY[\s\S]*?END PRIVATE KEY-----/gu, "<REDACTED_PRIVATE_KEY>")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gu, "Bearer <REDACTED>")
}

function scanSensitive(jsonBody: any, sensitiveKeys: string[]): { keyPaths: string[]; severity: Severity } {
  const keyPaths: string[] = []
  let severity: Severity = "LOW"

  const keys = new Set(sensitiveKeys.map((key) => key.toLowerCase()))

  const walk = (value: any, path: string) => {
    if (Array.isArray(value)) {
      value.slice(0, 50).forEach((entry, index) => walk(entry, `${path}[${index}]`))
      return
    }
    if (value && typeof value === "object") {
      for (const [key, val] of Object.entries(value)) {
        const currentPath = path ? `${path}.${key}` : key
        const keyLower = key.toLowerCase()
        if (keys.has(keyLower) || isSensitiveKey(key)) {
          keyPaths.push(currentPath)
          if (keyLower.includes("password") || keyLower.includes("passwd")) {
            severity = "CRITICAL"
          } else if (keyLower.includes("private")) {
            severity = "CRITICAL"
          } else if (keyLower.includes("token") || keyLower.includes("api_key") || keyLower.includes("authorization")) {
            if (severity !== "CRITICAL") severity = "HIGH"
          } else if (keyLower.includes("secret")) {
            if (severity !== "CRITICAL") severity = "HIGH"
          }
        }
        walk(val, currentPath)
      }
      return
    }
    if (typeof value === "string") {
      if (value.includes("BEGIN PRIVATE KEY")) {
        keyPaths.push(path)
        severity = "CRITICAL"
      } else if (value.includes("eyJ")) {
        keyPaths.push(path)
        if (severity !== "CRITICAL") severity = "HIGH"
      }
    }
  }

  walk(jsonBody, "")

  return { keyPaths, severity }
}

function makeFinding(
  type: FindingType,
  severity: Severity,
  route: NormalizedRoute,
  evidence: Record<string, unknown>,
): Finding {
  const recommendation = recommendationFor(type)
  return {
    type,
    severity,
    route: { method: route.method, path: route.path },
    evidence,
    recommendation,
  }
}

function recommendationFor(type: FindingType): string {
  switch (type) {
    case "MISSING_AUTH":
      return "Require authentication and enforce authorization checks for this route."
    case "PRIV_ESC":
      return "Restrict admin-only routes to admin contexts and verify role checks server-side."
    case "IDOR":
      return "Enforce object-level authorization and validate ownership on resource access."
    case "SENSITIVE_LEAK":
      return "Remove or redact sensitive fields from responses, and rotate exposed secrets."
    default:
      return "Review access controls and response data handling."
  }
}

async function sendRequest(params: {
  method: string
  url: string
  headers: Record<string, string>
  jsonBody?: any
  timeoutMs: number
}): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs)
  const start = Date.now()

  const headers: Record<string, string> = { ...(params.headers ?? {}) }
  let body: string | undefined
  if (params.jsonBody !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
    body = JSON.stringify(params.jsonBody)
  }

  try {
    const response = await fetch(params.url, {
      method: params.method,
      headers,
      body,
      signal: controller.signal,
    })

    const durationMs = Date.now() - start
    const contentType = response.headers.get("content-type") ?? ""
    let jsonBody: any = undefined
    let textBodyTrunc: string | undefined = undefined

    if (contentType.includes("application/json") || contentType.includes("+json")) {
      try {
        jsonBody = await response.json()
      } catch {
        textBodyTrunc = (await response.text()).slice(0, 500)
      }
    } else {
      const text = await response.text()
      const trimmed = text.slice(0, 500)
      textBodyTrunc = trimmed
      if (trimmed.trim().startsWith("{") || trimmed.trim().startsWith("[")) {
        try {
          jsonBody = JSON.parse(trimmed)
        } catch {
          jsonBody = undefined
        }
      }
    }

    return {
      url: params.url,
      method: params.method,
      status: response.status,
      ok: response.ok,
      durationMs,
      contentType,
      jsonBody,
      textBodyTrunc,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    return {
      url: params.url,
      method: params.method,
      status: 0,
      ok: false,
      durationMs,
      contentType: "",
      error: (error as Error).message,
    }
  } finally {
    clearTimeout(timeout)
  }
}
