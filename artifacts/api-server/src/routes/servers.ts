import { Router } from "express";
import { db, serversTable, activityTable, gameModesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
    return res.status(502).json({ error: result.message || "Agent not reachable" });
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
    return res.status(502).json({ error: result.message || "Agent not reachable" });
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
    return res.status(502).json({ error: result.message || "Agent not reachable" });
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
  if (!result.success) return res.status(502).json({ error: result.message || "Agent not reachable" });
  return res.json(result);
});

// POST /api/servers/:serverId/plugins/:pluginId/disable
router.post("/servers/:serverId/plugins/:pluginId/disable", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/plugins/${req.params.pluginId}/disable`, "POST");
  await logActivity("plugin_change", `Disabled plugin ${req.params.pluginId}`, s.id, s.name, req.user?.userId, req.user?.username);
  if (!result.success) return res.status(502).json({ error: result.message || "Agent not reachable" });
  return res.json(result);
});

// ─── CSTV / Demos ────────────────────────────────────────────────────────────

// GET /api/servers/:serverId/admins
router.get("/servers/:serverId/admins", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/admins", "GET");
  if (!result.success) return res.status(502).json({ error: result.message || "Agent not reachable" });
  const d = (result.data ?? []) as any;
  return res.json(Array.isArray(d) ? d : d.admins ?? []);
});

// POST /api/servers/:serverId/admins
router.post("/servers/:serverId/admins", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/admins", "POST", req.body);
  await logActivity("rcon_command", `Admin atualizado: ${req.body?.steamId ?? req.body?.steamid ?? "desconhecido"}`, s.id, s.name, req.user?.userId, req.user?.username);
  if (!result.success) return res.status(502).json({ error: result.message || "Agent not reachable" });
  return res.json(result);
});

// DELETE /api/servers/:serverId/admins/:steamId
router.delete("/servers/:serverId/admins/:steamId", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const steamId = encodeURIComponent(req.params.steamId);
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/admins/${steamId}`, "DELETE");
  await logActivity("rcon_command", `Admin removido: ${req.params.steamId}`, s.id, s.name, req.user?.userId, req.user?.username);
  if (!result.success) return res.status(502).json({ error: result.message || "Agent not reachable" });
  return res.json(result);
});

async function streamFromAgent(
  agentUrl: string,
  token: string,
  path: string,
  timeoutMs = 30000
): Promise<Response | null> {
  const url = agentUrl.replace(/\/$/, "") + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// GET /api/servers/:serverId/demos
router.get("/servers/:serverId/demos", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/demos", "GET");
  if (!result.success) return res.json([]);
  const d = result.data as any;
  return res.json(Array.isArray(d) ? d : d.demos ?? []);
});

// POST /api/servers/:serverId/demos/record
router.post("/servers/:serverId/demos/record", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/demos/record", "POST", { name });
  await logActivity("rcon_command", `CSTV: iniciou gravação ${name}`, s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/demos/stop
router.post("/servers/:serverId/demos/stop", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/demos/stop", "POST");
  await logActivity("rcon_command", "CSTV: parou gravação", s.id, s.name, req.user?.userId, req.user?.username);
  return res.json(result);
});

// POST /api/servers/:serverId/demos/pause
router.post("/servers/:serverId/demos/pause", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  return res.json(await forwardToAgent(s.agentUrl, s.agentToken, "/server/demos/pause", "POST"));
});

// POST /api/servers/:serverId/demos/resume
router.post("/servers/:serverId/demos/resume", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  return res.json(await forwardToAgent(s.agentUrl, s.agentToken, "/server/demos/resume", "POST"));
});

// GET /api/servers/:serverId/demos/:name/download
router.get("/servers/:serverId/demos/:name/download", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const name = req.params.name;
  const agentRes = await streamFromAgent(s.agentUrl, s.agentToken, `/server/demos/${encodeURIComponent(name)}`);
  if (!agentRes || !agentRes.ok) return res.status(404).json({ error: "Demo not found on agent" });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${name.endsWith(".dem") ? name : name + ".dem"}"`);
  const ct = agentRes.headers.get("Content-Length");
  if (ct) res.setHeader("Content-Length", ct);
  if (agentRes.body) {
    const reader = agentRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
  } else {
    res.end();
  }
});

