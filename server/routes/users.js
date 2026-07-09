const express = require('express');
const router = express.Router();
const init = require('../db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => { const ext = path.extname(file.originalname); cb(null, `${uuidv4()}${ext}`); }
});
const upload = multer({ storage });

function hash(pw) {
  return pw;
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    const db = await init();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const id = uuidv4();
    const referralCode = 'HZN' + id.slice(0, 6).toUpperCase();
    db.prepare('INSERT INTO users (id, name, email, password, phone, referralCode) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, email, hash(password), phone || null, referralCode);
    const user = db.prepare('SELECT id, name, email, phone, avatar, role, addresses, walletBalance, loyaltyPoints, referralCode, createdAt FROM users WHERE id = ?').get(id);
    db.prepare('INSERT INTO activity_logs (id, userId, userName, action, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), user.id, name, 'user_registered', 'New account created');
    res.status(201).json({ user, token: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const db = await init();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || user.password !== hash(password)) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.isSuspended) return res.status(403).json({ error: 'Account suspended. Contact support.' });
    db.prepare('UPDATE users SET lastLogin = datetime(\'now\') WHERE id = ?').run(user.id);
    const { password: _, ...safe } = user;
    db.prepare('INSERT INTO activity_logs (id, userId, userName, action, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), user.id, user.name, 'user_login', 'User logged in');
    res.json({ user: safe, token: user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = await init();
    const user = db.prepare('SELECT id, name, email, phone, avatar, role, addresses, isSuspended, emailVerified, kycStatus, walletBalance, loyaltyPoints, referralCode, createdAt FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.addresses && typeof user.addresses === 'string') user.addresses = JSON.parse(user.addresses);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', upload.single('avatar'), async (req, res) => {
  try {
    const db = await init();
    const { name, phone, addresses } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.params.id);
    if (phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, req.params.id);
    if (addresses) db.prepare('UPDATE users SET addresses = ? WHERE id = ?').run(JSON.stringify(addresses), req.params.id);
    if (req.file) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(`/uploads/${req.file.filename}`, req.params.id);
    const user = db.prepare('SELECT id, name, email, phone, avatar, role, addresses, walletBalance, loyaltyPoints, referralCode, createdAt FROM users WHERE id = ?').get(req.params.id);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/orders', async (req, res) => {
  try {
    const db = await init();
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(req.params.id);
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/notifications', async (req, res) => {
  try {
    const db = await init();
    const notifs = db.prepare('SELECT * FROM notifications WHERE userId = ? OR userId IS NULL ORDER BY createdAt DESC LIMIT 20').all(req.params.id);
    res.json(notifs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/notifications/:nid/read', async (req, res) => {
  try { const db = await init(); db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?').run(req.params.nid, req.params.id); res.json({ message: 'Marked read' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/wallet', async (req, res) => {
  try {
    const db = await init();
    const user = db.prepare('SELECT id, walletBalance FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    // Create pending deposit for admin approval
    const depositId = uuidv4();
    const { paymentMethod } = req.body;
    db.prepare('INSERT INTO deposits (id, userId, amount, paymentMethod, status) VALUES (?, ?, ?, ?, ?)').run(depositId, req.params.id, parseFloat(amount), paymentMethod || 'crypto', 'pending');
    db.prepare('INSERT INTO notifications (id, userId, title, message) VALUES (?, ?, ?, ?)').run(uuidv4(), req.params.id, 'Deposit Pending', `Your deposit of $${amount} is pending admin approval.`);
    db.prepare('INSERT INTO activity_logs (id, userId, userName, action, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, '', 'deposit_requested', `Deposit of $${amount} via ${paymentMethod}`);
    res.json({ message: 'Deposit submitted for approval', depositId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Confirm deposit (user confirms they sent payment)
router.put('/:id/deposit/:depositId/confirm', async (req, res) => {
  try {
    const db = await init();
    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ? AND userId = ?').get(req.params.depositId, req.params.id);
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ error: 'Deposit already processed' });
    db.prepare('UPDATE deposits SET status = ? WHERE id = ?').run('confirming', req.params.depositId);
    db.prepare('INSERT INTO activity_logs (id, userId, userName, action, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, '', 'deposit_confirmed', `Deposit of $${deposit.amount} confirmed by user`);
    res.json({ message: 'Deposit confirmed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    const db = await init();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.password !== hash(currentPassword)) return res.status(401).json({ error: 'Current password is incorrect' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash(newPassword), req.params.id);
    res.json({ message: 'Password updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get user's deposits
router.get('/:id/deposits', async (req, res) => {
  try {
    const db = await init();
    const { status } = req.query;
    let deposits;
    if (status) deposits = db.prepare('SELECT * FROM deposits WHERE userId = ? AND status = ? ORDER BY createdAt DESC').all(req.params.id, status);
    else deposits = db.prepare('SELECT * FROM deposits WHERE userId = ? ORDER BY createdAt DESC').all(req.params.id);
    res.json(deposits);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const db = await init();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
    // Always return same message regardless of whether email exists (security best practice)
    if (user) {
      const token = uuidv4();
      const expires = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').split('.')[0];
      db.prepare('UPDATE users SET resetToken = ?, resetExpires = ? WHERE id = ?').run(token, expires, user.id);
      const origin = req.headers.origin || `http://localhost:${process.env.PORT || 5000}`;
      const resetUrl = `${origin}/reset-password/${token}`;
      const sendEmail = require('../email');
      sendEmail({ to: email, subject: 'Reset your Horizon password', text: `Hi ${user.name},\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.` }).catch(() => {});
      console.log(`[Password Reset] Token generated for ${email}: ${resetUrl}`);
    }
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    const db = await init();
    const user = db.prepare('SELECT * FROM users WHERE resetToken = ? AND resetExpires > datetime(\'now\')').get(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    db.prepare('UPDATE users SET password = ?, resetToken = NULL, resetExpires = NULL WHERE id = ?').run(hash(password), user.id);
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
