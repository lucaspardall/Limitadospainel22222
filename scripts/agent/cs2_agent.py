#!/usr/bin/env python3
"""
Limitados CS2 Agent
Rode este script na sua VPS para integrar com o painel Limitados.

Requisitos: Python 3.8+
Instalar dependências:  pip3 install psutil

Uso:
  python3 cs2_agent.py \
    --token SEU_TOKEN_SECRETO \
    --port 7777 \
    --rcon-password SENHA_RCON \
    --cs2-dir /home/steam/cs2
"""

import argparse
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

# ─── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Limitados CS2 Agent")
parser.add_argument("--token",         required=True)
parser.add_argument("--port",          default=7777,       type=int)
parser.add_argument("--rcon-host",     default="127.0.0.1")
parser.add_argument("--rcon-port",     default=27015,      type=int)
parser.add_argument("--rcon-password", default="")
parser.add_argument("--cs2-dir",       default="/home/steam/cs2")
parser.add_argument("--cs2-process",   default="cs2")
args = parser.parse_args()

# Paths
CSGO_DIR      = os.path.join(args.cs2_dir, "game", "csgo")
SM_PLUGINS    = os.path.join(CSGO_DIR, "addons", "sourcemod", "plugins")
SM_DISABLED   = os.path.join(SM_PLUGINS, "disabled")
SM_CONFIGS    = os.path.join(CSGO_DIR, "addons", "sourcemod", "configs")
CFG_DIR       = os.path.join(CSGO_DIR, "cfg")
LOG_FILE      = os.path.join(CSGO_DIR, "logs", "server.log")

# ─── RCON ──────────────────────────────────────────────────────────────────────
class RCONClient:
    def __init__(self, host, port, password, timeout=5):
        self.host, self.port, self.password, self.timeout = host, port, password, timeout

    def _packet(self, req_id, ptype, body):
        body = body.encode("utf-8") + b"\x00\x00"
        size = 4 + 4 + len(body)
        return struct.pack("<III", size, req_id, ptype) + body

    def send(self, command):
        s = socket.create_connection((self.host, self.port), timeout=self.timeout)
        try:
            s.sendall(self._packet(1, 3, self.password))
            s.recv(4096)
            s.sendall(self._packet(2, 2, command))
            data = b""
            s.settimeout(3)
            try:
                while True:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    data += chunk
            except socket.timeout:
                pass
        finally:
            s.close()
        if len(data) >= 12:
            return data[12:].rstrip(b"\x00").decode("utf-8", errors="replace")
        return "OK"

rcon = RCONClient(args.rcon_host, args.rcon_port, args.rcon_password)

# ─── Helpers ───────────────────────────────────────────────────────────────────
def is_running():
    try:
        return subprocess.run(["pgrep", "-x", args.cs2_process], capture_output=True).returncode == 0
    except Exception:
        return False

