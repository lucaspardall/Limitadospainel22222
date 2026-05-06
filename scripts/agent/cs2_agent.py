#!/usr/bin/env python3
"""
Limitados CS2 Agent
Rode este script na sua VPS para integrar com o painel Limitados.

Requisitos: Python 3.8+ (já vem no Linux)
Instalar dependências:  pip install psutil

Uso:
  python3 cs2_agent.py --token SEU_TOKEN_SECRETO --port 7777 --rcon-password SENHA_RCON
"""

import argparse
import json
import os
import socket
import struct
import subprocess
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

# ─── Configuração ─────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Limitados CS2 Agent")
parser.add_argument("--token",         required=True,  help="Token secreto (mesmo que colocar no painel)")
parser.add_argument("--port",          default=7777,   type=int, help="Porta do agente (padrão: 7777)")
parser.add_argument("--rcon-host",     default="127.0.0.1", help="IP do servidor CS2 (padrão: 127.0.0.1)")
parser.add_argument("--rcon-port",     default=27015,  type=int, help="Porta RCON do CS2 (padrão: 27015)")
parser.add_argument("--rcon-password", default="",     help="Senha RCON do CS2")
parser.add_argument("--cs2-dir",       default="/home/steam/cs2", help="Diretório do CS2")
parser.add_argument("--cs2-process",   default="cs2",  help="Nome do processo CS2")
args = parser.parse_args()

LOG_FILE = os.path.join(args.cs2_dir, "game", "csgo", "logs", "server.log")

# ─── RCON ──────────────────────────────────────────────────────────────────────
class RCONClient:
    def __init__(self, host, port, password, timeout=5):
        self.host = host
        self.port = port
        self.password = password
        self.timeout = timeout

    def _packet(self, req_id, ptype, body):
        body = body.encode("utf-8") + b"\x00\x00"
        size = 4 + 4 + len(body)
        return struct.pack("<III", size, req_id, ptype) + body

    def send(self, command):
        try:
            s = socket.create_connection((self.host, self.port), timeout=self.timeout)
            s.sendall(self._packet(1, 3, self.password))
            s.recv(4096)  # auth response
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
            s.close()
            if len(data) >= 12:
                return data[12:].rstrip(b"\x00").decode("utf-8", errors="replace")
            return "OK"
        except Exception as e:
            raise RuntimeError(f"RCON error: {e}")

rcon = RCONClient(args.rcon_host, args.rcon_port, args.rcon_password)

# ─── Helpers ───────────────────────────────────────────────────────────────────
def is_cs2_running():
    try:
        result = subprocess.run(["pgrep", "-x", args.cs2_process], capture_output=True)
        return result.returncode == 0
    except Exception:
        return False

