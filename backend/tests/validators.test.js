const { validateRegistration, validateLogin, validateExpense, validateBudget } = require("../validators");

describe("validateRegistration", () => {
  test("accepts good input and lower-cases the email", () => {
    const r = validateRegistration({ name: " Sam ", email: "Sam@Example.COM", password: "password1" });
    expect(r.valid).toBe(true);
    expect(r.value.email).toBe("sam@example.com");
    expect(r.value.name).toBe("Sam");
  });

  test("rejects short password, bad email and short name", () => {
    const r = validateRegistration({ name: "S", email: "nope", password: "123" });
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(3);
  });

  test("handles a missing body", () => {
    expect(validateRegistration(undefined).valid).toBe(false);
  });
});

describe("validateLogin", () => {
  test("needs email and password", () => {
    expect(validateLogin({ email: "a@b.com", password: "x" }).valid).toBe(true);
    expect(validateLogin({ email: "a@b.com", password: "" }).valid).toBe(false);
    expect(validateLogin({}).valid).toBe(false);
  });
});

describe("validateExpense", () => {
  test("accepts a normal expense and turns the amount into a number", () => {
    const r = validateExpense({ amount: "120", category: "Food", date: "2026-08-24", note: "lunch" });
    expect(r.valid).toBe(true);
    expect(r.value.amount).toBe(120);
  });

  test("rejects zero, negative and non-numeric amounts", () => {
    expect(validateExpense({ amount: 0, category: "Food" }).valid).toBe(false);
    expect(validateExpense({ amount: -5, category: "Food" }).valid).toBe(false);
    expect(validateExpense({ amount: "abc", category: "Food" }).valid).toBe(false);
  });

  test("rejects missing category and bad date", () => {
    expect(validateExpense({ amount: 10 }).valid).toBe(false);
    expect(validateExpense({ amount: 10, category: "Food", date: "not-a-date" }).valid).toBe(false);
  });
});

describe("validateBudget", () => {
  test("0 is allowed (no limit), negative is not", () => {
    expect(validateBudget({ dailyLimit: 0 }).valid).toBe(true);
    expect(validateBudget({ dailyLimit: 500 }).value.dailyLimit).toBe(500);
    expect(validateBudget({ dailyLimit: -1 }).valid).toBe(false);
    expect(validateBudget({}).valid).toBe(false);
  });
});
