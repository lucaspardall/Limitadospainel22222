#!/usr/bin/env python3
"""
Limitados CS2 Agent
Rode este script na VPS do seu servidor CS2.

Requisitos: Python 3.8+
Dependências opcionais: pip3 install psutil

Uso:
  python3 cs2_agent.py \
    --token SEU_TOKEN_SECRETO \
    --port 7777 \
    --rcon-host 127.0.0.1 \
    --rcon-port 27015 \
    --rcon-password SENHA_RCON \
    --cs2-dir /home/steam/cs2
"""

import argparse
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

# ─── Args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Limitados CS2 Agent")
parser.add_argument("--token",         required=True,  help="Token secreto")
parser.add_argument("--port",          default=7777,   type=int)
parser.add_argument("--rcon-host",     default="127.0.0.1")
parser.add_argument("--rcon-port",     default=27015,  type=int)
parser.add_argument("--rcon-password", default="")
parser.add_argument("--cs2-dir",       default="/home/steam/cs2")
parser.add_argument("--cs2-process",   default="cs2")
parser.add_argument("--plugin-system", default="css", choices=["css", "sourcemod"])
parser.add_argument("--compose-dir",   default="", help="Docker Compose project directory for Docker-based servers")
parser.add_argument("--compose-service", default="cs2-server")
parser.add_argument("--container-name", default="cs2-server")
args = parser.parse_args()

# ─── Paths ─────────────────────────────────────────────────────────────────────
CSGO_DIR    = os.path.join(args.cs2_dir, "game", "csgo")
SM_PLUGINS  = os.path.join(CSGO_DIR, "addons", "sourcemod", "plugins")
SM_DISABLED = os.path.join(SM_PLUGINS, "disabled")
CSS_PLUGINS = os.path.join(CSGO_DIR, "addons", "counterstrikesharp", "plugins")
CSS_DISABLED = os.path.join(CSGO_DIR, "addons", "counterstrikesharp", "plugins-disabled")
PLUGIN_DIR = CSS_PLUGINS if args.plugin_system == "css" else SM_PLUGINS
PLUGIN_DISABLED_DIR = CSS_DISABLED if args.plugin_system == "css" else SM_DISABLED
CSS_ADMINS_CFG = os.path.join(CSGO_DIR, "addons", "counterstrikesharp", "configs", "admins.json")
LOG_FILE    = os.path.join(CSGO_DIR, "logs", "server.log")
CSTV_CFG    = os.path.join(CSGO_DIR, "limitados_cstv.json")

# Default CSTV config
DEFAULT_CSTV_CFG = {
    "tvEnable": True,
    "tvDelay": 30,
    "tvAutorecord": True,
    "demoFolder": CSGO_DIR,
    "storageLimit": 10240,
    "autoDeleteOld": False,
    "autoDeleteAfterDays": 30,
}

def load_cstv_cfg():
    if os.path.exists(CSTV_CFG):
        try:
            with open(CSTV_CFG) as f:
                cfg = json.load(f)
            for k, v in DEFAULT_CSTV_CFG.items():
                cfg.setdefault(k, v)
            return cfg
        except Exception:
            pass
    return dict(DEFAULT_CSTV_CFG)

def save_cstv_cfg(cfg):
    with open(CSTV_CFG, "w") as f:
        json.dump(cfg, f, indent=2)

def get_demo_folder():
    return load_cstv_cfg().get("demoFolder", CSGO_DIR)

# ─── Recording state ────────────────────────────────────────────────────────────
_recording = None  # {"name": str, "start_time": float, "paused": bool}
_mode_lock = False

