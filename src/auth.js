// auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const ALLOWED_GRADES = (process.env.ALLOWED_GRADE_LEVELS || '1_ثانوي,2_ثانوي,3_ثانوي').split(',');

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) return res.status(409).json({ error: 'username already taken' });

  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, hash);

  const token = jwt.sign({ userId: info.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    userId: info.lastInsertRowid,
    needsGradeSelection: true,
    warning: 'ماكاين حتى طريقة لاسترجاع هاد الحساب إلا نسيتي الباسورد. احتفظ بيه فبلاصة آمنة.'
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  if (user.is_banned) return res.status(403).json({ error: 'account suspended' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    userId: user.id,
    grade_level: user.grade_level,
    needsGradeSelection: !user.grade_locked
  });
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    if (!user || user.is_banned) return res.status(403).json({ error: 'account not accessible' });
    req.userId = payload.userId;
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

function requireGrade(req, res, next) {
  if (!req.user.grade_locked) {
    return res.status(403).json({ error: 'must select grade level first' });
  }
  next();
}

router.post('/select-grade', requireAuth, (req, res) => {
  const { grade_level } = req.body;

  if (req.user.grade_locked) {
    return res.status(403).json({ error: 'grade level already set and cannot be changed' });
  }
  if (!ALLOWED_GRADES.includes(grade_level)) {
    return res.status(400).json({ error: `grade_level must be one of: ${ALLOWED_GRADES.join(', ')}` });
  }

  db.prepare('UPDATE users SET grade_level = ?, grade_locked = 1 WHERE id = ?').run(grade_level, req.userId);
  res.json({ grade_level, locked: true });
});

router.post('/admin/fix-grade', requireAuth, (req, res) => {
  return res.status(501).json({ error: 'admin check not implemented yet - see README' });
});

module.exports = { router, requireAuth, requireGrade, ALLOWED_GRADES };
