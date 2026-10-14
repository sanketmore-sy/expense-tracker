require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const client = require("prom-client");
const logic = require("./logic");
const analytics = require("./analytics");
const auth = require("./auth");
const validators = require("./validators");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/expensetracker";
const requireAuth = auth.authMiddleware(() => process.env.JWT_SECRET);

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  note: { type: String, default: "" },
});
const Expense = mongoose.model("Expense", expenseSchema);

const settingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  dailyLimit: { type: Number, default: 0 },
});
const Settings = mongoose.model("Settings", settingsSchema);

// ---------- Prometheus metrics (for monitoring) ----------
client.collectDefaultMetrics(); // CPU, memory, event loop, etc.

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

const authEvents = new client.Counter({
  name: "auth_events_total",
  help: "Registration and login events",
  labelNames: ["type"],
});
["register", "login_success", "login_failure"].forEach((t) => authEvents.inc({ type: t }, 0));

new client.Gauge({
  name: "expenses_stored_total",
  help: "Number of expenses currently stored in the database",
  async collect() {
    if (mongoose.connection.readyState === 1) {
      try {
        this.set(await Expense.countDocuments());
      } catch (err) {
        // ignore - gauge keeps its previous value
      }
    }
  },
});

// Measure every request (except /metrics itself) and write one JSON log line per request
app.use((req, res, next) => {
  if (req.path === "/metrics") return next();
  const start = process.hrtime.bigint();
  const stopTimer = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route ? req.baseUrl + req.route.path : "unmatched";
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
    if (process.env.NODE_ENV !== "test") {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(
        JSON.stringify({
          level: res.statusCode >= 500 ? "error" : "info",
          msg: "request",
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms: Math.round(ms),
        })
      );
    }
  });
  next();
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// ---------- Public routes ----------
app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  })
);

// Always fails on purpose - used in the monitoring / alert demo (no login needed)
app.get("/api/demo/error", (req, res) => res.status(500).json({ error: "Simulated failure for the monitoring demo" }));

// ---------- Authentication ----------
function publicUser(u) {
  return { id: String(u._id), name: u.name, email: u.email };
}

app.post("/api/auth/register", async (req, res) => {
  const check = validators.validateRegistration(req.body);
  if (!check.valid) return res.status(400).json({ error: check.errors.join("; ") });
  try {
    const { name, email, password } = check.value;
    if (await User.findOne({ email })) {
      return res.status(409).json({ error: "This email is already registered" });
    }
    const user = await User.create({ name, email, passwordHash: await auth.hashPassword(password) });
    authEvents.inc({ type: "register" });
    const token = auth.signToken(user._id, process.env.JWT_SECRET);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ error: "This email is already registered" });
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const check = validators.validateLogin(req.body);
  if (!check.valid) return res.status(400).json({ error: check.errors.join("; ") });
  try {
    const { email, password } = check.value;
    const user = await User.findOne({ email });
    const ok = user ? await auth.comparePassword(password, user.passwordHash) : false;
    if (!ok) {
      authEvents.inc({ type: "login_failure" });
      return res.status(401).json({ error: "Wrong email or password" });
    }
    authEvents.inc({ type: "login_success" });
    const token = auth.signToken(user._id, process.env.JWT_SECRET);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Account not found" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Expense routes (each user sees only their own data) ----------
// GET /api/expenses?filter=today|yesterday|week|all|custom&start=&end=&sort=date-desc
app.get("/api/expenses", requireAuth, async (req, res) => {
  try {
    const { filter = "all", start, end, sort = "date-desc" } = req.query;
    const all = await Expense.find({ userId: req.userId });
    let filtered = logic.filterExpenses(all, filter, start, end);
    filtered = logic.sortExpenses(filtered, sort);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses  { amount, category, date, note }
app.post("/api/expenses", requireAuth, async (req, res) => {
  const check = validators.validateExpense(req.body);
  if (!check.valid) return res.status(400).json({ error: check.errors.join("; ") });
  try {
    const expense = await Expense.create({ ...check.value, userId: req.userId });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid expense id" });
  try {
    await Expense.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/summary?scope=today|week|all
app.get("/api/summary", requireAuth, async (req, res) => {
  try {
    const { scope = "all" } = req.query;
    const all = await Expense.find({ userId: req.userId });
    const daily = logic.computeDailyTotals(all);
    const categoryBreakdown = logic.computeCategoryBreakdown(all, scope);
    res.json({ ...daily, categoryBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics  -> data for all the charts
app.get("/api/analytics", requireAuth, async (req, res) => {
  try {
    const all = await Expense.find({ userId: req.userId });
    res.json(analytics.buildAnalytics(all));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget
app.get("/api/budget", requireAuth, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.userId });
    if (!settings) settings = await Settings.create({ userId: req.userId, dailyLimit: 0 });
    res.json({ dailyLimit: settings.dailyLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/budget  { dailyLimit }
app.post("/api/budget", requireAuth, async (req, res) => {
  const check = validators.validateBudget(req.body);
  if (!check.valid) return res.status(400).json({ error: check.errors.join("; ") });
  try {
    let settings = await Settings.findOne({ userId: req.userId });
    if (!settings) settings = new Settings({ userId: req.userId });
    settings.dailyLimit = check.value.dailyLimit;
    await settings.save();

    const all = await Expense.find({ userId: req.userId });
    const daily = logic.computeDailyTotals(all);
    const status = logic.computeBudgetStatus(daily.todayTotal, settings.dailyLimit);

    res.json({ dailyLimit: settings.dailyLimit, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget-status
app.get("/api/budget-status", requireAuth, async (req, res) => {
  try {
    const settings = await Settings.findOne({ userId: req.userId });
    const all = await Expense.find({ userId: req.userId });
    const daily = logic.computeDailyTotals(all);
    const status = settings ? logic.computeBudgetStatus(daily.todayTotal, settings.dailyLimit) : null;
    res.json({ dailyLimit: settings ? settings.dailyLimit : 0, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only connect to the database and start listening when run directly (node server.js).
// When the tests require() this file, nothing connects and no port is opened.
if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.error(JSON.stringify({ level: "error", msg: "JWT_SECRET is not set - refusing to start" }));
    process.exit(1);
  }
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err.message));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
