const request = require("supertest");
const app = require("../server");

describe("API (no database needed)", () => {
  test("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("GET /metrics exposes Prometheus metrics", async () => {
    await request(app).get("/api/health"); // make at least one request to count
    const res = await request(app).get("/metrics");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("http_requests_total");
    expect(res.text).toContain('route="/api/health"');
    expect(res.text).toContain("process_cpu_user_seconds_total");
  });
});
