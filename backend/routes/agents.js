import express from 'express';

const router = express.Router();

// In-memory storage: scanId -> array of updates
const agentUpdates = new Map();

// SSE subscribers: scanId -> Set of response objects
const sseSubscribers = new Map();

function broadcastUpdate(scanId, update) {
  const subs = sseSubscribers.get(scanId);
  if (subs && subs.size > 0) {
    const data = JSON.stringify(update);
    subs.forEach(res => res.write(`data: ${data}\n\n`));
  }
}

/**
 * POST /api/agent_update - Endpoint the agent calls via post_update.ts
 * Body: { message, timestamp, scanId? }
 */
router.post('/agent_update', async (req, res) => {
  try {
    const { message, timestamp, scanId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const update = {
      message,
      timestamp: timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      scanId: scanId || 'unknown'
    };

    // Store under scanId
    const key = scanId || 'unknown';
    if (!agentUpdates.has(key)) agentUpdates.set(key, []);
    agentUpdates.get(key).push(update);

    // Broadcast to SSE listeners
    broadcastUpdate(key, update);

    console.log(`\n========== AGENT UPDATE ==========`);
    console.log(`[${key}] ${message}`);
    console.log(`==================================\n`);

    res.json({ success: true, received: update });
  } catch (error) {
    console.error('agent_update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/:scanId/stream - SSE stream for agent updates
 */
router.get('/:scanId/stream', (req, res) => {
  const { scanId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!sseSubscribers.has(scanId)) sseSubscribers.set(scanId, new Set());
  sseSubscribers.get(scanId).add(res);

  // Send existing updates immediately
  const existing = agentUpdates.get(scanId) || [];
  existing.forEach(u => res.write(`data: ${JSON.stringify(u)}\n\n`));

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 30000);

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
 * GET /api/agents/debug - View all stored agent updates (for debugging)
 */
router.get('/debug', (req, res) => {
  const all = {};
  for (const [key, updates] of agentUpdates.entries()) {
    all[key] = updates;
  }
  res.json({ totalScans: agentUpdates.size, updates: all });
});

/**
 * POST /api/agents/update - Receive agent update
 * Body: { agentId, type, status, data, timestamp }
 */
router.post('/update', async (req, res) => {
  try {
    const { agentId, type, status, data, timestamp } = req.body;

    if (!agentId || !type) {
      return res.status(400).json({
        error: 'Missing required fields: agentId and type are required'
      });
    }

    const update = {
      agentId,
      type,
      status: status || 'pending',
      data: data || {},
      timestamp: timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString()
    };

    // Store update
    if (!agentUpdates.has(agentId)) {
      agentUpdates.set(agentId, []);
    }
    agentUpdates.get(agentId).push(update);

    // Keep only last 100 updates per agent
    const updates = agentUpdates.get(agentId);
    if (updates.length > 100) {
      updates.shift();
    }

    res.json({
      success: true,
      message: 'Agent update received',
      updateId: `${agentId}-${Date.now()}`,
      received: update
    });

  } catch (error) {
    console.error('Agent update error:', error);
    res.status(500).json({
      error: 'Failed to process agent update',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:agentId/updates - Get updates for a specific agent
 */
router.get('/:agentId/updates', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 50, since } = req.query;

    const updates = agentUpdates.get(agentId) || [];
    let filtered = updates;

    if (since) {
      const sinceDate = new Date(since);
      filtered = updates.filter(u => new Date(u.timestamp) > sinceDate);
    }

    const limited = filtered.slice(-parseInt(limit));

    res.json({
      agentId,
      count: limited.length,
      updates: limited
    });

  } catch (error) {
    console.error('Get agent updates error:', error);
    res.status(500).json({
      error: 'Failed to retrieve agent updates',
      message: error.message
    });
  }
});

/**
 * GET /api/agents - List all agents with latest update
 */
router.get('/', async (req, res) => {
  try {
    const agents = [];

    for (const [agentId, updates] of agentUpdates.entries()) {
      const latest = updates[updates.length - 1];
      agents.push({
        agentId,
        latestStatus: latest?.status || 'unknown',
        lastUpdate: latest?.timestamp,
        updateCount: updates.length
      });
    }

    res.json({
      count: agents.length,
      agents
    });

  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      error: 'Failed to list agents',
      message: error.message
    });
  }
});

export default router;