# ─── RCON ──────────────────────────────────────────────────────────────────────
class RCONClient:
    def __init__(self, host, port, password, timeout=5):
        self.host, self.port, self.password, self.timeout = host, port, password, timeout

    def _packet(self, req_id, ptype, body):
        body = body.encode("utf-8") + b"\x00\x00"
        return struct.pack("<III", 4 + 4 + len(body), req_id, ptype) + body

    def send(self, command):
        s = socket.create_connection((self.host, self.port), timeout=self.timeout)
        try:
            s.sendall(self._packet(1, 3, self.password))
            s.recv(4096)
            s.sendall(self._packet(2, 2, command))
            data, s.timeout = b"", 3
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
def run_cmd(cmd, cwd=None, timeout=120):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)

def docker_mode():
    return bool(args.compose_dir)

def is_running():
    if docker_mode():
        try:
            result = run_cmd(["docker", "inspect", "-f", "{{.State.Running}}", args.container_name], timeout=20)
            return result.returncode == 0 and result.stdout.strip().lower() == "true"
        except Exception:
            return False
    try:
        return subprocess.run(["pgrep", "-x", args.cs2_process], capture_output=True).returncode == 0
    except Exception:
        return False

def start_server():
    if docker_mode():
        result = run_cmd(["docker", "start", args.container_name], timeout=120)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "docker start failed")
        return "Servidor iniciando via Docker."
    start_script = os.path.join(args.cs2_dir, "start.sh")
    if not os.path.exists(start_script):
        raise FileNotFoundError(f"start.sh nao encontrado em {args.cs2_dir}")
    subprocess.Popen(["bash", start_script], cwd=args.cs2_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "Servidor iniciando via start.sh."

def stop_server():
    if docker_mode():
        result = run_cmd(["docker", "stop", args.container_name], timeout=120)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "docker stop failed")
        return "Servidor parado via Docker."
    try:
        rcon.send("quit")
    except Exception:
        pass
    subprocess.run(["pkill", "-x", args.cs2_process], capture_output=True)
    return "Servidor parado."

def restart_server():
    if docker_mode():
        result = run_cmd(["docker", "restart", args.container_name], timeout=180)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "docker restart failed")
        return "Servidor reiniciando via Docker."
    try:
        rcon.send("quit")
        time.sleep(3)
    except Exception:
        pass
    return start_server()

