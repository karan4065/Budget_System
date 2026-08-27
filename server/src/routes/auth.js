const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');

// POST /api/auth/login - Admin Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const isMatch = bcrypt.compareSync(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const token = jwt.sign(
      { id: admin._id.toString(), email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'super_secret_budget_admin_jwt_key_2026_x89f',
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'Authentication successful',
      token,
      admin: {
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

// GET /api/auth/me - Verify current admin session
router.get('/me', authMiddleware, (req, res) => {
  return res.json({ admin: req.admin });
});

module.exports = router;
