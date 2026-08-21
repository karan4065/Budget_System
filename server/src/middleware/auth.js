const jwt = require('jsonwebtoken');
const { getPool } = require('../db');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No valid authentication token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_budget_admin_jwt_key_2026_x89f');
    const db = await getPool();
    const [rows] = await db.query('SELECT id, email, name FROM admins WHERE id = ?', [decoded.id]);
    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({ error: 'Unauthorized: Admin record not found.' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }
}

module.exports = authMiddleware;