def update_server():
    if docker_mode():
        pull = run_cmd(["docker", "compose", "pull", args.compose_service], cwd=args.compose_dir, timeout=900)
        if pull.returncode != 0:
            raise RuntimeError(pull.stderr.strip() or pull.stdout.strip() or "docker compose pull failed")
        up = run_cmd(["docker", "compose", "up", "-d", "--no-deps", "--force-recreate", args.compose_service], cwd=args.compose_dir, timeout=300)
        if up.returncode != 0:
            raise RuntimeError(up.stderr.strip() or up.stdout.strip() or "docker compose up failed")
        return "Imagem atualizada e servidor recriado via Docker Compose."
    update_script = os.path.join(args.cs2_dir, "update.sh")
    if os.path.exists(update_script):
        subprocess.Popen(["bash", update_script], cwd=args.cs2_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return "Atualizacao iniciada via update.sh."
    subprocess.run(["steamcmd", "+login", "anonymous", "+app_update", "730", "+quit"], capture_output=True, text=True, timeout=300)
    return "Atualizado via SteamCMD."

def safe_plugin_id(plugin_id):
    name = os.path.basename(plugin_id.strip().strip("/\\"))
    if not name or name in (".", ".."):
        raise ValueError("Plugin invalido")
    return name

def plugin_active_path(plugin_id):
    return os.path.join(PLUGIN_DIR, safe_plugin_id(plugin_id))

def plugin_disabled_path(plugin_id):
    return os.path.join(PLUGIN_DISABLED_DIR, safe_plugin_id(plugin_id))

def set_plugin_enabled(plugin_id, enabled):
    os.makedirs(PLUGIN_DIR, exist_ok=True)
    os.makedirs(PLUGIN_DISABLED_DIR, exist_ok=True)
    src = plugin_disabled_path(plugin_id) if enabled else plugin_active_path(plugin_id)
    dst = plugin_active_path(plugin_id) if enabled else plugin_disabled_path(plugin_id)
    if not os.path.exists(src):
        if os.path.exists(dst):
            return f"Plugin {safe_plugin_id(plugin_id)} ja esta {'ativo' if enabled else 'desativado'}."
        raise FileNotFoundError(f"Plugin {safe_plugin_id(plugin_id)} nao encontrado")
    if os.path.exists(dst):
        shutil.rmtree(dst) if os.path.isdir(dst) else os.remove(dst)
    shutil.move(src, dst)
    return f"Plugin {safe_plugin_id(plugin_id)} {'ativado' if enabled else 'desativado'}."

def list_filesystem_plugins():
    plugins = []
    for folder, enabled in ((PLUGIN_DIR, True), (PLUGIN_DISABLED_DIR, False)):
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            path = os.path.join(folder, name)
            if args.plugin_system == "sourcemod" and not name.endswith(".smx"):
                continue
            if args.plugin_system == "css" and not os.path.isdir(path):
                continue
            plugins.append({
                "id": name,
                "name": name,
                "version": "",
                "author": "",
                "description": f"{args.plugin_system} plugin",
                "enabled": enabled,
            })
    return plugins

def normalize_flags(flags):
    if isinstance(flags, list):
        return [str(flag).strip() for flag in flags if str(flag).strip()]
    text = str(flags or "@css/root").strip()
    if not text:
        return ["@css/root"]
    sep = "," if "," in text else " "
    return [flag.strip() for flag in text.split(sep) if flag.strip()]

def load_css_admins_raw():
    if not os.path.exists(CSS_ADMINS_CFG):
        return {}
    with open(CSS_ADMINS_CFG, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return {}
    data = json.loads(content)
    return data if isinstance(data, dict) else {}

def normalize_css_admins(data):
    admins = []
    for name, value in data.items():
        if not isinstance(value, dict):
            continue
        steam_id = str(value.get("identity") or name)
        flags = normalize_flags(value.get("flags", []))
        immunity = value.get("immunity", 0)
        try:
            immunity = int(immunity)
        except Exception:
            immunity = 0
        admins.append({
            "steamId": steam_id,
            "name": str(name),
            "flags": " ".join(flags),
            "immunity": immunity,
        })
    return sorted(admins, key=lambda a: a["name"].lower())

def list_css_admins():
    return normalize_css_admins(load_css_admins_raw())

def reload_admin_plugin():
    for cmd in ("css_plugins reload AdminPlusv1.0.7", "css_plugins reload AdminPlus"):
        try:
            rcon.send(cmd)
            return
        except Exception:
            pass

def save_css_admin(steam_id, name, flags, immunity):
    steam_id = str(steam_id or "").strip()
    if not steam_id:
        raise ValueError("steamId obrigatorio")
    name = str(name or steam_id).strip() or steam_id
    flag_list = normalize_flags(flags)
    try:
        immunity = int(immunity)
    except Exception:
        immunity = 50
    immunity = max(0, min(100, immunity))

    data = load_css_admins_raw()
    for key, value in list(data.items()):
        if key == name or (isinstance(value, dict) and str(value.get("identity", "")) == steam_id):
            data.pop(key, None)
    data[name] = {"identity": steam_id, "flags": flag_list, "immunity": immunity}

    os.makedirs(os.path.dirname(CSS_ADMINS_CFG), exist_ok=True)
    tmp = CSS_ADMINS_CFG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, CSS_ADMINS_CFG)
    reload_admin_plugin()
    return {"steamId": steam_id, "name": name, "flags": " ".join(flag_list), "immunity": immunity}

def delete_css_admin(steam_id):
    steam_id = str(steam_id or "").strip()
    data = load_css_admins_raw()
    removed = None
    for key, value in list(data.items()):
        if key == steam_id or (isinstance(value, dict) and str(value.get("identity", "")) == steam_id):
            removed = key
            data.pop(key, None)
    if removed is None:
        raise FileNotFoundError("Admin nao encontrado")
    os.makedirs(os.path.dirname(CSS_ADMINS_CFG), exist_ok=True)
    tmp = CSS_ADMINS_CFG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, CSS_ADMINS_CFG)
    reload_admin_plugin()
    return removed

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
                return proc.cpu_percent(interval=0.5), proc.info["memory_info"].rss // (1024 * 1024)
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
                else "debug" if "DEBUG" in line.upper() else "info"
            entries.append({"id": i + 1, "timestamp": datetime.utcnow().isoformat() + "Z",
                            "level": lvl, "message": line})
    except Exception as e:
        entries.append({"id": 1, "timestamp": datetime.utcnow().isoformat() + "Z",
                        "level": "error", "message": str(e)})
    return entries

