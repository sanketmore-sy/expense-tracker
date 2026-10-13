require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const client = require("prom-client");
const logic = require("./logic");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/expensetracker";

// ---------- Schemas ----------
const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  note: { type: String, default: "" },
});
const Expense = mongoose.model("Expense", expenseSchema);

const settingsSchema = new mongoose.Schema({
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

// ---------- Routes ----------
app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  })
);

// GET /api/expenses?filter=today|yesterday|week|all|custom&start=&end=&sort=date-desc
app.get("/api/expenses", async (req, res) => {
  try {
    const { filter = "all", start, end, sort = "date-desc" } = req.query;
    const all = await Expense.find();
    let filtered = logic.filterExpenses(all, filter, start, end);
    filtered = logic.sortExpenses(filtered, sort);
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses  { amount, category, date, note }
app.post("/api/expenses", async (req, res) => {
  try {
    const { amount, category, date, note } = req.body;
    const expense = new Expense({
      amount,
      category,
      date: date ? new Date(date) : new Date(),
      note: note || "",
    });
    await expense.save();
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
app.delete("/api/expenses/:id", async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/summary?scope=today|week|all
app.get("/api/summary", async (req, res) => {
  try {
    const { scope = "all" } = req.query;
    const all = await Expense.find();
    const daily = logic.computeDailyTotals(all);
    const categoryBreakdown = logic.computeCategoryBreakdown(all, scope);
    res.json({ ...daily, categoryBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget
app.get("/api/budget", async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({ dailyLimit: 0 });
    res.json({ dailyLimit: settings.dailyLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/budget  { dailyLimit }
app.post("/api/budget", async (req, res) => {
  try {
    const { dailyLimit } = req.body;
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    settings.dailyLimit = dailyLimit;
    await settings.save();

    const all = await Expense.find();
    const daily = logic.computeDailyTotals(all);
    const status = logic.computeBudgetStatus(daily.todayTotal, settings.dailyLimit);

    res.json({ dailyLimit: settings.dailyLimit, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget-status
app.get("/api/budget-status", async (req, res) => {
  try {
    const settings = await Settings.findOne();
    const all = await Expense.find();
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
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err.message));

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
