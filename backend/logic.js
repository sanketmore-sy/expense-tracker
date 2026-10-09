// Pure business logic (no database, no Express) so it can be unit-tested easily.

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

module.exports = {
  dateKey,
  computeDailyTotals,
  computeCategoryBreakdown,
  filterExpenses,
  sortExpenses,
  computeBudgetStatus,
};
