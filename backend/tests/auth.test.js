const jwt = require("jsonwebtoken");
const { hashPassword, comparePassword, signToken, verifyToken, authMiddleware } = require("../auth");

const SECRET = "unit-test-secret";

describe("password hashing", () => {
  test("hash is not the plain password and compares correctly", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(hash).not.toBe("MyPassword1");
    expect(await comparePassword("MyPassword1", hash)).toBe(true);
  });

  test("wrong password does not match", async () => {
    const hash = await hashPassword("MyPassword1");
    expect(await comparePassword("WrongPassword", hash)).toBe(false);
  });
});

describe("JWT tokens", () => {
  test("a signed token can be verified and holds the user id", () => {
    const token = signToken("abc123", SECRET);
    expect(verifyToken(token, SECRET).sub).toBe("abc123");
  });

  test("wrong secret is rejected", () => {
    expect(verifyToken(signToken("abc123", SECRET), "other-secret")).toBeNull();
  });

  test("expired token is rejected", () => {
    const expired = jwt.sign({ sub: "abc123" }, SECRET, { expiresIn: -10 });
    expect(verifyToken(expired, SECRET)).toBeNull();
  });

  test("garbage is rejected", () => {
    expect(verifyToken("not.a.token", SECRET)).toBeNull();
  });
});

describe("authMiddleware", () => {
  function run(headers) {
    const req = { headers };
    const res = {
      statusCode: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    const next = jest.fn();
    authMiddleware(() => SECRET)(req, res, next);
    return { req, res, next };
  }

  test("no header gives 401", () => {
    const { res, next } = run({});
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("bad token gives 401", () => {
    const { res, next } = run({ authorization: "Bearer nonsense" });
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("good token calls next and sets userId", () => {
    const { req, next } = run({ authorization: `Bearer ${signToken("u42", SECRET)}` });
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe("u42");
  });
});
