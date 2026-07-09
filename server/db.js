const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'horizon.db');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

let ready = false;
let db;

function save() {
  const data = db.d.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

class Stmt {
  constructor(sqlDb, sql) {
    this.db = sqlDb;
    this.sql = sql;
    this.s = null;
  }
  _bind(params) {
    if (this.s) { this.s.free(); this.s = null; }
    this.s = this.db.prepare(this.sql);
    if (params && params.length > 0) this.s.bind(params);
    return this;
  }
  run(...params) { this._bind(params); this.s.step(); this.s.free(); this.s = null; save(); }
  get(...params) {
    this._bind(params);
    if (!this.s.step()) { this.s.free(); this.s = null; return undefined; }
    const r = this.s.getAsObject(); this.s.free(); this.s = null; return r;
  }
  all(...params) {
    this._bind(params);
    const r = [];
    while (this.s.step()) r.push(this.s.getAsObject());
    this.s.free(); this.s = null; return r;
  }
}

class DB {
  constructor(sqlDb) { this.d = sqlDb; }
  prepare(sql) { return new Stmt(this.d, sql); }
  exec(sql) { this.d.exec(sql); save(); }
}

async function init() {
  if (ready) return db;
  const SQL = await initSqlJs();
  let d;
  try { d = new SQL.Database(fs.readFileSync(dbPath)); }
  catch { d = new SQL.Database(); }
  db = new DB(d);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
      logo TEXT, description TEXT, createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
      parentId TEXT, image TEXT, description TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      price REAL NOT NULL, comparePrice REAL, category TEXT NOT NULL,
      categoryId TEXT, brandId TEXT, image TEXT,
      images TEXT DEFAULT '[]', video TEXT,
      features TEXT DEFAULT '[]', specifications TEXT DEFAULT '{}',
      stock INTEGER DEFAULT 0, lowStockAlert INTEGER DEFAULT 5,
      featured INTEGER DEFAULT 0, published INTEGER DEFAULT 1,
      sku TEXT, weight REAL, views INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY, productId TEXT NOT NULL,
      url TEXT NOT NULL, alt TEXT, sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, userId TEXT, orderNumber TEXT UNIQUE,
      customerName TEXT NOT NULL, customerEmail TEXT NOT NULL,
      customerAddress TEXT NOT NULL, customerCity TEXT NOT NULL,
      customerZip TEXT NOT NULL, customerPhone TEXT,
      items TEXT NOT NULL, total REAL NOT NULL, subtotal REAL DEFAULT 0,
      shippingMethod TEXT DEFAULT 'standard', shippingCost REAL DEFAULT 0,
      couponCode TEXT, discount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending', paymentMethod TEXT,
      paymentStatus TEXT DEFAULT 'unpaid',
      notes TEXT, trackingNumber TEXT, invoiceUrl TEXT,
      paidAt TEXT, shippedAt TEXT, deliveredAt TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, phone TEXT, avatar TEXT,
      addresses TEXT DEFAULT '[]',
      role TEXT DEFAULT 'customer', isSuspended INTEGER DEFAULT 0,
      emailVerified INTEGER DEFAULT 0, verificationToken TEXT,
      resetToken TEXT, resetExpires TEXT,
      walletBalance REAL DEFAULT 0, loyaltyPoints INTEGER DEFAULT 0,
      referredBy TEXT, referralCode TEXT UNIQUE,
      kycStatus TEXT DEFAULT 'unverified', kycDocument TEXT,
      lastLogin TEXT, createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, productId TEXT NOT NULL, userId TEXT,
      userName TEXT NOT NULL, rating INTEGER NOT NULL, title TEXT,
      text TEXT NOT NULL, approved INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL, productId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, productId)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
      discount REAL NOT NULL, type TEXT DEFAULT 'percentage',
      minOrder REAL DEFAULT 0, usageLimit INTEGER DEFAULT 0,
      usedCount INTEGER DEFAULT 0, expiresAt TEXT,
      active INTEGER DEFAULT 1, createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      subject TEXT, message TEXT NOT NULL, read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1, instructions TEXT,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS page_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, userId TEXT, title TEXT,
      message TEXT NOT NULL, type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_notifications (
      id TEXT PRIMARY KEY, message TEXT NOT NULL,
      type TEXT DEFAULT 'info', active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_addresses (
      id TEXT PRIMARY KEY, currency TEXT NOT NULL,
      address TEXT NOT NULL, network TEXT,
      active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gift_cards (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL, balance REAL NOT NULL,
      senderName TEXT, recipientEmail TEXT, message TEXT,
      expiresAt TEXT, active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      points INTEGER NOT NULL, type TEXT NOT NULL,
      description TEXT, createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY, referrerId TEXT NOT NULL,
      referredId TEXT NOT NULL, rewardGiven INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL, excerpt TEXT, image TEXT,
      author TEXT, tags TEXT DEFAULT '[]',
      published INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS translations (
      key TEXT NOT NULL, locale TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (key, locale)
    );

    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY, name TEXT NOT NULL,
      symbol TEXT NOT NULL, rate REAL DEFAULT 1,
      isDefault INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS order_tracking (
      id TEXT PRIMARY KEY, orderId TEXT NOT NULL,
      status TEXT NOT NULL, note TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, orderId TEXT NOT NULL,
      number TEXT UNIQUE NOT NULL, url TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      amount REAL NOT NULL,       paymentMethod TEXT DEFAULT 'crypto',
      status TEXT DEFAULT 'pending', notes TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );


    CREATE TABLE IF NOT EXISTS gift_card_submissions (
      id TEXT PRIMARY KEY, userId TEXT, orderId TEXT,
      cardType TEXT NOT NULL, code TEXT, imageData TEXT,
      method TEXT NOT NULL DEFAULT 'code',
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY, userId TEXT, userName TEXT,
      action TEXT NOT NULL, details TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crypto_payments (
      id TEXT PRIMARY KEY, orderId TEXT, userId TEXT,
      currency TEXT NOT NULL, amount REAL NOT NULL,
      walletAddress TEXT, txHash TEXT,
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id TEXT PRIMARY KEY, userId TEXT, email TEXT,
      items TEXT NOT NULL, subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0, couponCode TEXT,
      shippingMethod TEXT DEFAULT 'standard',
      status TEXT DEFAULT 'active',
      reminderSent INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      label TEXT DEFAULT 'Home',
      fullName TEXT NOT NULL, street TEXT NOT NULL,
      city TEXT NOT NULL, state TEXT, zip TEXT NOT NULL,
      country TEXT DEFAULT 'US', phone TEXT,
      isDefault INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      name TEXT, source TEXT DEFAULT 'checkout',
      subscribed INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS social_logins (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      provider TEXT NOT NULL, providerId TEXT NOT NULL,
      email TEXT, name TEXT, avatar TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id),
      UNIQUE(provider, providerId)
    );

    CREATE TABLE IF NOT EXISTS page_meta (
      id TEXT PRIMARY KEY, page TEXT UNIQUE NOT NULL,
      title TEXT, description TEXT, ogImage TEXT,
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bulk_pricing (
      id TEXT PRIMARY KEY, productId TEXT NOT NULL,
      minQty INTEGER NOT NULL, maxQty INTEGER,
      pricePerUnit REAL NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS recently_viewed (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      productId TEXT NOT NULL, viewedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL,
      endpoint TEXT NOT NULL, p256dh TEXT, auth TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);
  ready = true;
  return db;
}

module.exports = init;
