import express from 'express';
import simpleGit from 'simple-git';
import Docker from 'dockerode';
import axios from 'axios';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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
   * Build and run Docker container with multiple port bindings
   */
  async buildAndRun(repoDir, scanId) {
    const containerName = `scan-${scanId}`;
    const startTime = Date.now();
    
    // Common internal ports to try
    const COMMON_PORTS = [3000, 8080, 80, 5000, 8000, 8008, 9000];
    const hostPorts = await this.getAvailablePorts(COMMON_PORTS.length);
    
    // Check if Dockerfile exists
    const dockerfilePath = path.join(repoDir, 'Dockerfile');
    try {
      await fs.access(dockerfilePath);
      console.log(`[Dockerfile found`);
    } catch {
      throw new Error('No Dockerfile found in repository. Cannot build container.');
    }
    
    try {
      emitProgress(scanId, 'build', 'started', 'STEP 2/5: Build & Run Container');
      
      // Build port bindings
      const portBindings = {};
      const portMap = {};
      COMMON_PORTS.forEach((internal, i) => {
        portBindings[`${internal}/tcp`] = [{ HostPort: hostPorts[i].toString() }];
        portMap[internal] = hostPorts[i];
      });
      
      const imageTag = `scan-image-${scanId}`;
      const stream = await docker.buildImage({
        context: repoDir,
        src: ['Dockerfile', '.']
      }, { t: imageTag });
      
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      emitProgress(scanId, 'run', 'started', 'Dockerfile found');
      const container = await docker.createContainer({
        Image: imageTag,
        name: containerName,
        HostConfig: {
          PortBindings: portBindings,
          AutoRemove: false
        }
      });

      await container.start();
      emitProgress(scanId, 'run', 'completed', `Container started`);
      
      return {
        containerId: container.id,
        containerName,
        portMap,
        imageTag,
        commonPorts: COMMON_PORTS
      };
    } catch (error) {
      throw new Error(`Failed to build/run container: ${error.message}`);
    }
  }

  /**
   * Find available ports
   */
  async getAvailablePorts(count = 1) {
    const net = await import('net');
    const ports = [];
    
    for (let i = 0; i < count; i++) {
      const port = await new Promise((resolve) => {
        const server = net.createServer();
        server.listen(0, () => {
          const p = server.address().port;
          server.close(() => resolve(p));
        });
      });
      ports.push(port);
    }
    return ports;
  }

  /**
   * Wait for container to be reachable - tries multiple ports in parallel
   */
  async waitForContainer(portMap, commonPorts, scanId, maxAttempts = 30, interval = 2000) {
    emitProgress(scanId, 'detect', 'started', '3/5: Wait for Container');
    
    const portPairs = Object.entries(portMap).map(([internal, host]) => ({
      internal: parseInt(internal),
      host,
      url: `http://localhost:${host}`
    }));
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const promises = portPairs.map(async ({ internal, host, url }) => {
        try {
          const response = await axios.get(url, { 
            timeout: 3000,
            validateStatus: () => true 
          });
          if (response.status < 500) {
            return { internal, host, url, status: response.status };
          }
        } catch (error) {}
        return null;
      });
      
      const results = await Promise.all(promises);
      const working = results.find(r => r !== null);
      
      if (working) {
        emitProgress(scanId, 'detect', 'completed', `Container ready`);
        return { 
          reachable: true, 
          url: working.url,
          internalPort: working.internal,
          hostPort: working.host
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Container failed to become reachable on any port within timeout');
  }

  /**
   * Run security agent against container
   */
  async runSecurityAgent(targetUrl, scanId) {
    emitProgress(scanId, 'scan', 'started', '4/5 Security Scan');
    
    const findings = [];
    
    try {
      const response = await axios.get(targetUrl, { 
        timeout: 10000,
        validateStatus: () => true
      });
      
      const headers = response.headers;
      
      if (!headers['x-frame-options']) {
        findings.push({ severity: 'medium', title: 'Missing X-Frame-Options Header' });
      }
      
      if (!headers['content-security-policy']) {
        findings.push({ severity: 'medium', title: 'Missing Content-Security-Policy Header' });
      }
      
      if (!headers['x-content-type-options']) {
        findings.push({ severity: 'low', title: 'Missing X-Content-Type-Options Header' });
      }
      
    } catch (error) {
      findings.push({ severity: 'high', title: 'Failed to Connect to Target' });
    }
    
    emitProgress(scanId, 'scan', 'completed', `Scan complete (${findings.length} findings)`);
    
    return {
      findings,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean up all resources
   */
  async cleanup(scanId, containerInfo) {
    emitProgress(scanId, 'cleanup', 'started', '5/5: Cleanup');
    
    try {
      if (containerInfo?.containerId) {
        const container = docker.getContainer(containerInfo.containerId);
        try { await container.stop(); } catch (e) {}
        await container.remove();
      }
    } catch (error) {}
    
    try {
      if (containerInfo?.imageTag) {
        const image = docker.getImage(containerInfo.imageTag);
        await image.remove();
      }
    } catch (error) {}
    
    try {
      const repoDir = path.join(this.workDir, scanId);
      await fs.rm(repoDir, { recursive: true, force: true });
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
  let containerInfo = null;
  const scanStartTime = Date.now();
  
  console.log(`\n[${scanId}] 🚀 NEW SCAN STARTED`);
  console.log(`[${scanId}] 📍 Repository: ${repoUrl}`);
  console.log(`[${scanId}] ⏱️  Started at: ${new Date().toISOString()}`);
  console.log('');
  
  try {
    // Step 1: Clone repository
    console.log(`[${scanId}] STEP 1/5: Clone Repository`);
    const repoDir = await scanService.cloneRepository(repoUrl, scanId);
    
    // Step 2: Build and run container
    console.log('');
    console.log(`[${scanId}] STEP 2/5: Build & Run Container`);
    containerInfo = await scanService.buildAndRun(repoDir, scanId);
    
    // Step 3: Wait for container to be reachable
    console.log('');
    console.log(`[${scanId}] STEP 3/5: Wait for Container`);
    const { url } = await scanService.waitForContainer(containerInfo.portMap, containerInfo.commonPorts, scanId);
    
    // Step 4: Run security agent
    console.log('');
    console.log(`[${scanId}] STEP 4/5: Security Scan`);
    const scanResults = await scanService.runSecurityAgent(url, scanId);
    
    // Step 5: Cleanup
    console.log('');
    console.log(`[${scanId}] STEP 5/5: Cleanup`);
    const cleanupResult = await scanService.cleanup(scanId, containerInfo);
    
    const totalDuration = ((Date.now() - scanStartTime) / 1000).toFixed(2);
    
    console.log('');
    console.log(`[${scanId}] ✅ SCAN COMPLETE in ${totalDuration}s`);
    console.log(`[${scanId}] 📊 Results: ${scanResults.findings.length} findings`);
    console.log('');
    
    res.json({
      success: true,
      scanId,
      duration: `${totalDuration}s`,
      scanResults,
      cleanup: cleanupResult
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
      await scanService.cleanup(scanId, containerInfo);
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