// DELETE /api/servers/:serverId/demos/:name
router.delete("/servers/:serverId/demos/:name", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/demos/${encodeURIComponent(req.params.name)}`, "DELETE");
  return res.json(result);
});

// POST /api/servers/:serverId/demos/:name/rename
router.post("/servers/:serverId/demos/:name/rename", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: "newName is required" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, `/server/demos/${encodeURIComponent(req.params.name)}/rename`, "POST", { newName });
  return res.json(result);
});

// GET /api/servers/:serverId/cstv/status
router.get("/servers/:serverId/cstv/status", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/cstv/status", "GET");
  if (!result.success) {
    return res.json({
      tvEnabled: false, tvRecording: false, tvDemoName: null,
      tvDelay: 30, tvAutorecord: false, tvClients: 0,
      recordingDuration: 0, recordingSize: 0, agentReachable: false,
    });
  }
  return res.json({ ...(result.data as object), agentReachable: true });
});

// GET /api/servers/:serverId/cstv/config
router.get("/servers/:serverId/cstv/config", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/cstv/config", "GET");
  if (!result.success) {
    return res.json({
      tvEnable: true, tvDelay: 30, tvAutorecord: true,
      demoFolder: "/home/steam/cs2/game/csgo",
      storageLimit: 10240, autoDeleteOld: false, autoDeleteAfterDays: 30,
    });
  }
  return res.json(result.data);
});

// POST /api/servers/:serverId/cstv/config
router.post("/servers/:serverId/cstv/config", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, id)).limit(1);
  if (!s) return res.status(404).json({ error: "Server not found" });
  const result = await forwardToAgent(s.agentUrl, s.agentToken, "/server/cstv/config", "POST", req.body);
  return res.json(result);
});

// ─── Game Modes ───────────────────────────────────────────────────────────────

function parseMode(m: typeof gameModesTable.$inferSelect) {
  return {
    ...m,
    plugins: JSON.parse(m.plugins ?? "[]"),
    configs: JSON.parse(m.configs ?? "[]"),
    cvars: JSON.parse(m.cvars ?? "{}"),
  };
}

// GET /api/servers/:serverId/modes
router.get("/servers/:serverId/modes", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const modes = await db.select().from(gameModesTable).where(eq(gameModesTable.serverId, id));
  return res.json(modes.map(parseMode));
});

// POST /api/servers/:serverId/modes
router.post("/servers/:serverId/modes", authMiddleware, async (req: any, res: any) => {
  const id = parseInt(req.params.serverId, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { name, displayName, description, gameType, gameMode, plugins, configs, cvars, mapgroup } = req.body;
  if (!name || !displayName) return res.status(400).json({ error: "name and displayName are required" });
  const [mode] = await db.insert(gameModesTable).values({
    serverId: id,
    name,
    displayName,
    description: description ?? null,
    gameType: gameType ?? 0,
    gameMode: gameMode ?? 1,
    plugins: JSON.stringify(Array.isArray(plugins) ? plugins : []),
    configs: JSON.stringify(Array.isArray(configs) ? configs : []),
    cvars: JSON.stringify(typeof cvars === "object" && cvars !== null && !Array.isArray(cvars) ? cvars : {}),
    mapgroup: mapgroup ?? "mg_active",
  }).returning();
  return res.status(201).json(parseMode(mode));
});

// DELETE /api/servers/:serverId/modes/:modeId
router.delete("/servers/:serverId/modes/:modeId", authMiddleware, async (req: any, res: any) => {
  const modeId = parseInt(req.params.modeId, 10);
  if (isNaN(modeId)) return res.status(400).json({ error: "Invalid modeId" });
  await db.delete(gameModesTable).where(eq(gameModesTable.id, modeId));
  return res.json({ success: true });
});

// POST /api/servers/:serverId/modes/:modeId/activate
router.post("/servers/:serverId/modes/:modeId/activate", authMiddleware, async (req: any, res: any) => {
  const serverId = parseInt(req.params.serverId, 10);
  const modeId   = parseInt(req.params.modeId, 10);
  if (isNaN(serverId) || isNaN(modeId)) return res.status(400).json({ error: "Invalid id" });

  const [server] = await db.select().from(serversTable).where(eq(serversTable.id, serverId)).limit(1);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const [mode] = await db.select().from(gameModesTable).where(
    and(eq(gameModesTable.id, modeId), eq(gameModesTable.serverId, serverId))
  ).limit(1);
  if (!mode) return res.status(404).json({ error: "Mode not found" });

  // Deactivate all modes for this server, then activate chosen one
  await db.update(gameModesTable).set({ isActive: false }).where(eq(gameModesTable.serverId, serverId));
  await db.update(gameModesTable).set({ isActive: true }).where(eq(gameModesTable.id, modeId));

  // Forward to agent
  const modePayload = {
    name:      mode.name,
    gameType:  mode.gameType,
    gameMode:  mode.gameMode,
    plugins:   JSON.parse(mode.plugins ?? "[]"),
    configs:   JSON.parse(mode.configs ?? "[]"),
    cvars:     JSON.parse(mode.cvars   ?? "{}"),
    mapgroup:  mode.mapgroup,
    restart:   true,
  };

  const agentResult = await forwardToAgent(server.agentUrl, server.agentToken, "/server/mode", "POST", modePayload);

  await logActivity(
    "plugin_change",
    `Modo alterado para ${mode.displayName}`,
    server.id, server.name,
    req.user?.userId, req.user?.username,
  );

  return res.json({ success: true, mode: parseMode(mode), agentResult });
});

export default router;
