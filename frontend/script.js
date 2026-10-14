// Frontend for the Student Expense Tracker (login, per-user data, charts).
const API_BASE = `http://${window.location.hostname}:3000/api`;
const TOKEN_KEY = "et_token";
const USER_KEY = "et_user";
const $ = (id) => document.getElementById(id);
const COLORS = ["#4f46e5", "#16a34a", "#f59e0b", "#dc2626", "#0ea5e9", "#a855f7", "#64748b"];

let charts = {};
let analyticsData = null;

const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const todayKey = () => new Date().toISOString().slice(0, 10); // same day logic as the server (UTC)

// ---------- session ----------
const getToken = () => localStorage.getItem(TOKEN_KEY);
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function savedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch (e) {
    return null;
  }
}

// ---------- API helper ----------
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (getToken()) headers.Authorization = "Bearer " + getToken();
  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (e) {
    throw new Error("Cannot reach the server. Check your internet and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (res.status === 401 && getToken()) {
    logout();
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) throw new Error((data && data.error) || "Request failed (" + res.status + ")");
  return data;
}

// ---------- views ----------
function showAuth() {
  $("app-view").classList.add("hidden");
  $("auth-view").classList.remove("hidden");
}
function showApp() {
  $("auth-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  const u = savedUser();
  $("user-name").textContent = u ? "Hi, " + u.name : "";
  $("exp-date").value = todayKey();
  loadAll();
}
function logout() {
  clearSession();
  Object.values(charts).forEach((c) => c.destroy());
  charts = {};
  showAuth();
}

function setAuthTab(which) {
  const login = which === "login";
  $("tab-login").classList.toggle("active", login);
  $("tab-register").classList.toggle("active", !login);
  $("login-form").classList.toggle("hidden", !login);
  $("register-form").classList.toggle("hidden", login);
  $("auth-error").textContent = "";
}

// ---------- auth actions ----------
async function submitAuth(path, body) {
  $("auth-error").textContent = "";
  try {
    const data = await api(path, { method: "POST", body: JSON.stringify(body) });
    saveSession(data.token, data.user);
    showApp();
  } catch (e) {
    $("auth-error").textContent = e.message;
  }
}

// ---------- data loading ----------
function showError(msg) {
  $("app-error").textContent = msg || "";
}

async function loadAll() {
  showError("");
  try {
    await Promise.all([loadExpenses(), loadSummary(), loadBudget(), loadAnalytics()]);
  } catch (e) {
    showError(e.message);
  }
}

async function loadExpenses() {
  const filter = $("filter").value;
  const sort = $("sort").value;
  let q = "?filter=" + filter + "&sort=" + sort;
  if (filter === "custom") q += "&start=" + $("filter-start").value + "&end=" + $("filter-end").value;
  const list = await api("/expenses" + q);
  renderExpenses(list);
}

function renderExpenses(list) {
  const body = $("expense-body");
  body.innerHTML = "";
  $("empty-text").classList.toggle("hidden", list.length > 0);
  list.forEach((e) => {
    const tr = document.createElement("tr");
    [new Date(e.date).toISOString().slice(0, 10), e.category, e.note || ""].forEach((t) => {
      const td = document.createElement("td");
      td.textContent = t;
      tr.appendChild(td);
    });
    const amount = document.createElement("td");
    amount.className = "num";
    amount.textContent = rupee(e.amount);
    tr.appendChild(amount);
    const act = document.createElement("td");
    const del = document.createElement("button");
    del.className = "del";
    del.title = "Delete";
    del.textContent = "✕";
    del.addEventListener("click", () => deleteExpense(e._id));
    act.appendChild(del);
    tr.appendChild(act);
    body.appendChild(tr);
  });
}

async function loadSummary() {
  const s = await api("/summary?scope=" + $("cat-scope").value);
  $("today-total").textContent = rupee(s.todayTotal);
  $("yesterday-total").textContent = rupee(s.yesterdayTotal);
  $("comparison-text").textContent = s.comparisonText;
  const ul = $("category-list");
  ul.innerHTML = "";
  s.categoryBreakdown.forEach((c) => {
    const li = document.createElement("li");
    const a = document.createElement("span");
    a.textContent = c.category;
    const b = document.createElement("span");
    b.textContent = rupee(c.amount) + " (" + c.percent + "%)";
    li.appendChild(a);
    li.appendChild(b);
    ul.appendChild(li);
  });
  drawChart("category", "chart-category", {
    type: "doughnut",
    data: {
      labels: s.categoryBreakdown.map((c) => c.category),
      datasets: [{ data: s.categoryBreakdown.map((c) => c.amount), backgroundColor: COLORS }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
  });
}

async function loadBudget() {
  const b = await api("/budget-status");
  $("budget-input").value = b.dailyLimit || "";
  renderBudget(b.dailyLimit, b.status);
}

function renderBudget(limit, status) {
  const bar = $("budget-bar");
  bar.className = "bar";
  if (!status) {
    bar.style.width = "0%";
    $("budget-text").textContent = "No limit set.";
    return;
  }
  bar.style.width = Math.min(status.percent, 100) + "%";
  if (status.level !== "ok") bar.classList.add(status.level);
  let msg = rupee(status.spent) + " of " + rupee(limit) + " used today (" + status.percent + "%).";
  if (status.level === "warning") msg += " Careful, you are close to your limit!";
  if (status.level === "over") msg += " You are over your daily limit!";
  $("budget-text").textContent = msg;
}

async function loadAnalytics() {
  analyticsData = await api("/analytics");
  drawDaily();
  drawComparison("today", "chart-cmp-today", "cmp-today-text", analyticsData.today);
  drawComparison("week", "chart-cmp-week", "cmp-week-text", analyticsData.week);
  drawComparison("month", "chart-cmp-month", "cmp-month-text", analyticsData.month);
}

// ---------- charts ----------
function drawChart(key, canvasId, config) {
  if (typeof Chart === "undefined") {
    $("chart-warning").classList.remove("hidden");
    return;
  }
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart($(canvasId), config);
}

function drawDaily() {
  if (!analyticsData) return;
  const rows = $("daily-range").value === "30" ? analyticsData.daily30 : analyticsData.daily7;
  drawChart("daily", "chart-daily", {
    type: "line",
    data: {
      labels: rows.map((r) => r.date.slice(5)),
      datasets: [{ label: "Spent (₹)", data: rows.map((r) => r.total), borderColor: COLORS[0], backgroundColor: "rgba(79,70,229,.15)", fill: true, tension: 0.3 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

function drawComparison(key, canvasId, textId, c) {
  const sign = c.percent > 0 ? "+" : "";
  $(textId).textContent = c.label + ": " + rupee(c.current) + " vs " + rupee(c.previous) + " (" + sign + c.percent + "%)";
  drawChart(key, canvasId, {
    type: "bar",
    data: {
      labels: [c.previousLabel, c.currentLabel],
      datasets: [{ data: [c.previous, c.current], backgroundColor: ["#94a3b8", COLORS[0]] }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

// ---------- user actions ----------
async function addExpense(ev) {
  ev.preventDefault();
  showError("");
  try {
    await api("/expenses", {
      method: "POST",
      body: JSON.stringify({
        amount: Number($("exp-amount").value),
        category: $("exp-category").value,
        date: $("exp-date").value,
        note: $("exp-note").value,
      }),
    });
    $("exp-amount").value = "";
    $("exp-note").value = "";
    await loadAll();
  } catch (e) {
    showError(e.message);
  }
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  try {
    await api("/expenses/" + id, { method: "DELETE" });
    await loadAll();
  } catch (e) {
    showError(e.message);
  }
}

async function saveBudget() {
  showError("");
  try {
    const r = await api("/budget", { method: "POST", body: JSON.stringify({ dailyLimit: Number($("budget-input").value || 0) }) });
    renderBudget(r.dailyLimit, r.status);
  } catch (e) {
    showError(e.message);
  }
}

// ---------- wiring ----------
$("tab-login").addEventListener("click", () => setAuthTab("login"));
$("tab-register").addEventListener("click", () => setAuthTab("register"));
$("login-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitAuth("/auth/login", { email: $("login-email").value, password: $("login-password").value });
});
$("register-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  submitAuth("/auth/register", { name: $("reg-name").value, email: $("reg-email").value, password: $("reg-password").value });
});
$("logout-btn").addEventListener("click", logout);
$("expense-form").addEventListener("submit", addExpense);
$("budget-save").addEventListener("click", saveBudget);
$("filter").addEventListener("change", () => {
  $("custom-range").classList.toggle("hidden", $("filter").value !== "custom");
  loadExpenses().catch((e) => showError(e.message));
});
["sort", "filter-start", "filter-end"].forEach((id) => $(id).addEventListener("change", () => loadExpenses().catch((e) => showError(e.message))));
$("cat-scope").addEventListener("change", () => loadSummary().catch((e) => showError(e.message)));
$("daily-range").addEventListener("change", drawDaily);

if (getToken()) showApp();
else showAuth();
