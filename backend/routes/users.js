import express from 'express';

const router = express.Router();

// GET /api/users - Get all users
router.get('/', (req, res) => {
  res.json([
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ]);
});

// GET /api/users/:id - Get user by ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  res.json({ id: parseInt(id), name: 'John Doe', email: 'john@example.com' });
});

// POST /api/users - Create new user
router.post('/', (req, res) => {
  const { name, email } = req.body;
  const newUser = {
    id: Date.now(),
    name,
    email
  };
  res.status(201).json(newUser);
});

export default router;
