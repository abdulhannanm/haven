import express from 'express';
import cors from 'cors';
import userRoutes from './routes/users.js';
import scanRoutes from './routes/scan.js';
import agentRoutes from './routes/agents.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Express Backend!' });
});

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Use routes
app.use('/api/users', userRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/agents', agentRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
