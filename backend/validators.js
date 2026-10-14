// Input checks for register, login and expenses (pure functions, easy to unit-test).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v) {
  return typeof v === "string" ? v : "";
}

function validateRegistration(body = {}) {
  const errors = [];
  const name = str(body.name).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  if (name.length < 2 || name.length > 50) errors.push("Name must be 2 to 50 characters");
  if (!EMAIL_RE.test(email)) errors.push("Enter a valid email address");
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (password.length > 72) errors.push("Password must be at most 72 characters");
  return { valid: errors.length === 0, errors, value: { name, email, password } };
}

function validateLogin(body = {}) {
  const errors = [];
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  if (!EMAIL_RE.test(email)) errors.push("Enter a valid email address");
  if (!password) errors.push("Enter your password");
  return { valid: errors.length === 0, errors, value: { email, password } };
}

function validateExpense(body = {}) {
  const errors = [];
  const amount = Number(body.amount);
  const category = str(body.category).trim();
  const note = str(body.note).trim();
  let date = new Date();
  if (body.date) {
    date = new Date(body.date);
    if (Number.isNaN(date.getTime())) errors.push("Date is not valid");
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) errors.push("Amount must be a number greater than 0");
  if (!category || category.length > 30) errors.push("Category is required (max 30 characters)");
  if (note.length > 200) errors.push("Note must be at most 200 characters");
  return { valid: errors.length === 0, errors, value: { amount, category, date, note } };
}

function validateBudget(body = {}) {
  const dailyLimit = Number(body.dailyLimit);
  if (!Number.isFinite(dailyLimit) || dailyLimit < 0 || dailyLimit > 1e9) {
    return { valid: false, errors: ["Daily limit must be 0 or more"], value: null };
  }
  return { valid: true, errors: [], value: { dailyLimit } };
}

module.exports = { validateRegistration, validateLogin, validateExpense, validateBudget };
