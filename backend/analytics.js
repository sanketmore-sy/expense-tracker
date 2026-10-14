// Chart data: spending per day and "this period vs the previous period" comparisons.
// Pure functions (no database). Uses the same dateKey() as logic.js so days always match.
const { dateKey } = require("./logic");

const DAY = 86400000;

function keyDaysAgo(now, i) {
  return dateKey(new Date(now.getTime() - i * DAY));
}

function totalsByKey(expenses) {
  const map = {};
  expenses.forEach((e) => {
    const k = dateKey(e.date);
    map[k] = (map[k] || 0) + e.amount;
  });
  return map;
}

function spendingPerDay(expenses, days = 7, now = new Date()) {
  const map = totalsByKey(expenses);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = keyDaysAgo(now, i);
    out.push({ date: key, total: map[key] || 0 });
  }
  return out;
}

function percentChange(current, previous) {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : 0;
}

function makeComparison(label, currentLabel, previousLabel, current, previous) {
  return {
    label,
    currentLabel,
    previousLabel,
    current,
    previous,
    diff: current - previous,
    percent: percentChange(current, previous),
  };
}

function sumDaysAgo(map, from, to, now) {
  let total = 0;
  for (let i = from; i <= to; i++) total += map[keyDaysAgo(now, i)] || 0;
  return total;
}

function todayVsYesterday(expenses, now = new Date()) {
  const map = totalsByKey(expenses);
  return makeComparison("Today vs yesterday", "Today", "Yesterday", sumDaysAgo(map, 0, 0, now), sumDaysAgo(map, 1, 1, now));
}

// Last 7 days (including today) against the 7 days before that
function weekVsLastWeek(expenses, now = new Date()) {
  const map = totalsByKey(expenses);
  return makeComparison("This week vs last week", "Last 7 days", "Previous 7 days", sumDaysAgo(map, 0, 6, now), sumDaysAgo(map, 7, 13, now));
}

// Calendar month so far against the whole previous calendar month
function monthVsLastMonth(expenses, now = new Date()) {
  const map = totalsByKey(expenses);
  const nowKey = dateKey(now);
  const year = Number(nowKey.slice(0, 4));
  const month = Number(nowKey.slice(5, 7));
  const thisPrefix = nowKey.slice(0, 7);
  const lastPrefix = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  let current = 0;
  let previous = 0;
  Object.keys(map).forEach((k) => {
    if (k.startsWith(thisPrefix)) current += map[k];
    else if (k.startsWith(lastPrefix)) previous += map[k];
  });
  return makeComparison("This month vs last month", "This month", "Last month", current, previous);
}

function buildAnalytics(expenses, now = new Date()) {
  return {
    daily7: spendingPerDay(expenses, 7, now),
    daily30: spendingPerDay(expenses, 30, now),
    today: todayVsYesterday(expenses, now),
    week: weekVsLastWeek(expenses, now),
    month: monthVsLastMonth(expenses, now),
  };
}

module.exports = { spendingPerDay, percentChange, todayVsYesterday, weekVsLastWeek, monthVsLastMonth, buildAnalytics };