def parse_status(rcon_output):
    status = {"playerCount": 0, "maxPlayers": 0, "map": None}
    for line in rcon_output.splitlines():
        raw = line.strip()
        map_match = re.search(r"\bmap\s*:\s*([^\s]+)", raw, re.IGNORECASE)
        if map_match:
            status["map"] = map_match.group(1).strip()
            continue

        players_match = re.search(
            r"\bplayers\s*:\s*(\d+)(?:[^\n]*?\((\d+)\s+max\))?",
            raw,
            re.IGNORECASE,
        )
        if players_match:
            status["playerCount"] = int(players_match.group(1))
            if players_match.group(2):
                status["maxPlayers"] = int(players_match.group(2))
            continue

    players = parse_players(rcon_output)
    if players and status["playerCount"] == 0:
        status["playerCount"] = len(players)

    return status

def parse_players(rcon_output):
    players = []
    for line in rcon_output.splitlines():
        raw = line.strip()
        if not raw or raw.lower().startswith(("hostname", "version", "udp/ip", "map", "players", "# userid", "userid")):
            continue

        quoted = re.search(r'"([^"]+)"', raw)
        if not quoted:
            continue

        before_name = raw[:quoted.start()].strip()
        after_name = raw[quoted.end():].strip().split()
        user_tokens = before_name.lstrip("#").split()
        user_id = next((token for token in reversed(user_tokens) if token.isdigit()), "")
        steam_id = next((token for token in after_name if token.startswith(("[U:", "STEAM_", "BOT"))), "BOT")
        connected = next((token for token in after_name if re.match(r"^\d+:\d{2}(?::\d{2})?$", token)), "0:00")
        numeric_after = [int(token) for token in after_name if token.isdigit()]
        ping = numeric_after[0] if numeric_after else 0

        players.append({
            "steamId": steam_id if steam_id != "BOT" else f"BOT-{user_id or len(players) + 1}",
            "name": quoted.group(1),
            "score": 0,
            "ping": ping,
            "duration": connected,
        })

    return players

# ─── Demo helpers ───────────────────────────────────────────────────────────────
def list_demos():
    folder = get_demo_folder()
    cfg = load_cstv_cfg()
    demos = []
    if not os.path.isdir(folder):
        return demos

    # Auto-delete old demos if configured
    if cfg.get("autoDeleteOld") and cfg.get("autoDeleteAfterDays", 30) > 0:
        cutoff = time.time() - cfg["autoDeleteAfterDays"] * 86400
        for fname in os.listdir(folder):
            if fname.endswith(".dem"):
                fpath = os.path.join(folder, fname)
                if os.path.getmtime(fpath) < cutoff:
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass

    for fname in os.listdir(folder):
        if not fname.endswith(".dem"):
            continue
        fpath = os.path.join(folder, fname)
        try:
            stat = os.stat(fpath)
            name = fname[:-4] if fname.endswith(".dem") else fname
            # Try to extract map from filename (e.g. demo_de_dust2_20240101)
            parts = name.split("_")
            map_name = ""
            for p in parts:
                if p.startswith("de_") or p.startswith("cs_") or p.startswith("ar_"):
                    map_name = p
                    break
            demos.append({
                "name": name,
                "size": stat.st_size,
                "modified": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
                "map": map_name,
                "durationSec": max(0, int(stat.st_size / 50000)),  # rough estimate
            })
        except Exception:
            pass

    return sorted(demos, key=lambda d: d["modified"], reverse=True)

