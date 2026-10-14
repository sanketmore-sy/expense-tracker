// Password hashing, JWT tokens and the login-check middleware (no database needed).
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(userId, secret, expiresIn = "7d") {
  return jwt.sign({ sub: String(userId) }, secret, { expiresIn });
}

function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
}

// Express middleware: expects the header  Authorization: Bearer <token>
function authMiddleware(getSecret) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Please log in first" });
    }
    const payload = verifyToken(token, getSecret());
    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.userId = payload.sub;
    next();
  };
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, authMiddleware };
