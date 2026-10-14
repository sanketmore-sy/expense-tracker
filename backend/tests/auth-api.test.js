process.env.JWT_SECRET = "api-test-secret";
const request = require("supertest");
const app = require("../server");
const { signToken } = require("../auth");

describe("Auth and protection (no database needed)", () => {
  test("register with bad input gives 400 and a message", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "A", email: "bad", password: "1" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("valid email");
  });

  test("login with missing fields gives 400", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.statusCode).toBe(400);
  });

  test("expenses without a token gives 401", async () => {
    const res = await request(app).get("/api/expenses");
    expect(res.statusCode).toBe(401);
  });

  test("analytics, budget and summary are protected too", async () => {
    for (const path of ["/api/analytics", "/api/budget", "/api/summary", "/api/budget-status", "/api/auth/me"]) {
      const res = await request(app).get(path);
      expect(res.statusCode).toBe(401);
    }
  });

  test("a forged token gives 401", async () => {
    const forged = signToken("someone", "not-the-real-secret");
    const res = await request(app).get("/api/expenses").set("Authorization", `Bearer ${forged}`);
    expect(res.statusCode).toBe(401);
  });

  test("a valid token with a bad expense gives 400 (not 500)", async () => {
    const token = signToken("507f1f77bcf86cd799439011", "api-test-secret");
    const res = await request(app).post("/api/expenses").set("Authorization", `Bearer ${token}`).send({ amount: -5, category: "" });
    expect(res.statusCode).toBe(400);
  });

  test("invalid expense id on delete gives 400", async () => {
    const token = signToken("507f1f77bcf86cd799439011", "api-test-secret");
    const res = await request(app).delete("/api/expenses/not-a-valid-id").set("Authorization", `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
  });

  test("demo error route returns 500 and is counted in metrics", async () => {
    const res = await request(app).get("/api/demo/error");
    expect(res.statusCode).toBe(500);
    const m = await request(app).get("/metrics");
    expect(m.text).toContain('route="/api/demo/error"');
    expect(m.text).toContain("auth_events_total");
  });
});