def get_recording_size():
    global _recording
    if not _recording:
        return 0
    folder = get_demo_folder()
    path = os.path.join(folder, _recording["name"] + ".dem")
    try:
        return os.path.getsize(path)
    except Exception:
        return 0

# ─── Game mode switcher ─────────────────────────────────────────────────────────
def switch_mode(name, game_type, game_mode, plugins, configs, cvars, mapgroup, restart=True):
    log = []
    if args.plugin_system == "css":
        moved_on, missing = [], []
        for plugin in plugins:
            try:
                set_plugin_enabled(plugin, True)
                moved_on.append(plugin)
            except FileNotFoundError:
                missing.append(plugin)
                log.append(f"AVISO: {plugin} nao encontrado")
            except Exception as e:
                log.append(f"ERRO: {plugin}: {e}")
        if plugins:
            log.append(f"Ativados {len(moved_on)} plugins CounterStrikeSharp")

        try:
            rcon.send(f"game_type {game_type}")
            rcon.send(f"game_mode {game_mode}")
            log.append(f"RCON: game_type={game_type} game_mode={game_mode}")
            for cfg in configs:
                rcon.send(f"exec {cfg}")
                log.append(f"RCON exec: {cfg}")
            for key, val in cvars.items():
                rcon.send(f"{key} {val}")
            if mapgroup:
                rcon.send(f"sv_mapgroup {mapgroup}")
        except Exception as e:
            log.append(f"AVISO RCON: {e}")

        if restart:
            try:
                log.append(restart_server())
            except Exception as e:
                log.append(f"AVISO restart: {e}")

        return True, log, missing

    os.makedirs(SM_PLUGINS, exist_ok=True)
    os.makedirs(SM_DISABLED, exist_ok=True)

    # Move all active plugins to disabled
    moved_off = []
    for fname in os.listdir(SM_PLUGINS):
        if fname.endswith(".smx"):
            try:
                shutil.move(os.path.join(SM_PLUGINS, fname), os.path.join(SM_DISABLED, fname))
                moved_off.append(fname)
            except Exception as e:
                log.append(f"WARN: {fname} -> disabled: {e}")
    log.append(f"Desativados {len(moved_off)} plugins")

    # Move required plugins back to active
    moved_on, missing = [], []
    for plugin in plugins:
        src = os.path.join(SM_DISABLED, plugin)
        dst = os.path.join(SM_PLUGINS, plugin)
        if os.path.exists(src):
            try:
                shutil.move(src, dst)
                moved_on.append(plugin)
            except Exception as e:
                log.append(f"ERRO: {plugin}: {e}")
        elif os.path.exists(dst):
            moved_on.append(plugin)
        else:
            missing.append(plugin)
            log.append(f"AVISO: {plugin} nao encontrado")
    log.append(f"Ativados {len(moved_on)} plugins")

    # Send RCON commands
    try:
        rcon.send(f"game_type {game_type}")
        rcon.send(f"game_mode {game_mode}")
        log.append(f"RCON: game_type={game_type} game_mode={game_mode}")
        for cfg in configs:
            rcon.send(f"exec {cfg}")
            log.append(f"RCON exec: {cfg}")
        for key, val in cvars.items():
            rcon.send(f"{key} {val}")
        if mapgroup:
            rcon.send(f"sv_mapgroup {mapgroup}")
    except Exception as e:
        log.append(f"AVISO RCON: {e}")

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
            log.append(f"AVISO: start.sh nao encontrado")

    return True, log, missing

