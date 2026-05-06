import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, CreateUserBody } from "@workspace/api-zod";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cs2-panel-secret";

function signToken(userId: number, username: string, role: string) {
  return jwt.sign({ userId, username, role }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role: string };
}

export function authMiddleware(req: any, res: any, next: any) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyToken(auth.slice(7));
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function adminMiddleware(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// POST /api/auth/login
router.post("/auth/login", async (req: any, res: any) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { username, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken(user.id, user.username, user.role);
  return res.json({
    user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt.toISOString() },
    token,
  });
});

// POST /api/auth/logout
router.post("/auth/logout", (_req: any, res: any) => {
  return res.json({ success: true, message: "Logged out" });
});

// GET /api/auth/me
router.get("/auth/me", authMiddleware, async (req: any, res: any) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1);
  if (!user) return res.status(401).json({ error: "User not found" });
  return res.json({ id: user.id, username: user.username, role: user.role, createdAt: user.createdAt.toISOString() });
});

// GET /api/auth/users
router.get("/auth/users", authMiddleware, adminMiddleware, async (_req: any, res: any) => {
  const users = await db.select().from(usersTable);
  return res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt.toISOString() })));
});

// POST /api/auth/users
router.post("/auth/users", authMiddleware, adminMiddleware, async (req: any, res: any) => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { username, password, role } = parsed.data;
  const hash = await bcrypt.hash(password, 10);
  const [created] = await db.insert(usersTable).values({ username, passwordHash: hash, role }).returning();
  return res.status(201).json({ id: created.id, username: created.username, role: created.role, createdAt: created.createdAt.toISOString() });
});

// DELETE /api/auth/users/:userId
router.delete("/auth/users/:userId", authMiddleware, adminMiddleware, async (req: any, res: any) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  return res.json({ success: true, message: "User deleted" });
});

export default router;
