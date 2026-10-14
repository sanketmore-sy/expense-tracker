const { dateKey } = require("../logic");
const { spendingPerDay, todayVsYesterday, weekVsLastWeek, monthVsLastMonth, percentChange, buildAnalytics } = require("../analytics");

const now = new Date("2026-08-24T12:00:00Z");
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

const expenses = [
  { amount: 200, category: "Food", date: daysAgo(0) },
  { amount: 100, category: "Food", date: daysAgo(1) },
  { amount: 50, category: "Study", date: daysAgo(3) },
  { amount: 400, category: "Food", date: daysAgo(8) }, // previous 7-day window
  { amount: 1000, category: "Rent", date: "2026-07-10T12:00:00Z" }, // last month
];

describe("spendingPerDay", () => {
  test("returns one entry per day, oldest first, zeros included", () => {
    const r = spendingPerDay(expenses, 7, now);
    expect(r).toHaveLength(7);
    expect(r[6].date).toBe(dateKey(now));
    expect(r[6].total).toBe(200);
    expect(r[5].total).toBe(100);
    expect(r[4].total).toBe(0);
    expect(r[3].total).toBe(50);
  });

  test("30 days gives 30 entries", () => {
    expect(spendingPerDay(expenses, 30, now)).toHaveLength(30);
  });
});

describe("comparisons", () => {
  test("today vs yesterday", () => {
    const r = todayVsYesterday(expenses, now);
    expect(r.current).toBe(200);
    expect(r.previous).toBe(100);
    expect(r.diff).toBe(100);
    expect(r.percent).toBe(100);
  });

  test("this week vs last week", () => {
    const r = weekVsLastWeek(expenses, now);
    expect(r.current).toBe(350);
    expect(r.previous).toBe(400);
    expect(r.percent).toBe(-12);
  });

  test("this month vs last month", () => {
    const r = monthVsLastMonth(expenses, now);
    expect(r.current).toBe(750);
    expect(r.previous).toBe(1000);
    expect(r.percent).toBe(-25);
  });

  test("January compares with December of the previous year", () => {
    const jan = new Date("2027-01-15T12:00:00Z");
    const data = [
      { amount: 30, category: "Food", date: "2027-01-10T12:00:00Z" },
      { amount: 90, category: "Food", date: "2026-12-20T12:00:00Z" },
    ];
    const r = monthVsLastMonth(data, jan);
    expect(r.current).toBe(30);
    expect(r.previous).toBe(90);
  });
});

describe("percentChange", () => {
  test("handles zero previous", () => {
    expect(percentChange(50, 0)).toBe(100);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(0, 100)).toBe(-100);
  });
});

describe("buildAnalytics", () => {
  test("returns everything the charts need, also for no data", () => {
    const r = buildAnalytics([], now);
    expect(r.daily7).toHaveLength(7);
    expect(r.daily30).toHaveLength(30);
    expect(r.today.current).toBe(0);
    expect(r.week.percent).toBe(0);
    expect(r.month.previous).toBe(0);
  });
});