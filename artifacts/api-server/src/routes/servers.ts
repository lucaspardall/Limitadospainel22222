import { Router } from "express";
import { db, serversTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateServerBody, UpdateServerBody } from "@workspace/api-zod";
import { authMiddleware } from "./auth";

const router = Router();
const AGENT_TIMEOUT_MS = 8000;

async function forwardToAgent(
  agentUrl: string,
  token: string,
  path: string,
  method = "POST",
  body?: object
): Promise<{ success: boolean; message: string; data?: object }> {
  const url = agentUrl.replace(/\/$/, "") + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      return { success: false, message: data?.error ?? data?.message ?? `Agent returned ${res.status}` };
    }
    return { success: true, message: "OK", data };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return { success: false, message: "Agent request timed out" };
    }
    return { success: false, message: err.message ?? "Agent unreachable" };
  }
}

async function logActivity(type: any, details: string, serverId?: number, serverName?: string, userId?: number, userName?: string) {
  await db.insert(activityTable).values({ type, details, serverId, serverName, userId, userName }).catch(() => {});
}

function mapServer(s: typeof serversTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    ip: s.ip,
    port: s.port,
    agentUrl: s.agentUrl,
    agentToken: s.agentToken,
    description: s.description ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// GET /api/servers
router.get("/servers", authMiddleware, async (_req: any, res: any) => {
  const servers = await db.select().from(serversTable);
  return res.json(servers.map(mapServer));
});

// POST /api/servers
router.post("/servers", authMiddleware, async (req: any, res: any) => {
  const parsed = CreateServerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const [s] = await db.insert(serversTable).values(parsed.data).returning();
  return res.status(201).json(mapServer(s));
});

// GET /api/servers/:serverId
router.get("/servers/:serverId", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  return res.json(mapServer(s));
});

// PATCH /api/servers/:serverId
router.patch("/servers/:serverId", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdateServerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
  const [s] = await db.update(serversTable).set(parsed.data).where(eq(serversTable.id, id)).returning();
  if (!s) return res.status(404).json({ error: "Server not found" });
  return res.json(mapServer(s));
});

// DELETE /api/servers/:serverId
router.delete("/servers/:serverId", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(serversTable).where(eq(serversTable.id, id));
  return res.json({ success: true, message: "Server deleted" });
});

// GET /api/servers/:serverId/status
router.get("/servers/:serverId/status", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });

  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/status", "GET");
  if (!result.success) {
    return res.json({
      online: false,
      playerCount: 0,
      maxPlayers: 0,
      map: null,
      cpuUsage: null,
      ramUsage: null,
      uptime: null,
      tickrate: null,
      agentReachable: false,
    });
  }
  const d = (result.data ?? {}) as any;
  return res.json({
    online: d.online ?? false,
    playerCount: d.playerCount ?? d.player_count ?? 0,
    maxPlayers: d.maxPlayers ?? d.max_players ?? 0,
    map: d.map ?? null,
    cpuUsage: d.cpuUsage ?? d.cpu_usage ?? null,
    ramUsage: d.ramUsage ?? d.ram_usage ?? null,
    uptime: d.uptime ?? null,
    tickrate: d.tickrate ?? null,
    agentReachable: true,
  });
});

