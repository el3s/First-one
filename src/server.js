// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { router: authRouter, requireAuth } = require('./auth');
const postsRouter = require('./posts');
const commentsRouter = require('./comments');
const messagesRouter = require('./messages');
const moderationRouter = require('./moderation');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/auth', authRouter);
app.use('/posts', postsRouter);
app.use('/comments', commentsRouter);
app.use('/messages', messagesRouter);
app.use('/moderation', moderationRouter);

app.get('/me', requireAuth, (req, res) => {
  const { id, username, grade_level, avatar_url, created_at } = req.user;
  res.json({ id, username, grade_level, avatar_url, created_at });
});

app.patch('/me', requireAuth, (req, res) => {
  const { username, avatar_url } = req.body;
  if (username) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.userId);
    if (exists) return res.status(409).json({ error: 'username taken' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.userId);
  }
  if (avatar_url) {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, req.userId);
  }
  res.json({ updated: true });
});

app.post('/me/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
  }
  const valid = await bcrypt.compare(currentPassword || '', req.user.password_hash);
  if (!valid) return res.status(401).json({ error: 'current password incorrect' });

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
  res.json({ message: 'password changed' });
});

app.delete('/me', requireAuth, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM posts WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM private_messages WHERE sender_id = ? OR receiver_id = ?').run(req.userId, req.userId);
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').run(req.userId, req.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);
  });
  tx();
  res.json({ deleted: true });
});

app.get('/me/reports', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(rows);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = app;
