import { Router } from "express";
import { db, usersTable, serversTable, activityTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { authMiddleware } from "./auth";

const router = Router();

// GET /api/dashboard/summary
router.get("/dashboard/summary", authMiddleware, async (_req: any, res: any) => {
  const [users, servers, activity] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(serversTable),
    db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(100),
  ]);

  return res.json({
    totalServers: servers.length,
    onlineServers: 0,
    totalPlayers: 0,
    totalUsers: users.length,
  });
});

// GET /api/dashboard/activity
router.get("/dashboard/activity", authMiddleware, async (_req: any, res: any) => {
  const entries = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(50);

  return res.json(
    entries.map((e) => ({
      id: e.id,
      type: e.type,
      serverId: e.serverId ?? null,
      serverName: e.serverName ?? null,
      userId: e.userId ?? null,
      userName: e.userName ?? null,
      details: e.details,
      createdAt: e.createdAt.toISOString(),
    }))
  );
});

export default router;
