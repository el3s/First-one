// comments.js
const express = require('express');
const db = require('./db');
const { requireAuth, requireGrade } = require('./auth');

const router = express.Router();

router.post('/:postId', requireAuth, requireGrade, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.postId);
  if (!post || post.is_removed) return res.status(404).json({ error: 'post not found' });

  const info = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.postId, req.userId, content.trim());

  res.json({ commentId: info.lastInsertRowid });
});

router.get('/:postId', requireAuth, (req, res) => {
  const comments = db.prepare(`
    SELECT comments.*, users.username, users.avatar_url
    FROM comments JOIN users ON comments.user_id = users.id
    WHERE comments.post_id = ? AND comments.is_removed = 0
    ORDER BY comments.created_at ASC
  `).all(req.params.postId);

  res.json(comments);
});

router.delete('/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'not found' });
  if (comment.user_id !== req.userId) return res.status(403).json({ error: 'not your comment' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
