import express from 'express';
import simpleGit from 'simple-git';
import Docker from 'dockerode';
import axios from 'axios';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tar from 'tar';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const router = express.Router();
const docker = new Docker();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSE subscribers: scanId -> Set of response objects
const sseSubscribers = new Map();

/**
 * Emit progress event to all subscribers for a scan
 */
function emitProgress(scanId, step, status, message) {
  const event = { scanId, step, status, message, timestamp: Date.now() };
  const subscribers = sseSubscribers.get(scanId);
  if (subscribers) {
    const data = JSON.stringify(event);
    subscribers.forEach(res => res.write(`data: ${data}\n\n`));
  }
}

/**
 * Service to manage container security scanning workflow
 */
class ScanService {
  constructor() {
    this.workDir = path.join(__dirname, '..', 'temp-scans');
  }

  /**
   * Clone a GitHub repository
   */
  async cloneRepository(repoUrl, scanId) {
    const repoDir = path.join(this.workDir, scanId, 'repo');
    
    try {
      emitProgress(scanId, 'clone', 'started', `1/5: Clone Repository\nRepository: ${repoUrl}`);
      await fs.mkdir(repoDir, { recursive: true });
      const git = simpleGit(repoDir);
      await git.clone(repoUrl, '.', ['--depth', '1']);
      const files = await fs.readdir(repoDir);
      emitProgress(scanId, 'clone', 'completed', `Repository cloned`);
      return repoDir;
    } catch (error) {
      emitProgress(scanId, 'clone', 'error', `Clone failed: ${error.message}`);
      throw new Error(`Failed to clone repository: ${error.message}`);
    }
  }

