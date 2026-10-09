const {
  computeDailyTotals,
  computeCategoryBreakdown,
  filterExpenses,
  sortExpenses,
  computeBudgetStatus,
} = require("../logic");

// Fixed "now" so the tests give the same result on any day
const now = new Date("2026-08-24T12:00:00Z");
const yesterday = new Date("2026-08-23T12:00:00Z");
const twoDaysAgo = new Date("2026-08-22T12:00:00Z");

const expenses = [
  { amount: 120, category: "Food", date: now.toISOString() },
  { amount: 60, category: "Transport", date: now.toISOString() },
  { amount: 20, category: "Food", date: now.toISOString() },
  { amount: 100, category: "Food", date: yesterday.toISOString() },
  { amount: 50, category: "Study", date: yesterday.toISOString() },
  { amount: 300, category: "Entertainment", date: twoDaysAgo.toISOString() },
];

describe("computeDailyTotals", () => {
  test("adds up today and yesterday correctly", () => {
    const r = computeDailyTotals(expenses, now);
    expect(r.todayTotal).toBe(200);
    expect(r.yesterdayTotal).toBe(150);
    expect(r.diff).toBe(50);
  });

  test("says 'more' with a percentage when today is higher", () => {
    const r = computeDailyTotals(expenses, now);
    expect(r.comparisonText).toContain("33% more");
  });

  test("says 'less' when today is lower", () => {
    const r = computeDailyTotals(expenses.slice(3), now); // nothing today
    expect(r.todayTotal).toBe(0);
    expect(r.comparisonText).toContain("100% less");
  });

  test("handles no data at all", () => {
    const r = computeDailyTotals([], now);
    expect(r.todayTotal).toBe(0);
    expect(r.comparisonText).toBe("No expenses logged today yet.");
  });
});

describe("computeCategoryBreakdown", () => {
  test("today scope: Food is 140 and 70%", () => {
    const r = computeCategoryBreakdown(expenses, "today", now);
    expect(r[0].category).toBe("Food");
    expect(r[0].amount).toBe(140);
    expect(r[0].percent).toBe(70);
  });

  test("all scope: sorted highest first", () => {
    const r = computeCategoryBreakdown(expenses, "all", now);
    expect(r[0].category).toBe("Entertainment");
    expect(r[0].amount).toBe(300);
    expect(r.reduce((s, c) => s + c.amount, 0)).toBe(650);
  });
});

describe("filterExpenses", () => {
  test("today", () => expect(filterExpenses(expenses, "today", null, null, now)).toHaveLength(3));
  test("yesterday", () => expect(filterExpenses(expenses, "yesterday", null, null, now)).toHaveLength(2));
  test("last 7 days", () => expect(filterExpenses(expenses, "week", null, null, now)).toHaveLength(6));
  test("custom range", () =>
    expect(filterExpenses(expenses, "custom", "2026-08-22", "2026-08-22", now)).toHaveLength(1));
  test("all", () => expect(filterExpenses(expenses, "all", null, null, now)).toHaveLength(6));
});

describe("sortExpenses", () => {
  test("amount high to low", () => expect(sortExpenses(expenses, "amount-desc")[0].amount).toBe(300));
  test("amount low to high", () => expect(sortExpenses(expenses, "amount-asc")[0].amount).toBe(20));
  test("does not change the original array", () => {
    const before = expenses.map((e) => e.amount);
    sortExpenses(expenses, "amount-desc");
    expect(expenses.map((e) => e.amount)).toEqual(before);
  });
});

describe("computeBudgetStatus", () => {
  test("80% is a warning", () => expect(computeBudgetStatus(200, 250).level).toBe("warning"));
  test("over the limit", () => expect(computeBudgetStatus(200, 150).level).toBe("over"));
  test("under 80% is ok", () => expect(computeBudgetStatus(200, 500).level).toBe("ok"));
  test("no limit set returns null", () => expect(computeBudgetStatus(200, 0)).toBeNull());
});