def get_uptime():
    try:
        result = subprocess.run(
            ["ps", "-p", subprocess.check_output(["pgrep", "-x", args.cs2_process]).decode().strip(), "-o", "etimes="],
            capture_output=True, text=True
        )
        secs = int(result.stdout.strip())
        h, m = divmod(secs // 60, 60)
        return f"{h}h {m}m" if h else f"{m}m"
    except Exception:
        return "N/A"

def get_cpu_ram():
    try:
        import psutil
        for proc in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            if args.cs2_process in proc.info["name"]:
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
            level = "info"
            if "ERROR" in line.upper() or "FATAL" in line.upper():
                level = "error"
            elif "WARN" in line.upper():
                level = "warn"
            elif "DEBUG" in line.upper():
                level = "debug"
            entries.append({
                "id": i + 1,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "level": level,
                "message": line,
            })
    except Exception as e:
        entries.append({"id": 1, "timestamp": datetime.utcnow().isoformat() + "Z", "level": "error", "message": str(e)})
    return entries

def parse_status(rcon_output):
    players = []
    try:
        lines = rcon_output.splitlines()
        for line in lines:
            parts = line.split()
            if len(parts) >= 5 and parts[0].isdigit():
                players.append({
                    "steamId": parts[1] if len(parts) > 1 else "UNKNOWN",
                    "name": parts[2].strip('"') if len(parts) > 2 else "Player",
                    "score": int(parts[3]) if parts[3].isdigit() else 0,
                    "ping": int(parts[4]) if parts[4].isdigit() else 0,
                    "duration": parts[5] if len(parts) > 5 else "0:00",
                })
    except Exception:
        pass
    return players

# ─── HTTP Handler ──────────────────────────────────────────────────────────────
class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *a):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {format % a}")

    def _auth(self):
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {args.token}"

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_GET(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})

        path = self.path.split("?")[0]

        # GET /server/status
        if path == "/server/status":
            running = is_cs2_running()
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

        # GET /server/logs
        if path == "/server/logs":
            qs = self.path.split("?", 1)[1] if "?" in self.path else ""
            lines = 100
            for part in qs.split("&"):
                if part.startswith("lines="):
                    try: lines = int(part.split("=", 1)[1])
                    except: pass
            return self._send(200, read_logs(lines))

        # GET /server/players
        if path == "/server/players":
            players = []
            try:
                out = rcon.send("status")
                players = parse_status(out)
            except Exception:
                pass
            return self._send(200, players)

        # GET /server/plugins
        if path == "/server/plugins":
            plugins = []
            try:
                out = rcon.send("sm plugins list")
                for line in out.splitlines():
                    if ". " in line:
                        parts = line.strip().split(". ", 1)
                        if len(parts) == 2:
                            plugins.append({
                                "id": parts[0].strip(),
                                "name": parts[1].split("(")[0].strip(),
                                "version": "1.0",
                                "author": "",
                                "description": parts[1].strip(),
                                "enabled": True,
                            })
            except Exception:
                pass
            return self._send(200, plugins)

        self._send(404, {"error": "Not found"})

    def do_POST(self):
        if not self._auth():
            return self._send(401, {"error": "Unauthorized"})

        path = self.path.split("?")[0]

        # POST /server/start
        if path == "/server/start":
            try:
                start_script = os.path.join(args.cs2_dir, "start.sh")
                if os.path.exists(start_script):
                    subprocess.Popen(["bash", start_script], cwd=args.cs2_dir,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    return self._send(500, {"success": False, "message": f"start.sh não encontrado em {args.cs2_dir}"})
                return self._send(200, {"success": True, "message": "Servidor iniciando..."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # POST /server/stop
        if path == "/server/stop":
            try:
                rcon.send("quit")
            except Exception:
                pass
            try:
                subprocess.run(["pkill", "-x", args.cs2_process])
            except Exception:
                pass
            return self._send(200, {"success": True, "message": "Servidor parado."})

        # POST /server/restart
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

        # POST /server/update
        if path == "/server/update":
            try:
                update_script = os.path.join(args.cs2_dir, "update.sh")
                if os.path.exists(update_script):
                    subprocess.Popen(["bash", update_script], cwd=args.cs2_dir,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return self._send(200, {"success": True, "message": "Atualização iniciada..."})
                else:
                    # Tentativa com steamcmd diretamente
                    steamcmd = subprocess.run(
                        ["steamcmd", "+login", "anonymous",
                         "+app_update", "730", "validate", "+quit"],
                        capture_output=True, text=True, timeout=300
                    )
                    return self._send(200, {"success": True, "message": "Atualizado via SteamCMD."})
            except Exception as e:
                return self._send(500, {"success": False, "message": str(e)})

        # POST /server/command
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

        self._send(404, {"error": "Not found"})


# ─── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Limitados CS2 Agent")
    print("=" * 60)
    print(f"  Porta:        {args.port}")
    print(f"  RCON:         {args.rcon_host}:{args.rcon_port}")
    print(f"  CS2 dir:      {args.cs2_dir}")
    print(f"  Token:        {'*' * len(args.token)}")
    print("=" * 60)
    print(f"  Agente pronto em http://SEU_IP:{args.port}")
    print("  Pressione Ctrl+C para parar")
    print("=" * 60)

    server = HTTPServer(("0.0.0.0", args.port), AgentHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAgente encerrado.")