  /**
   * Generate a docker-compose.yml for this scan
   */
  async generateComposeFile(repoDir, scanId) {
    const agentsDir = path.join(__dirname, '..', '..', 'agents');
    const composeDir = path.join(this.workDir, scanId);
    await fs.mkdir(composeDir, { recursive: true });

    const compose = `version: "3.9"

services:
  app:
    build:
      context: ${repoDir}
    container_name: app-${scanId}
    ports:
      - "3000"
      - "8000"
      - "8080"
      - "5000"
      - "80"
    cpus: "2.0"
    mem_limit: "1.5g"
    mem_reservation: "512m"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8000/ || curl -sf http://localhost:3000/ || curl -sf http://localhost:8080/ || curl -sf http://localhost:5000/ || curl -sf http://localhost:80/ || exit 0"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 15s

  opencode:
    build:
      context: ${agentsDir}
      dockerfile: Dockerfile.opencode
    container_name: agent-${scanId}
    working_dir: /repo
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ${agentsDir}:/repo
    environment:
      ANTHROPIC_API_KEY: "${process.env.ANTHROPIC_API_KEY || ''}"
      OPENAI_API_KEY: "${process.env.OPENAI_API_KEY || ''}"
      TARGET_BASE_URL: "http://app:8000"
      SCAN_ID: "${scanId}"
      OPENCODE_CONFIG_DIR: "/repo/load_agent/.opencode"
    command: >
      bash -lc "cd /repo/load_agent/.opencode && npm install --omit=dev && cd /repo && opencode run --format json 'System Prompt  You are Haven, the security + scalability assessment agent. Your job is to assess API access control, data exposure, AND load performance safely, with minimal requests, and deterministically using ONLY the available OpenCode tools. You must follow the workflow exactly and write a final report file.  Hard Requirements - Do not accept a base URL from the user. Always read TARGET_BASE_URL from the environment. - Do not crawl or fuzz. Only operate on routes returned by find_routes. - Keep request volume minimal and deterministic:   - Never probe guessed IDs; only substitute IDs discovered from list routes via the scanner.   - Never iterate more than once per route/context beyond what the tools already do. - Redact secrets. Never expose full tokens/passwords in outputs. Never print Authorization headers. - post_update is allowed ONLY as specified in the Required Tool-Calling Workflow below.  Required Tool-Calling Workflow (MUST FOLLOW IN ORDER) 0. Initially, give us like 1-2 sentences about the app itself, what do you see. 1. On startup, call post_update once with a short startup message. 2. Read TARGET_BASE_URL from the environment. If missing, call post_update once with an error message explaining the failure and stop. 3. Call the find_routes tool against TARGET_BASE_URL. 4. Call post_update once summarizing how many routes were found(count only).  Context Establishment  After calling find_routes and before running security_boundary_scan, establish the strongest available test contexts with minimal guessing.  Prefer this order: 1. Use provided tokens or email/password credentials. 2. If two non-admin users are required and no such contexts were provided, only create them if find_routes reveals a clear authentication flow with strong evidence:    - a registration route such as POST /register, POST /signup, or similar    - and a login route such as POST /login     - and request body schema hints are sufficient to submit deterministic payloads 3. If registration/login cannot be inferred confidently, do not guess. Continue with the contexts you have and lower confidence in the report.  Target contexts: - anon  - userA  - userB  - admin if available  Use these contexts for boundary comparison in security_boundary_scan. 5. Call security_boundary_scan using ONLY the routes returned by find_routes and the contexts EXACTLY as:    [      {"name":"anon"},      {"name":"userA","email":"alice@example.com","password":"alice-pass"},      {"name":"userB","email":"bob@example.com","password":"bob-pass"},      {"name":"admin","email":"admin@example.com","password":"admin-pass","roleHint":"admin"}    ]    - Do not add or remove contexts; allow the scanner to determine what succeeds. After you have called the security_boundary_scan tool, use the post_update tool to update about the scanner   - Never include raw tokens in outputs; only pass them as tool inputs if needed. 6. From the returned routes, choose ONE routes to load test:    - Prefer POST routes that are very likely safe to repeat and central to the app:      - First choice: POST paths containing login, auth, session, token      - Second choice: POST paths containing create, submit, donation, volunteer, project    - If NO POST routes exist, choose the single most critical GET route (prefer /stats, /users, /donations if present) and explicitly state this fallback in the report.    - Do not guess request bodies when OpenAPI provides enough context.    - Use request-body information from find_routes in this priority order:      1. bodyExample      2. bodySample      3. field-level bodySchema defaults/examples/enums      4. empty JSON object {} for POST, and no body for GET    - Pass the chosen payload explicitly into scale_test as jsonBody when testing POST/PUT/PATCH routes. 7. Call scale_test for ONLY the ONE selected route.    - If scale_test results show 401 Unauthorized or 422 Unprocessable entity, retry scale_test up to 2 additional times with alternate request bodies chosen from the remaining find_routes request-body context in the priority order above.    - If scale_test is marked failed because thresholds or checks failed, but the tested route itself consistently returned HTTP 200 responses, treat the load test as completed for workflow purposes and continue.    - In that case, keep LOAD status as FAILED and summarize the threshold/check failure in the report. 8. Call post_update once summarizing the final scale_test status (OK/DEGRADED/FAILED) and key metrics. 9. After scale_test completes, just output the word SUMMARY once alone, and following that present  summary of your findings. 10. At the end, give us a final score for how resilient the app is from 1 to 100. output it as SCORE X and that will be the Last Message.  Constraints: - Use the custom tools find_routes, scale_test, and post_update. - dont use # in your responses, keep it regular text. - Base URL must come from TARGET_BASE_URL. -call post_update every tool call, specifying which tool was called. -call post_update after the scale_test tool call, very quick summary of the results.  Security Targets (interpretation) - Summarize findings from security_boundary_scan:   - Missing authentication   - IDOR (strong evidence only)   - Privilege escalation   - Sensitive data leakage - SECURITY confidence rules:   - HIGH: anon + userA + userB + admin all returned any non-0 HTTP status   - MED: anon + userA + admin returned any non-0 HTTP status (userB missing)   - LOW: only anon returned non-0 OR only one authenticated context returned non-0   - If confidence is LOW, label top risks as POSSIBLE unless directly evidenced. - In the report, you MUST clearly state which checks actually ran based on available contexts:   - Missing-auth: requires anon + at least one authenticated context   - Priv-esc: requires anon + userA + admin   - IDOR: requires userA + userB AND at least one list route producing IDs   - Sensitive leak: can run on any context that received JSON  Scalability / Load Targets (interpretation) - Report p95/p99 latency, error rate, timeouts/5xx, and whether the system holds up under the chosen profile. - If scale_test returns artifacts/summary, extract only the key metrics (no logs).  Output File Requirements (/repo/load_findings.txt) Write a SHORT report with the EXACT structure below. Do not add extra sections. Do not include raw tool outputs, stack traces, or per-request logs. Use concise bullets only. Max length: 150-200 lines total.  FORMAT (MUST MATCH):  HAVEN REPORT Base URL: <TARGET_BASE_URL> Routes found: <paths or operations count>  SECURITY RUN SUMMARY - Contexts attempted: <anon,userA,userB,admin> - Contexts authenticated (non-0 status): <subset or NONE> - Checks executed: missing-auth=<YES|NO> priv-esc=<YES|NO> idor=<YES|NO> sensitive-leak=<YES|NO> - Requests made (if known): <# or UNKNOWN> - Access matrix (route outcomes counts):   anon_2xx=<#> anon_401_403=<#> anon_other=<#>   userA_2xx=<#> userA_401_403=<#> userA_other=<#>   userB_2xx=<#> userB_401_403=<#> userB_other=<#>   admin_2xx=<#> admin_401_403=<#> admin_other=<#>  SECURITY (security_boundary_scan) - Confidence: <HIGH|MED|LOW> - Findings: CRIT <#> | HIGH <#> | MED <#> | LOW <#> - Top 5 risks (max 5 bullets, max 1 line each):   1) <risk> - <evidence summary>   2) <risk> - <evidence summary>   3) <risk> - <evidence summary>   4) <risk> - <evidence summary>   5) <risk> - <evidence summary> - Top fixes (max 5 bullets, max 1 line each):   - <fix 1>   - <fix 2>   - <fix 3>   - <fix 4>   - <fix 5>  LOAD (scale_test) - Route tested: <METHOD> <PATH> - Status: <OK|DEGRADED|FAILED> - Key metrics (single line):   p95=<ms> p99=<ms> failed=<rate> 5xx=<rate> 429/503=<rate> timeout=<rate> - If 401 occurred: <YES|NO>; Retry attempts used: <0|1|2>; Bodies tried: <{} | {"data":{}} | {"input":{}}> - Top bottleneck hypothesis (max 3 bullets, 1 line each):   - <bottleneck 1>   - <bottleneck 2>   - <bottleneck 3> - Top fixes (max 5 bullets, max 1 line each):   - <fix 1>   - <fix 2>   - <fix 3>   - <fix 4>   - <fix 5>  LIMITATIONS (max 5 bullets) - <limitation 1> - <limitation 2> - <limitation 3> - <limitation 4> - <limitation 5>  Strictness - If a value is unknown, write null or UNKNOWN (do not explain). - Never paste tool output verbatim. - Follow the Required Tool-Calling Workflow exactly, in order, with exactly the specified post_update calls (startup; routes found; scale_test summary). - If any step fails, use post_update to describe what failed and what to do next.'"
    depends_on:
      app:
        condition: service_healthy

networks:
  default:
    name: scan-net-${scanId}
`;

    const composePath = path.join(composeDir, 'docker-compose.yml');
    await fs.writeFile(composePath, compose);
    console.log(`[${scanId}] Generated docker-compose.yml at ${composePath}`);
    console.log(`[${scanId}] ANTHROPIC_API_KEY present: ${!!process.env.ANTHROPIC_API_KEY} (length: ${(process.env.ANTHROPIC_API_KEY || '').length})`);
    return { composePath, composeDir };
  }

