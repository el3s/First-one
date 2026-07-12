// messages.js
const express = require('express');
const db = require('./db');
const { requireAuth, requireGrade } = require('./auth');

const router = express.Router();

router.post('/', requireAuth, requireGrade, (req, res) => {
  const { receiverId, content } = req.body;
  if (!receiverId || !content || !content.trim()) {
    return res.status(400).json({ error: 'receiverId and content required' });
  }
  if (parseInt(receiverId) === req.userId) {
    return res.status(400).json({ error: "can't message yourself" });
  }

  const receiver = db.prepare('SELECT * FROM users WHERE id = ?').get(receiverId);
  if (!receiver) return res.status(404).json({ error: 'user not found' });

  const blocked = db.prepare(`
    SELECT 1 FROM blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(req.userId, receiverId, receiverId, req.userId);
  if (blocked) return res.status(403).json({ error: 'cannot message this user' });

  const info = db.prepare('INSERT INTO private_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)')
    .run(req.userId, receiverId, content.trim());

  res.json({ messageId: info.lastInsertRowid });
});

router.get('/conversation/:otherUserId', requireAuth, (req, res) => {
  const messages = db.prepare(`
    SELECT * FROM private_messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `).all(req.userId, req.params.otherUserId, req.params.otherUserId, req.userId);

  db.prepare(`UPDATE private_messages SET is_read = 1
              WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`)
    .run(req.params.otherUserId, req.userId);

  res.json(messages);
});

router.get('/inbox', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT pm.*, u.id as other_id, u.username as other_username
    FROM private_messages pm
    JOIN users u ON u.id = CASE WHEN pm.sender_id = ? THEN pm.receiver_id ELSE pm.sender_id END
    WHERE pm.sender_id = ? OR pm.receiver_id = ?
    ORDER BY pm.created_at DESC
  `).all(req.userId, req.userId, req.userId);

  const seen = new Set();
  const inbox = [];
  for (const row of rows) {
    if (!seen.has(row.other_id)) {
      seen.add(row.other_id);
      inbox.push(row);
    }
  }
  res.json(inbox);
});

module.exports = router;
