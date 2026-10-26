require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Razorpay = require("razorpay");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false })); // CSP is disabled for this starter's inline client JS.
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new FileStore({ path: path.join(DATA_DIR, "sessions"), retries: 0 }),
  name: "cloudy.sid",
  secret: process.env.SESSION_SECRET || "dev-only-change-this-secret-before-deploying",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in first." });
  const user = readUsers().find(u => u.id === req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ error: "Session expired. Log in again." }); }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

app.get("/api/config", (req, res) => {
  res.json({
    siteName: process.env.SITE_NAME || "Cloudy Playz",
    paymentsConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null
  });
});

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Name must be at least 2 characters." });
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const users = readUsers();
  if (users.some(u => u.email === email)) return res.status(409).json({ error: "An account with this email already exists." });

  const isFirstAdmin = users.length === 0 && process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.toLowerCase();
  const user = {
    id: crypto.randomUUID(),
    name, email,
    passwordHash: await bcrypt.hash(password, 12),
    role: isFirstAdmin ? "admin" : "user",
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);
  req.session.userId = user.id;
  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = readUsers().find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: "Could not log out." });
    res.clearCookie("cloudy.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  const users = readUsers();
  res.json({
    totalUsers: users.length,
    admins: users.filter(u => u.role === "admin").length,
    recentUsers: users.slice(-10).reverse().map(publicUser)
  });
});

// Basic Java Edition status using the public Minecraft Server List ping endpoint.
app.get("/api/server-status", async (_req, res) => {
  const host = process.env.MINECRAFT_SERVER_HOST;
  const port = Number(process.env.MINECRAFT_SERVER_PORT || 25565);
  if (!host || host === "play.example.com") {
    return res.json({ configured: false, online: false, message: "Add your server host in .env." });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(host)}:${port}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Status provider returned an error.");
    const data = await response.json();
    res.json({
      configured: true,
      online: Boolean(data.online),
      host: `${host}:${port}`,
      players: data.players ? { online: data.players.online ?? 0, max: data.players.max ?? 0 } : null,
      version: data.version || null,
      motd: data.motd?.clean?.slice(0, 3).join(" ") || null
    });
  } catch {
    res.json({ configured: true, online: false, host: `${host}:${port}`, message: "Status check timed out or provider unavailable." });
  } finally { clearTimeout(timeout); }
});

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}
app.post("/api/payments/order", requireAuth, paymentLimiter, async (req, res) => {
  const client = razorpayClient();
  if (!client) return res.status(503).json({ error: "Payments are not configured yet. Add Razorpay keys in .env." });
  const amountRupees = Number(req.body.amount);
  if (!Number.isFinite(amountRupees) || amountRupees < 1 || amountRupees > 50000) {
    return res.status(400).json({ error: "Amount must be between ₹1 and ₹50,000." });
  }
  try {
    const order = await client.orders.create({
      amount: Math.round(amountRupees * 100),
      currency: process.env.RAZORPAY_CURRENCY || "INR",
      receipt: `cp_${Date.now()}`
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Razorpay order error:", err.message);
    res.status(502).json({ error: "Could not create payment order. Check Razorpay settings." });
  }
});
app.post("/api/payments/verify", requireAuth, paymentLimiter, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: "Payments are not configured." });
  if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every(v => typeof v === "string" && v.length > 0)) {
    return res.status(400).json({ error: "Missing payment verification fields." });
  }
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(razorpay_signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ verified: false, error: "Payment signature did not match." });
  }
  // IMPORTANT: this confirms the signature only. For real orders/credits, store the order
  // and payment IDs in a database and verify amount, currency, ownership, and webhook status.
  res.json({ verified: true, message: "Signature verified. Add order storage before delivering paid items." });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Cloudy Playz running at http://localhost:${PORT}`);
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes("dev-only")) {
    console.warn("WARNING: Set a strong SESSION_SECRET in .env before production.");
  }
});
