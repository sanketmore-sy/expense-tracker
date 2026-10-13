require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/expensetracker";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ---------- Schemas ----------
const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  note: { type: String, default: "" },
});
const Expense = mongoose.model("Expense", expenseSchema);

// Single-document collection to store the daily budget limit
const settingsSchema = new mongoose.Schema({
  dailyLimit: { type: Number, default: 0 },
});
const Settings = mongoose.model("Settings", settingsSchema);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- Shared pure logic (same math as the localStorage version) ----------
function dateKey(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function computeDailyTotals(expenses, now = new Date()) {
  const tKey = dateKey(now);
  const yKey = dateKey(new Date(now.getTime() - 86400000));

  const todayTotal = expenses.filter((e) => dateKey(e.date) === tKey).reduce((s, e) => s + e.amount, 0);
  const yesterdayTotal = expenses.filter((e) => dateKey(e.date) === yKey).reduce((s, e) => s + e.amount, 0);

  const diff = todayTotal - yesterdayTotal;
  let comparisonText;
  if (diff > 0) {
    const pct = yesterdayTotal > 0 ? Math.round((diff / yesterdayTotal) * 100) : 100;
    comparisonText = `You spent ₹${diff} (${pct}% more) than yesterday.`;
  } else if (diff < 0) {
    const pct = yesterdayTotal > 0 ? Math.round((Math.abs(diff) / yesterdayTotal) * 100) : 100;
    comparisonText = `You spent ₹${Math.abs(diff)} (${pct}% less) than yesterday.`;
  } else if (todayTotal === 0) {
    comparisonText = "No expenses logged today yet.";
  } else {
    comparisonText = "You spent the same as yesterday.";
  }

  return { todayTotal, yesterdayTotal, diff, comparisonText };
}

function computeCategoryBreakdown(expenses, scope = "all", now = new Date()) {
  let scoped = expenses;
  if (scope === "today") {
    const tKey = dateKey(now);
    scoped = expenses.filter((e) => dateKey(e.date) === tKey);
  } else if (scope === "week") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    scoped = expenses.filter((e) => new Date(e.date) >= cutoff);
  }

  const map = {};
  scoped.forEach((e) => {
    map[e.category] = (map[e.category] || 0) + e.amount;
  });
  const total = Object.values(map).reduce((s, v) => s + v, 0);

  return Object.entries(map)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function filterExpenses(expenses, filterType, customStart, customEnd, now = new Date()) {
  if (filterType === "today") {
    const tKey = dateKey(now);
    return expenses.filter((e) => dateKey(e.date) === tKey);
  }
  if (filterType === "yesterday") {
    const yKey = dateKey(new Date(now.getTime() - 86400000));
    return expenses.filter((e) => dateKey(e.date) === yKey);
  }
  if (filterType === "week") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    return expenses.filter((e) => new Date(e.date) >= cutoff);
  }
  if (filterType === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }
  return expenses; // "all"
}

function sortExpenses(expenses, sortBy) {
  const copy = [...expenses];
  if (sortBy === "amount-desc") return copy.sort((a, b) => b.amount - a.amount);
  if (sortBy === "amount-asc") return copy.sort((a, b) => a.amount - b.amount);
  if (sortBy === "date-asc") return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
  return copy.sort((a, b) => new Date(b.date) - new Date(a.date)); // date-desc, default
}

function computeBudgetStatus(todayTotal, dailyLimit) {
  if (!dailyLimit || dailyLimit <= 0) return null;
  const percent = Math.min(Math.round((todayTotal / dailyLimit) * 100), 999);
  const level = percent >= 100 ? "over" : percent >= 80 ? "warning" : "ok";
  return { percent, level, limit: dailyLimit, spent: todayTotal };
}

// ---------- Routes ----------

// GET /api/expenses?filter=today|yesterday|week|all|custom&start=&end=&sort=date-desc
app.get("/api/expenses", async (req, res) => {
  try {
    const { filter = "all", start, end, sort = "date-desc" } = req.query;
    const all = await Expense.find();
    let filtered = filterExpenses(all, filter, start, end);
    filtered = sortExpenses(filtered, sort);
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

// GET /api/summary?scope=today|week|all  -> daily totals + category breakdown
app.get("/api/summary", async (req, res) => {
  try {
    const { scope = "all" } = req.query;
    const all = await Expense.find();
    const daily = computeDailyTotals(all);
    const categoryBreakdown = computeCategoryBreakdown(all, scope);
    res.json({ ...daily, categoryBreakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget -> { dailyLimit }
app.get("/api/budget", async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({ dailyLimit: 0 });
    res.json({ dailyLimit: settings.dailyLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/budget  { dailyLimit }  -> also returns current budget STATUS using today's total
app.post("/api/budget", async (req, res) => {
  try {
    const { dailyLimit } = req.body;
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    settings.dailyLimit = dailyLimit;
    await settings.save();

    const all = await Expense.find();
    const daily = computeDailyTotals(all);
    const status = computeBudgetStatus(daily.todayTotal, settings.dailyLimit);

    res.json({ dailyLimit: settings.dailyLimit, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/budget-status -> current status without changing the limit
app.get("/api/budget-status", async (req, res) => {
  try {
    const settings = await Settings.findOne();
    const all = await Expense.find();
    const daily = computeDailyTotals(all);
    const status = settings ? computeBudgetStatus(daily.todayTotal, settings.dailyLimit) : null;
    res.json({ dailyLimit: settings ? settings.dailyLimit : 0, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});