  /**
   * Run docker-compose up to orchestrate app + agent
   */
  async runCompose(composeDir, scanId) {
    emitProgress(scanId, 'build', 'started', '2/4: Building & starting containers via docker-compose');

    try {
      // Build images
      emitProgress(scanId, 'build', 'in-progress', 'Building images...');
      const { stdout: buildOut } = await execAsync('docker compose build', {
        cwd: composeDir,
        timeout: 300000
      });
      console.log(`[${scanId}] docker compose build output:\n${buildOut}`);
      emitProgress(scanId, 'build', 'completed', 'Images built');

      // Start services (detached)
      emitProgress(scanId, 'run', 'started', '3/4: Starting containers...');
      const { stdout: upOut } = await execAsync('docker compose up -d', {
        cwd: composeDir,
        timeout: 120000
      });
      console.log(`[${scanId}] docker compose up output:\n${upOut}`);
      emitProgress(scanId, 'run', 'completed', 'Containers started');

      // Wait for app to become healthy (compose healthcheck handles this)
      emitProgress(scanId, 'detect', 'started', 'Waiting for app to be healthy...');
      let healthy = false;
      for (let i = 0; i < 60; i++) {
        try {
          const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' app-${scanId}`);
          if (stdout.trim() === 'healthy') {
            healthy = true;
            break;
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 3000));
      }

      if (healthy) {
        emitProgress(scanId, 'detect', 'completed', 'App container healthy');
      } else {
        emitProgress(scanId, 'detect', 'error', 'App health check timed out (agent may still run)');
      }

      // Agent starts automatically via depends_on: service_healthy
      emitProgress(scanId, 'scan', 'started', '4/4: Agent running...');
      console.log(`[${scanId}] Agent container started via docker-compose`);
      console.log(`[${scanId}] Watch live updates at /api/agents/${scanId}/stream`);
      emitProgress(scanId, 'scan', 'completed', 'Agent running - check live updates');

      return { composeDir };
    } catch (error) {
      console.error(`[${scanId}] docker-compose error:`, error.message);
      if (error.stderr) console.error(`[${scanId}] stderr:`, error.stderr);
      throw new Error(`docker-compose failed: ${error.message}`);
    }
  }