# ─── HTTP Handler ──────────────────────────────────────────────────────────────
class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.command} {self.path} — {fmt % a}")

    def _auth(self):
        return self.headers.get("Authorization", "") == f"Bearer {args.token}"

    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_file(self, filepath, filename):
        try:
            size = os.path.getsize(filepath)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(size))
            self.end_headers()
            with open(filepath, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except Exception as e:
            self._send(500, {"error": str(e)})

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _path(self):
        return self.path.split("?")[0]

    def _qs(self):
        qs = {}
        if "?" in self.path:
            for part in self.path.split("?", 1)[1].split("&"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    qs[k] = v
        return qs

    # ── GET ────────────────────────────────────────────────────────────────────
    def do_GET(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})
        path = self._path()

        # /server/status
        if path == "/server/status":
            running = is_running()
            cpu, ram = get_cpu_ram() if running else (0, 0)
            status = {"online": running, "agentReachable": True,
                      "playerCount": 0, "maxPlayers": 0, "map": None,
                      "cpuUsage": cpu, "ramUsage": ram,
                      "uptime": get_uptime() if running else "offline"}
            if running:
                try:
                    out = rcon.send("status")
                    status.update(parse_status(out))
                except Exception as e:
                    status["error"] = str(e)
            return self._send(200, status)

        # /server/logs
        if path == "/server/logs":
            lines = int(self._qs().get("lines", "100"))
            return self._send(200, read_logs(lines))

        # /server/players
        if path == "/server/players":
            try:
                return self._send(200, parse_players(rcon.send("status")))
            except Exception:
                return self._send(200, [])

        # /server/plugins
        if path == "/server/plugins":
            plugins = list_filesystem_plugins()
            try:
                out = rcon.send("css_plugins list" if args.plugin_system == "css" else "sm plugins list")
                if args.plugin_system == "sourcemod":
                    for line in out.splitlines():
                        if ". " in line:
                            parts = line.strip().split(". ", 1)
                            if len(parts) == 2:
                                plugins.append({
                                    "id": parts[0].strip(),
                                    "name": parts[1].split("(")[0].strip(),
                                    "version": "1.0", "author": "",
                                    "description": parts[1].strip(), "enabled": True,
                                })
            except Exception:
                pass
            return self._send(200, plugins)

        if path == "/server/admins":
            if args.plugin_system != "css":
                return self._send(400, {"error": "Admins API is only available for CounterStrikeSharp"})
            try:
                return self._send(200, list_css_admins())
            except Exception as e:
                return self._send(500, {"error": str(e)})

        # /server/demos — list demo files
        if path == "/server/demos":
            return self._send(200, list_demos())

        # /server/demos/:name — download demo file
        if path.startswith("/server/demos/") and path.count("/") == 3:
            name = path.split("/server/demos/", 1)[1]
            fname = name if name.endswith(".dem") else name + ".dem"
            fpath = os.path.join(get_demo_folder(), fname)
            if not os.path.exists(fpath):
                return self._send(404, {"error": "Demo nao encontrada"})
            return self._send_file(fpath, fname)

        # /server/cstv/status
        if path == "/server/cstv/status":
            global _recording
            tv_enabled, tv_autorecord, tv_delay, tv_clients = False, False, 30, 0
            try:
                out = rcon.send("tv_status")
                for line in out.splitlines():
                    ll = line.lower()
                    if "enabled" in ll:
                        tv_enabled = True
                    if "recording" in ll and ":" in line:
                        pass  # name already tracked in _recording
                    if "delay" in ll and ":" in line:
                        try:
                            tv_delay = int(line.split(":")[-1].strip().split()[0])
                        except Exception:
                            pass
                    if "client" in ll:
                        try:
                            tv_clients = int(''.join(filter(str.isdigit, line.split(":")[-1].strip())))
                        except Exception:
                            pass
            except Exception:
                pass

            rec_duration = 0
            rec_size = 0
            if _recording and not _recording.get("paused"):
                rec_duration = int(time.time() - _recording["start_time"])
                rec_size = get_recording_size()

            return self._send(200, {
                "tvEnabled": tv_enabled,
                "tvRecording": _recording is not None,
                "tvDemoName": _recording["name"] if _recording else None,
                "tvDelay": tv_delay,
                "tvAutorecord": tv_autorecord,
                "tvClients": tv_clients,
                "recordingDuration": rec_duration,
                "recordingSize": rec_size,
            })

        # /server/cstv/config
        if path == "/server/cstv/config":
            return self._send(200, load_cstv_cfg())

        self._send(404, {"error": "Not found"})

    # ── DELETE ─────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})
        path = self._path()

        # DELETE /server/demos/:name
        if path.startswith("/server/demos/") and path.count("/") == 3:
            name = path.split("/server/demos/", 1)[1]
            fname = name if name.endswith(".dem") else name + ".dem"
            fpath = os.path.join(get_demo_folder(), fname)
            if not os.path.exists(fpath):
                return self._send(404, {"error": "Demo nao encontrada"})
            try:
                os.remove(fpath)
                return self._send(200, {"success": True, "message": f"{fname} excluida."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        if path.startswith("/server/admins/") and path.count("/") == 3:
            steam_id = path.split("/server/admins/", 1)[1]
            if args.plugin_system != "css":
                return self._send(400, {"success": False, "message": "Admins API is only available for CounterStrikeSharp"})
            try:
                removed = delete_css_admin(steam_id)
                return self._send(200, {"success": True, "message": f"Admin {removed} removido."})
            except FileNotFoundError as e:
                return self._send(404, {"success": False, "message": str(e)})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        self._send(404, {"error": "Not found"})

    # ── POST ───────────────────────────────────────────────────────────────────
    def do_POST(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})
        path = self._path()
        global _recording, _mode_lock

        # /server/start
        if path == "/server/start":
            try:
                return self._send(200, {"success": True, "message": start_server()})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/stop
        if path == "/server/stop":
            try:
                return self._send(200, {"success": True, "message": stop_server()})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/restart
        if path == "/server/restart":
            try:
                return self._send(200, {"success": True, "message": restart_server()})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/update
        if path == "/server/update":
            try:
                return self._send(200, {"success": True, "message": update_server()})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        if path.startswith("/server/plugins/") and (path.endswith("/enable") or path.endswith("/disable")):
            parts = path.split("/")
            plugin_id = parts[3] if len(parts) >= 5 else ""
            enabled = path.endswith("/enable")
            try:
                message = set_plugin_enabled(plugin_id, enabled)
                return self._send(200, {"success": True, "message": message})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        if path == "/server/admins":
            if args.plugin_system != "css":
                return self._send(400, {"success": False, "message": "Admins API is only available for CounterStrikeSharp"})
            body = self._body()
            try:
                admin = save_css_admin(
                    body.get("steamId") or body.get("steamid"),
                    body.get("name"),
                    body.get("flags", "@css/root"),
                    body.get("immunity", 50),
                )
                return self._send(200, {"success": True, "message": f"Admin {admin['name']} salvo.", "admin": admin})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/command
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

        # ── CSTV / Demo endpoints ──────────────────────────────────────────────

        # /server/demos/record
        if path == "/server/demos/record":
            body = self._body()
            name = body.get("name", f"demo_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            name = name.replace(" ", "_").replace("/", "").replace("\\", "")
            if _recording:
                return self._send(409, {"success": False, "message": "Já gravando. Pare a demo atual primeiro."})
            try:
                rcon.send(f"tv_record {name}")
                _recording = {"name": name, "start_time": time.time(), "paused": False}
                return self._send(200, {"success": True, "message": f"Gravação iniciada: {name}", "name": name})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/demos/stop
        if path == "/server/demos/stop":
            try:
                rcon.send("tv_stoprecord")
                _recording = None
                return self._send(200, {"success": True, "message": "Gravação parada."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/demos/pause
        if path == "/server/demos/pause":
            try:
                rcon.send("tv_stoprecord")  # CS2 doesn't have native pause, stop is closest
                if _recording:
                    _recording["paused"] = True
                return self._send(200, {"success": True, "message": "Demo pausada."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/demos/resume
        if path == "/server/demos/resume":
            try:
                if _recording:
                    rcon.send(f"tv_record {_recording['name']}")
                    _recording["paused"] = False
                    return self._send(200, {"success": True, "message": "Demo retomada."})
                return self._send(400, {"success": False, "message": "Nenhuma demo pausada."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/demos/:name/rename
        if path.startswith("/server/demos/") and path.endswith("/rename"):
            name = path.split("/server/demos/", 1)[1].rsplit("/rename", 1)[0]
            body = self._body()
            new_name = body.get("newName", "")
            if not new_name:
                return self._send(400, {"error": "newName required"})
            folder = get_demo_folder()
            old_path = os.path.join(folder, name if name.endswith(".dem") else name + ".dem")
            new_path = os.path.join(folder, new_name if new_name.endswith(".dem") else new_name + ".dem")
            if not os.path.exists(old_path):
                return self._send(404, {"error": "Demo nao encontrada"})
            try:
                os.rename(old_path, new_path)
                return self._send(200, {"success": True, "message": f"Renomeada para {new_name}"})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # /server/cstv/config — save config
        if path == "/server/cstv/config":
            body = self._body()
            cfg = load_cstv_cfg()
            cfg.update({k: v for k, v in body.items() if k in DEFAULT_CSTV_CFG})
            save_cstv_cfg(cfg)
            # Apply CSTV settings via RCON
            try:
                rcon.send(f"tv_enable {1 if cfg['tvEnable'] else 0}")
                rcon.send(f"tv_delay {cfg['tvDelay']}")
                rcon.send(f"tv_autorecord {1 if cfg['tvAutorecord'] else 0}")
            except Exception:
                pass
            return self._send(200, {"success": True, "message": "Configurações salvas.", "config": cfg})

        # /server/mode — game mode switcher
        if path == "/server/mode":
            if _mode_lock:
                return self._send(409, {"success": False, "message": "Troca de modo em andamento. Aguarde."})
            body = self._body()
            _mode_lock = True
            try:
                ok, log, missing = switch_mode(
                    body.get("name", "unknown"),
                    body.get("gameType", 0),
                    body.get("gameMode", 1),
                    body.get("plugins", []),
                    body.get("configs", []),
                    body.get("cvars", {}),
                    body.get("mapgroup", "mg_active"),
                    body.get("restart", True),
                )
                return self._send(200, {
                    "success": ok, "log": log, "missingPlugins": missing,
                    "message": f"Modo '{body.get('name')}' ativado.",
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
    print(f"  Porta:    {args.port}")
    print(f"  RCON:     {args.rcon_host}:{args.rcon_port}")
    print(f"  CS2 dir:  {args.cs2_dir}")
    print(f"  Plugins:  {PLUGIN_DIR} ({args.plugin_system})")
    if docker_mode():
        print(f"  Docker:   {args.container_name} em {args.compose_dir}")
    print(f"  Demos:    {get_demo_folder()}")
    print(f"  Token:    {'*' * len(args.token)}")
    print("=" * 62)
    print(f"  Pronto em http://SEU_IP:{args.port}")
    print("  Ctrl+C para parar")
    print("=" * 62)

    server = HTTPServer(("0.0.0.0", args.port), AgentHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAgente encerrado.")

