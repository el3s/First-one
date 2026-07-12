// posts.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { requireAuth, requireGrade } = require('./auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

router.post('/', requireAuth, requireGrade, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image required' });

  const imageUrl = `/uploads/${req.file.filename}`;
  const info = db.prepare(`INSERT INTO posts (user_id, grade_level, image_url, caption)
                            VALUES (?, ?, ?, ?)`)
    .run(req.userId, req.user.grade_level, imageUrl, req.body.caption || '');

  res.json({ postId: info.lastInsertRowid, image_url: imageUrl });
});

router.get('/feed', requireAuth, requireGrade, (req, res) => {
  const blockedIds = db.prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ?')
    .all(req.userId).map(r => r.blocked_id);
  const blockedByIds = db.prepare('SELECT blocker_id FROM blocks WHERE blocked_id = ?')
    .all(req.userId).map(r => r.blocker_id);
  const excluded = [...blockedIds, ...blockedByIds, 0];

  const placeholders = excluded.map(() => '?').join(',');
  const posts = db.prepare(`
    SELECT posts.*, users.username, users.avatar_url
    FROM posts JOIN users ON posts.user_id = users.id
    WHERE posts.grade_level = ? AND posts.is_removed = 0 AND posts.user_id NOT IN (${placeholders})
    ORDER BY posts.created_at DESC
    LIMIT 50
  `).all(req.user.grade_level, ...excluded);

  res.json(posts);
});

router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'not your post' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