  /**
   * Clean up via docker-compose down
   */
  async cleanup(scanId, composeDir) {
    emitProgress(scanId, 'cleanup', 'started', 'Cleanup');

    // Run docker-compose down to stop and remove all containers + networks
    if (composeDir) {
      try {
        const { stdout } = await execAsync('docker compose down --volumes --remove-orphans', {
          cwd: composeDir,
          timeout: 60000
        });
        console.log(`[${scanId}] docker compose down: ${stdout}`);
      } catch (e) {
        console.error(`[${scanId}] docker compose down error:`, e.message);
      }
    }

    // Clean up temp files
    try {
      const scanDir = path.join(this.workDir, scanId);
      await fs.rm(scanDir, { recursive: true, force: true });
    } catch (error) {}

    emitProgress(scanId, 'cleanup', 'completed', 'Cleanup complete');
  }
}

// Initialize scan service
const scanService = new ScanService();

/**
 * POST /api/scan - Start a new security scan
 */
router.post('/', async (req, res) => {
  const { repoUrl, scanId: providedScanId } = req.body;
  
  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required' });
  }
  
  // Use provided scanId or generate one
  const scanId = providedScanId || `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const scanStartTime = Date.now();
  
  console.log(`\n[${scanId}] 🚀 NEW SCAN STARTED`);
  console.log(`[${scanId}] 📍 Repository: ${repoUrl}`);
  console.log(`[${scanId}] ⏱️  Started at: ${new Date().toISOString()}`);
  console.log('');

  let composeDir = null;

  try {
    // Step 1: Clone repository
    console.log(`[${scanId}] STEP 1/4: Clone Repository`);
    const repoDir = await scanService.cloneRepository(repoUrl, scanId);

    // Step 2: Generate docker-compose.yml
    console.log('');
    console.log(`[${scanId}] STEP 2/4: Generate docker-compose.yml`);
    const composeInfo = await scanService.generateComposeFile(repoDir, scanId);
    composeDir = composeInfo.composeDir;

    // Step 3: Build + run via docker-compose (app + agent)
    console.log('');
    console.log(`[${scanId}] STEP 3/4: docker-compose up`);
    await scanService.runCompose(composeDir, scanId);

    const scanResults = {
      findings: [],
      note: 'Agent is running - check /api/agents/:scanId/stream for live updates',
      timestamp: new Date().toISOString()
    };

    const totalDuration = ((Date.now() - scanStartTime) / 1000).toFixed(2);

    console.log('');
    console.log(`[${scanId}] ✅ SCAN LAUNCHED in ${totalDuration}s`);
    console.log(`[${scanId}] Agent running in background - updates via /api/agents/${scanId}/stream`);
    console.log('');

    res.json({
      success: true,
      scanId,
      duration: `${totalDuration}s`,
      scanResults
    });

  } catch (error) {
    const totalDuration = ((Date.now() - scanStartTime) / 1000).toFixed(2);

    console.error('');
    console.error(`[${scanId}] ❌ SCAN FAILED after ${totalDuration}s`);
    console.error(`[${scanId}] 💥 Error: ${error.message}`);
    console.error('');

    // Attempt cleanup even on failure
    try {
      console.log(`[${scanId}] Attempting cleanup after failure...`);
      await scanService.cleanup(scanId, composeDir);
    } catch (cleanupError) {
      console.error(`[${scanId}] Cleanup after failure also failed:`, cleanupError.message);
    }

    res.status(500).json({
      success: false,
      scanId,
      duration: `${totalDuration}s`,
      error: error.message
    });
  }
});

/**
 * GET /api/scan/:scanId/progress - SSE endpoint for real-time scan progress
 */
router.get('/:scanId/progress', (req, res) => {
  const { scanId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (!sseSubscribers.has(scanId)) {
    sseSubscribers.set(scanId, new Set());
  }
  sseSubscribers.get(scanId).add(res);
  
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(heartbeat);
    const subs = sseSubscribers.get(scanId);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) sseSubscribers.delete(scanId);
    }
  });
});

/**
 * GET /api/scan/health - Check Docker availability
 */
router.get('/health', async (req, res) => {
  try {
    const info = await docker.info();
    res.json({
      status: 'OK',
      docker: {
        available: true,
        version: info.ServerVersion,
        containers: info.Containers,
        images: info.Images
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      docker: {
        available: false,
        error: error.message
      }
    });
  }
});

export default router;
