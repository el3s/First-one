// moderation.js
const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

router.post('/report', requireAuth, (req, res) => {
  const { targetType, targetId, reason } = req.body;
  const validTypes = ['post', 'comment', 'message', 'user'];
  if (!validTypes.includes(targetType) || !targetId || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'targetType (post/comment/message/user), targetId, reason required' });
  }

  db.prepare(`INSERT INTO reports (reporter_id, target_type, target_id, reason)
              VALUES (?, ?, ?, ?)`)
    .run(req.userId, targetType, targetId, reason.trim());

  res.json({ message: 'report submitted' });
});

router.post('/block', requireAuth, (req, res) => {
  const { userId } = req.body;
  if (!userId || parseInt(userId) === req.userId) {
    return res.status(400).json({ error: 'valid userId required' });
  }

  try {
    db.prepare('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(req.userId, userId);
  } catch (e) {
    // already blocked - ماشي مشكل
  }
  res.json({ blocked: true });
});

router.delete('/block/:userId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.userId, req.params.userId);
  res.json({ unblocked: true });
});

router.get('/blocks', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT users.id, users.username FROM blocks
    JOIN users ON users.id = blocks.blocked_id
    WHERE blocks.blocker_id = ?
  `).all(req.userId);
  res.json(rows);
});

router.get('/admin/reports', requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at ASC").all();
  res.json(rows);
});

module.exports = router;