def get_uptime():
    try:
        pid = subprocess.check_output(["pgrep", "-x", args.cs2_process]).decode().strip()
        secs = int(subprocess.check_output(["ps", "-p", pid, "-o", "etimes="], text=True).strip())
        h, m = divmod(secs // 60, 60)
        return f"{h}h {m}m" if h else f"{m}m"
    except Exception:
        return "N/A"

def get_cpu_ram():
    try:
        import psutil
        for proc in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            if args.cs2_process in (proc.info["name"] or ""):
                cpu = proc.cpu_percent(interval=0.5)
                ram = proc.info["memory_info"].rss // (1024 * 1024)
                return cpu, ram
    except Exception:
        pass
    return 0.0, 0

def read_logs(lines=100):
    entries = []
    try:
        if not os.path.exists(LOG_FILE):
            return entries
        with open(LOG_FILE, "r", errors="replace") as f:
            all_lines = f.readlines()[-lines:]
        for i, line in enumerate(all_lines):
            line = line.rstrip()
            lvl = "error" if "ERROR" in line.upper() or "FATAL" in line.upper() \
                else "warn" if "WARN" in line.upper() \
                else "debug" if "DEBUG" in line.upper() \
                else "info"
            entries.append({"id": i + 1, "timestamp": datetime.utcnow().isoformat() + "Z",
                            "level": lvl, "message": line})
    except Exception as e:
        entries.append({"id": 1, "timestamp": datetime.utcnow().isoformat() + "Z",
                        "level": "error", "message": str(e)})
    return entries

def parse_players(rcon_output):
    players = []
    for line in rcon_output.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[0].isdigit():
            players.append({
                "steamId": parts[1] if len(parts) > 1 else "UNKNOWN",
                "name": parts[2].strip('"') if len(parts) > 2 else "Player",
                "score": int(parts[3]) if parts[3].isdigit() else 0,
                "ping": int(parts[4]) if parts[4].isdigit() else 0,
                "duration": parts[5] if len(parts) > 5 else "0:00",
            })
    return players

# ─── Game Mode Switcher ─────────────────────────────────────────────────────────
def switch_mode(mode_name, game_type, game_mode, plugins, configs, cvars, mapgroup, restart=True):
    """
    1. Move ALL .smx files from plugins/ to disabled/ (deactivate all)
    2. Move REQUIRED plugins from disabled/ back to plugins/
    3. Exec configs via RCON
    4. Set CVARs via RCON
    5. Set game_type / game_mode via RCON
    6. Restart server if requested

    Returns (success, log_messages)
    """
    log = []

    os.makedirs(SM_PLUGINS, exist_ok=True)
    os.makedirs(SM_DISABLED, exist_ok=True)

    # ── Step 1: Move all active plugins to disabled ──────────────────────────
    moved_to_disabled = []
    for fname in os.listdir(SM_PLUGINS):
        if fname.endswith(".smx"):
            src = os.path.join(SM_PLUGINS, fname)
            dst = os.path.join(SM_DISABLED, fname)
            try:
                shutil.move(src, dst)
                moved_to_disabled.append(fname)
            except Exception as e:
                log.append(f"WARN: nao moveu {fname} para disabled: {e}")

    log.append(f"Desativados {len(moved_to_disabled)} plugins: {', '.join(moved_to_disabled) or 'nenhum'}")

    # ── Step 2: Move required plugins to active ──────────────────────────────
    moved_to_active = []
    missing = []
    for plugin in plugins:
        src = os.path.join(SM_DISABLED, plugin)
        dst = os.path.join(SM_PLUGINS, plugin)
        if os.path.exists(src):
            try:
                shutil.move(src, dst)
                moved_to_active.append(plugin)
            except Exception as e:
                log.append(f"ERRO: nao moveu {plugin} para plugins: {e}")
        elif os.path.exists(dst):
            log.append(f"Plugin {plugin} ja esta ativo (nao estava em disabled)")
            moved_to_active.append(plugin)
        else:
            missing.append(plugin)
            log.append(f"AVISO: {plugin} nao encontrado em plugins/ nem disabled/")

    log.append(f"Ativados {len(moved_to_active)} plugins: {', '.join(moved_to_active) or 'nenhum'}")
    if missing:
        log.append(f"FALTANDO: {', '.join(missing)}")

    # ── Step 3 & 4: Apply CVARs + game_type/game_mode via RCON ─────────────
    rcon_ok = False
    try:
        # game_type / game_mode
        rcon.send(f"game_type {game_type}")
        rcon.send(f"game_mode {game_mode}")
        log.append(f"RCON: game_type={game_type} game_mode={game_mode}")

        # configs
        for cfg in configs:
            rcon.send(f"exec {cfg}")
            log.append(f"RCON exec: {cfg}")

        # extra cvars
        for key, val in cvars.items():
            rcon.send(f"{key} {val}")
            log.append(f"RCON cvar: {key}={val}")

        # mapgroup
        if mapgroup:
            rcon.send(f"sv_mapgroup {mapgroup}")
            log.append(f"RCON mapgroup: {mapgroup}")

        rcon_ok = True
    except Exception as e:
        log.append(f"AVISO RCON: {e} (servidor pode estar offline, cvars serao aplicados no restart)")

    # ── Step 5: Restart server ───────────────────────────────────────────────
    if restart:
        try:
            rcon.send("quit")
            time.sleep(2)
        except Exception:
            pass
        try:
            subprocess.run(["pkill", "-x", args.cs2_process])
            time.sleep(1)
        except Exception:
            pass
        start_script = os.path.join(args.cs2_dir, "start.sh")
        if os.path.exists(start_script):
            subprocess.Popen(["bash", start_script], cwd=args.cs2_dir,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.append("Servidor reiniciando via start.sh...")
        else:
            log.append(f"AVISO: start.sh nao encontrado em {args.cs2_dir}")

    return True, log

# ─── HTTP Handler ──────────────────────────────────────────────────────────────
_mode_lock = False  # simple in-process guard against concurrent mode switches

class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {fmt % a}")

    def _auth(self):
        return self.headers.get("Authorization", "") == f"Bearer {args.token}"

    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    # ── GET ────────────────────────────────────────────────────────────────────
    def do_GET(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})
        path = self.path.split("?")[0]

        if path == "/server/status":
            running = is_running()
            cpu, ram = get_cpu_ram() if running else (0, 0)
            status = {"online": running, "agentReachable": True,
                      "playerCount": 0, "maxPlayers": 10, "map": "de_dust2",
                      "cpuUsage": cpu, "ramUsage": ram,
                      "uptime": get_uptime() if running else "offline"}
            if running:
                try:
                    out = rcon.send("status")
                    for line in out.splitlines():
                        if "map :" in line.lower():
                            status["map"] = line.split(":")[-1].strip()
                        if "players :" in line.lower():
                            parts = line.split(":")[-1].strip().split()
                            if parts:
                                status["playerCount"] = int(parts[0])
                except Exception:
                    pass
            return self._send(200, status)

        if path == "/server/logs":
            qs = self.path.split("?", 1)[1] if "?" in self.path else ""
            lines = 100
            for part in qs.split("&"):
                if part.startswith("lines="):
                    try: lines = int(part.split("=", 1)[1])
                    except: pass
            return self._send(200, read_logs(lines))

        if path == "/server/players":
            players = []
            try:
                players = parse_players(rcon.send("status"))
            except Exception:
                pass
            return self._send(200, players)

        if path == "/server/plugins":
            plugins = []
            try:
                out = rcon.send("sm plugins list")
                for line in out.splitlines():
                    if ". " in line:
                        parts = line.strip().split(". ", 1)
                        if len(parts) == 2:
                            plugins.append({
                                "id": parts[0].strip(), "name": parts[1].split("(")[0].strip(),
                                "version": "1.0", "author": "", "description": parts[1].strip(),
                                "enabled": True,
                            })
            except Exception:
                pass
            return self._send(200, plugins)

        self._send(404, {"error": "Not found"})

    # ── POST ───────────────────────────────────────────────────────────────────
    def do_POST(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})
        path = self.path.split("?")[0]

        if path == "/server/start":
            start_script = os.path.join(args.cs2_dir, "start.sh")
            if not os.path.exists(start_script):
                return self._send(500, {"success": False, "message": f"start.sh não encontrado em {args.cs2_dir}"})
            try:
                subprocess.Popen(["bash", start_script], cwd=args.cs2_dir,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return self._send(200, {"success": True, "message": "Servidor iniciando..."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        if path == "/server/stop":
            try: rcon.send("quit")
            except Exception: pass
            try: subprocess.run(["pkill", "-x", args.cs2_process])
            except Exception: pass
            return self._send(200, {"success": True, "message": "Servidor parado."})

        if path == "/server/restart":
            try:
                rcon.send("quit")
                time.sleep(3)
                start_script = os.path.join(args.cs2_dir, "start.sh")
                if os.path.exists(start_script):
                    subprocess.Popen(["bash", start_script], cwd=args.cs2_dir,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})
            return self._send(200, {"success": True, "message": "Servidor reiniciando..."})

        if path == "/server/update":
            try:
                update_script = os.path.join(args.cs2_dir, "update.sh")
                if os.path.exists(update_script):
                    subprocess.Popen(["bash", update_script], cwd=args.cs2_dir,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return self._send(200, {"success": True, "message": "Atualização iniciada..."})
                steamcmd = subprocess.run(
                    ["steamcmd", "+login", "anonymous", "+app_update", "730", "validate", "+quit"],
                    capture_output=True, text=True, timeout=300
                )
                return self._send(200, {"success": True, "message": "Atualizado via SteamCMD."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        if path == "/server/command":
            body = self._body()
            cmd = body.get("command", "")
            if not cmd:
                return self._send(400, {"error": "command is required"})
            try:
                response = rcon.send(cmd)
                return self._send(200, {"success": True, "response": response})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # ── /server/mode — Game Mode Switcher ──────────────────────────────────
        if path == "/server/mode":
            global _mode_lock
            if _mode_lock:
                return self._send(409, {"success": False, "message": "Troca de modo já em andamento. Aguarde."})
            body = self._body()
            mode_name  = body.get("name", "unknown")
            game_type  = body.get("gameType", 0)
            game_mode  = body.get("gameMode", 1)
            plugins    = body.get("plugins", [])
            configs    = body.get("configs", [])
            cvars      = body.get("cvars", {})
            mapgroup   = body.get("mapgroup", "mg_active")
            restart    = body.get("restart", True)

            _mode_lock = True
            try:
                success, log = switch_mode(
                    mode_name, game_type, game_mode,
                    plugins, configs, cvars, mapgroup, restart
                )
                return self._send(200, {
                    "success": success,
                    "message": f"Modo '{mode_name}' ativado. {'Servidor reiniciando.' if restart else 'Restart nao solicitado.'}",
                    "log": log,
                    "mode": mode_name,
                    "missingPlugins": [p for p in plugins if not os.path.exists(os.path.join(SM_PLUGINS, p)) and not os.path.exists(os.path.join(SM_DISABLED, p))],
                })
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e), "log": []})
            finally:
                _mode_lock = False

        self._send(404, {"error": "Not found"})


# ─── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 62)
    print("  Limitados CS2 Agent")
    print("=" * 62)
    print(f"  Porta:      {args.port}")
    print(f"  RCON:       {args.rcon_host}:{args.rcon_port}")
    print(f"  CS2 dir:    {args.cs2_dir}")
    print(f"  Plugins:    {SM_PLUGINS}")
    print(f"  Disabled:   {SM_DISABLED}")
    print(f"  Token:      {'*' * len(args.token)}")
    print("=" * 62)
    print(f"  Pronto em http://SEU_IP:{args.port}")
    print("  Ctrl+C para parar")
    print("=" * 62)

    server = HTTPServer(("0.0.0.0", args.port), AgentHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAgente encerrado.")