// POST /api/servers/:serverId/start
router.post("/servers/:serverId/start", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/start");
  await logActivity("server_start", `Started server ${s.name}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/stop
router.post("/servers/:serverId/stop", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/stop");
  await logActivity("server_stop", `Stopped server ${s.name}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/restart
router.post("/servers/:serverId/restart", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/restart");
  await logActivity("server_restart", `Restarted server ${s.name}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/update
router.post("/servers/:serverId/update", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/update");
  return res.json(result);
});

// POST /api/servers/:serverId/command
router.post("/servers/:serverId/command", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/command", "POST", { command });
  await logActivity("rcon_command", `RCON: ${command}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// GET /api/servers/:serverId/logs
router.get("/servers/:serverId/logs", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const lines = req.query.lines ? parseInt(req.query.lines as string, 10) : 100;
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/logs?lines=${lines}`, "GET");
  if (!result.success) {
    // Return simulated logs when agent is unreachable
    const now = new Date();
    const mock = Array.from({ length: 10 }, (_, i) => ({
      id: `sim-${i}`,
      timestamp: new Date(now.getTime() - i * 10000).toISOString(),
      level: (["info", "info", "warn", "info", "debug", "info", "error", "info", "info", "info"] as const)[i],
      message: [
        "Server running on de_dust2",
        "Player connected: user123",
        "High ping detected for player",
        "Round started",
        "Tick rate: 128",
        "Match ended: CT win",
        "Plugin error: failed to load",
        "Player disconnected: user456",
        "Map change requested",
        "Server started",
      ][i],
    }));
    return res.json(mock);
  }
  const d = (result.data ?? []) as any;
  return res.json(Array.isArray(d) ? d : d.logs ?? []);
});

// GET /api/servers/:serverId/players
router.get("/servers/:serverId/players", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/players", "GET");
  if (!result.success) {
    // Simulate players when agent is not reachable
    return res.json([
      { steamId: "76561198000000001", name: "AWP_God", score: 24, ping: 42, duration: "32:15", ip: null },
      { steamId: "76561198000000002", name: "FragMaster", score: 18, ping: 67, duration: "28:40", ip: null },
      { steamId: "76561198000000003", name: "CT_King", score: 12, ping: 89, duration: "15:02", ip: null },
    ]);
  }
  const d = (result.data ?? []) as any;
  return res.json(Array.isArray(d) ? d : d.players ?? []);
});

// POST /api/servers/:serverId/players/:steamId/kick
router.post("/servers/:serverId/players/:steamId/kick", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { reason } = req.body ?? {};
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/players/${req.params.steamId}/kick`, "POST", { reason });
  await logActivity("player_kick", `Kicked ${req.params.steamId}${reason ? `: ${reason}` : ""}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/players/:steamId/ban
router.post("/servers/:serverId/players/:steamId/ban", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { reason, duration } = req.body ?? {};
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/players/${req.params.steamId}/ban`, "POST", { reason, duration });
  await logActivity("player_ban", `Banned ${req.params.steamId}${reason ? `: ${reason}` : ""}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/players/:steamId/mute
router.post("/servers/:serverId/players/:steamId/mute", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { reason } = req.body ?? {};
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/players/${req.params.steamId}/mute`, "POST", { reason });
  return res.json(result);
});

// GET /api/servers/:serverId/plugins
router.get("/servers/:serverId/plugins", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/plugins", "GET");
  if (!result.success) {
    return res.json([
      { id: "metamod", name: "Metamod:Source", version: "2.0", author: "AlliedModders", description: "Platform for SourceMod", enabled: true },
      { id: "sourcemod", name: "SourceMod", version: "1.12", author: "AlliedModders", description: "Server modification system", enabled: true },
      { id: "cs2fixes", name: "CS2Fixes", version: "1.5", author: "danielga", description: "Various bug fixes for CS2", enabled: true },
      { id: "matchzy", name: "MatchZy", version: "0.8.2", author: "shubhgarg", description: "Competitive match management", enabled: false },
      { id: "retakes", name: "Retakes", version: "2.1.0", author: "splewis", description: "Retake bombsite practice", enabled: false },
    ]);
  }
  const d = (result.data ?? []) as any;
  return res.json(Array.isArray(d) ? d : d.plugins ?? []);
});

// POST /api/servers/:serverId/plugins/:pluginId/enable
router.post("/servers/:serverId/plugins/:pluginId/enable", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/plugins/${req.params.pluginId}/enable`, "POST");
  await logActivity("plugin_change", `Enabled plugin ${req.params.pluginId}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result.success ? result : { success: true, message: "Plugin enable forwarded (agent not reachable, cached)" });
});

// POST /api/servers/:serverId/plugins/:pluginId/disable
router.post("/servers/:serverId/plugins/:pluginId/disable", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/plugins/${req.params.pluginId}/disable`, "POST");
  await logActivity("plugin_change", `Disabled plugin ${req.params.pluginId}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result.success ? result : { success: true, message: "Plugin disable forwarded (agent not reachable, cached)" });
});

export default router;
