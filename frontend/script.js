/* ============================================================
   Student Daily Expense Tracker — Backend + MongoDB version
   All data now lives on the server, fetched via the API below.
   ============================================================ */

const API_BASE = `http://${window.location.hostname}:3000/api`;

// ---------- API helper functions (replace old localStorage helpers) ----------
async function apiGetExpenses(filter, sort, customStart, customEnd) {
  const params = new URLSearchParams({ filter, sort });
  if (customStart) params.append("start", customStart);
  if (customEnd) params.append("end", customEnd);
  const res = await fetch(`${API_BASE}/expenses?${params}`);
  return res.json();
}

async function apiAddExpense(expense) {
  const res = await fetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expense),
  });
  return res.json();
}

async function apiDeleteExpense(id) {
  const res = await fetch(`${API_BASE}/expenses/${id}`, { method: "DELETE" });
  return res.json();
}

async function apiGetSummary(scope) {
  const res = await fetch(`${API_BASE}/summary?scope=${scope}`);
  return res.json();
}

async function apiGetBudget() {
  const res = await fetch(`${API_BASE}/budget`);
  return res.json();
}

async function apiSetBudget(dailyLimit) {
  const res = await fetch(`${API_BASE}/budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dailyLimit }),
  });
  return res.json();
}

// ---------- DOM wiring ----------
const els = {};
let activeFilter = "today";

document.addEventListener("DOMContentLoaded", () => {
  els.amount = document.getElementById("amount");
  els.category = document.getElementById("category");
  els.date = document.getElementById("date");
  els.note = document.getElementById("note");
  els.quickAddToggle = document.getElementById("quickAddToggle");
  els.noteRow = document.getElementById("noteRow");
  els.dateRow = document.getElementById("dateRow");

  els.todayTotal = document.getElementById("todayTotal");
  els.yesterdayTotal = document.getElementById("yesterdayTotal");
  els.comparisonText = document.getElementById("comparisonText");

  els.breakdownScope = document.getElementById("breakdownScope");
  els.categoryBreakdown = document.getElementById("categoryBreakdown");

  els.budgetInput = document.getElementById("budgetInput");
  els.budgetBar = document.getElementById("budgetBar");
  els.budgetText = document.getElementById("budgetText");
  els.budgetBox = document.getElementById("budgetBox");

  els.filterTabs = document.querySelectorAll(".filter-tab");
  els.customRange = document.getElementById("customRange");
  els.customStart = document.getElementById("customStart");
  els.customEnd = document.getElementById("customEnd");
  els.sortBy = document.getElementById("sortBy");
  els.expenseList = document.getElementById("expenseList");

  els.date.valueAsDate = new Date();

  // Load saved budget limit from the server on page load
  apiGetBudget().then((data) => {
    if (data.dailyLimit) els.budgetInput.value = data.dailyLimit;
  });

  els.quickAddToggle.addEventListener("change", () => {
    const isQuick = els.quickAddToggle.checked;
    els.noteRow.style.display = isQuick ? "none" : "block";
    els.dateRow.style.display = isQuick ? "none" : "block";
    if (isQuick) els.date.valueAsDate = new Date();
  });

  document.getElementById("addBtn").addEventListener("click", addExpense);
  els.breakdownScope.addEventListener("change", renderAll);
  els.budgetInput.addEventListener("change", async () => {
    await apiSetBudget(parseFloat(els.budgetInput.value) || 0);
    renderAll();
  });
  els.sortBy.addEventListener("change", renderAll);
  els.customStart.addEventListener("change", renderAll);
  els.customEnd.addEventListener("change", renderAll);

  els.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.dataset.filter;
      els.customRange.style.display = activeFilter === "custom" ? "flex" : "none";
      renderAll();
    });
  });

  window.deleteExpense = async function (id) {
    await apiDeleteExpense(id);
    renderAll();
  };

  async function addExpense() {
    const amount = parseFloat(els.amount.value);
    const category = els.category.value;
    const isQuick = els.quickAddToggle.checked;
    const date = isQuick ? new Date().toISOString() : (els.date.value ? new Date(els.date.value).toISOString() : new Date().toISOString());
    const note = isQuick ? "" : els.note.value.trim();

    if (!amount || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    await apiAddExpense({ amount, category, date, note });

    els.amount.value = "";
    els.note.value = "";
    els.amount.focus();
    renderAll();
  }

  async function renderAll() {
    // Daily summary + category breakdown come from one endpoint
    const scope = els.breakdownScope.value;
    const summary = await apiGetSummary(scope);

    els.todayTotal.textContent = `₹${summary.todayTotal}`;
    els.yesterdayTotal.textContent = `₹${summary.yesterdayTotal}`;
    els.comparisonText.textContent = summary.comparisonText;
    els.comparisonText.className = "comparison " + (summary.diff > 0 ? "up" : summary.diff < 0 ? "down" : "same");

    // Category breakdown
    els.categoryBreakdown.innerHTML = "";
    if (summary.categoryBreakdown.length === 0) {
      els.categoryBreakdown.innerHTML = "<p class='muted'>No data for this period.</p>";
    } else {
      summary.categoryBreakdown.forEach((c) => {
        const row = document.createElement("div");
        row.className = "cat-row";
        row.innerHTML = `
          <span class="cat-name">${c.category}</span>
          <span class="cat-bar-bg"><span class="cat-bar" style="width:${c.percent}%"></span></span>
          <span class="cat-amount">₹${c.amount} (${c.percent}%)</span>
        `;
        els.categoryBreakdown.appendChild(row);
      });
    }

    // Budget
    const budgetData = await apiGetBudget();
    if (budgetData.dailyLimit > 0) {
      const percent = Math.min(Math.round((summary.todayTotal / budgetData.dailyLimit) * 100), 999);
      const level = percent >= 100 ? "over" : percent >= 80 ? "warning" : "ok";
      els.budgetBox.style.display = "block";
      els.budgetBar.style.width = Math.min(percent, 100) + "%";
      els.budgetBar.className = "budget-bar-fill " + level;
      els.budgetText.textContent = `₹${summary.todayTotal} of ₹${budgetData.dailyLimit} (${percent}%)` +
        (level === "over" ? " — Over budget!" : level === "warning" ? " — Approaching limit" : "");
    } else {
      els.budgetBox.style.display = "none";
    }

    // Expense list
    const filtered = await apiGetExpenses(activeFilter, els.sortBy.value, els.customStart.value, els.customEnd.value);
    els.expenseList.innerHTML = "";
    if (filtered.length === 0) {
      els.expenseList.innerHTML = "<p class='muted'>No expenses in this range.</p>";
    } else {
      filtered.forEach((e) => {
        const row = document.createElement("div");
        row.className = "expense-row";
        const dateStr = new Date(e.date).toLocaleDateString("en-GB");
        row.innerHTML = `
          <span class="exp-left">
            <span class="exp-date">${dateStr}</span>
            <span class="exp-cat">${e.category}</span>
            ${e.note ? `<span class="exp-note">${e.note}</span>` : ""}
          </span>
          <span class="exp-right">₹${e.amount} <span class="del" data-id="${e._id}">✖</span></span>
        `;
        els.expenseList.appendChild(row);
      });
      els.expenseList.querySelectorAll(".del").forEach((btn) => {
        btn.addEventListener("click", () => deleteExpense(btn.dataset.id));
      });
    }
  }

  renderAll();
});