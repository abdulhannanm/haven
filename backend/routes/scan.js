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
      bash -lc "cd /repo/load_agent/.opencode && npm install --omit=dev && cd /repo && opencode run --format json 'You are the resilience/load agent. On startup call post_update once with a short startup message. Next call the find_routes tool on http://app:8000 and then call post_update once summarizing how many routes you found. Then choose 1 critical POST route and call the scale_test tool on it then call post_update once with the result summary.'"
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
