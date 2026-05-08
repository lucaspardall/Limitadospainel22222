#!/bin/bash
set -e

# ══════════════════════════════════════════════════════════════
#  Limitados Painel — Script de Deploy na VPS
#  VPS: Ubuntu 24.04 | Node 20 | Docker + PostgreSQL já rodando
# ══════════════════════════════════════════════════════════════

echo ""
echo "============================================"
echo "  Limitados Painel — Deploy Automatico"
echo "============================================"
echo ""

# ─── Variaveis ────────────────────────────────────────────────
INSTALL_DIR="/opt/limitados-painel"
AGENT_TOKEN="lmt_$(openssl rand -hex 16)"
SESSION_SECRET="$(openssl rand -base64 48)"
DB_PASSWORD="limitados_$(openssl rand -hex 8)"
DB_NAME="limitados_painel"
DB_USER="limitados"
RCON_PASSWORD="senha_rcon_forte_123"
CS2_DATA_DIR="/root/cs2-server/cs2-data"
PANEL_PORT=8081
AGENT_PORT=7777

echo "[1/9] Instalando pnpm..."
npm install -g pnpm@latest 2>/dev/null || true
echo "  pnpm $(pnpm --version)"

echo ""
echo "[2/9] Criando banco de dados no PostgreSQL..."
# O PostgreSQL ja roda como container Docker na porta 5432
# Container: postgres:16-alpine | User atual: lumia | DB: lumia
docker exec $(docker ps -q --filter ancestor=postgres:16-alpine) psql -U lumia -d lumia -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
" 2>/dev/null || true

docker exec $(docker ps -q --filter ancestor=postgres:16-alpine) psql -U lumia -d lumia -c "
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')
\gexec
" 2>/dev/null || true

docker exec $(docker ps -q --filter ancestor=postgres:16-alpine) psql -U lumia -d lumia -c "
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
" 2>/dev/null || true

echo "  Banco ${DB_NAME} criado com usuario ${DB_USER}"

echo ""
echo "[3/9] Clonando repositorio..."
if [ -d "$INSTALL_DIR" ]; then
  echo "  Diretorio ja existe, atualizando..."
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || true
else
  git clone https://github.com/lucaspardall/Limitadospainel22222.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo ""
echo "[4/9] Criando .env..."
cat > "$INSTALL_DIR/.env" << ENVEOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
PORT=${PANEL_PORT}
NODE_ENV=production
ENVEOF
echo "  .env criado em $INSTALL_DIR/.env"

echo ""
echo "[5/9] Adicionando servico de arquivos estaticos ao backend..."
# Modifica app.ts para servir o frontend buildado em producao
APPTS="$INSTALL_DIR/artifacts/api-server/src/app.ts"
if ! grep -q "express.static" "$APPTS" 2>/dev/null; then
cat > "$APPTS" << 'APPTSCODE'
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Servir frontend em producao
if (process.env.NODE_ENV === "production") {
  const frontendDir = path.resolve(__dirname, "../../cs2-panel/dist/public");
  app.use(express.static(frontendDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

export default app;
APPTSCODE
  echo "  app.ts atualizado com servico de arquivos estaticos"
else
  echo "  app.ts ja tem servico de arquivos estaticos"
fi

echo ""
echo "[6/9] Instalando dependencias e buildando..."
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Build das libs primeiro
pnpm run typecheck:libs 2>/dev/null || true

# Build do frontend (precisa de PORT e BASE_PATH)
cd "$INSTALL_DIR/artifacts/cs2-panel"
PORT=19623 BASE_PATH="/" pnpm run build 2>/dev/null || {
  echo "  Build do frontend via vite..."
  PORT=19623 BASE_PATH="/" npx vite build
}

# Build do backend
cd "$INSTALL_DIR/artifacts/api-server"
pnpm run build

# Push do schema pro banco
cd "$INSTALL_DIR"
pnpm --filter @workspace/db run push 2>/dev/null || {
  echo "  Rodando drizzle push..."
  cd "$INSTALL_DIR/lib/db"
  npx drizzle-kit push
}

echo "  Build completo!"

echo ""
echo "[7/9] Instalando agente CS2..."
AGENT_DIR="/opt/cs2-agent"
mkdir -p "$AGENT_DIR"
cp "$INSTALL_DIR/scripts/agent/cs2_agent.py" "$AGENT_DIR/cs2_agent.py"

# Criar servico systemd do agente
cat > /etc/systemd/system/cs2-agent.service << AGENTEOF
[Unit]
Description=Limitados CS2 Agent
After=network.target docker.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 ${AGENT_DIR}/cs2_agent.py \\
  --token ${AGENT_TOKEN} \\
  --port ${AGENT_PORT} \\
  --rcon-host 127.0.0.1 \\
  --rcon-port 27015 \\
  --rcon-password ${RCON_PASSWORD} \\
  --cs2-dir ${CS2_DATA_DIR} \\
  --compose-dir /root/cs2-server \\
  --container-name cs2-server \\
  --plugin-system css
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
AGENTEOF
echo "  Agente instalado em $AGENT_DIR"

echo ""
echo "[8/9] Configurando servico do painel..."
# Criar servico systemd do painel
cat > /etc/systemd/system/limitados-painel.service << PANELEOF
[Unit]
Description=Limitados Painel CS2
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/artifacts/api-server
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node --enable-source-maps ${INSTALL_DIR}/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
PANELEOF

# Parar o painel antigo (container Docker)
echo "  Parando painel antigo..."
docker stop cs2-admin-panel 2>/dev/null || true
docker rm cs2-admin-panel 2>/dev/null || true

# Remover o admin-panel do compose.yaml pra nao subir de novo
cd /root/cs2-server
if grep -q "admin-panel:" compose.yaml; then
  # Backup do compose original
  cp compose.yaml compose.yaml.bak
  # Reescrever compose so com o cs2-server
  cat > compose.yaml << 'COMPOSEEOF'
services:
  cs2-server:
    image: joedwards32/cs2:latest
    container_name: cs2-server
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "27015:27015/tcp"
      - "27015:27015/udp"
      - "27020:27020/udp"
    volumes:
      - ./cs2-data:/home/steam/cs2-dedicated
COMPOSEEOF
  echo "  compose.yaml atualizado (backup em compose.yaml.bak)"
fi

# Ativar e iniciar os servicos
systemctl daemon-reload
systemctl enable cs2-agent limitados-painel
systemctl start cs2-agent
systemctl start limitados-painel

echo ""
echo "[9/9] Configurando firewall..."
ufw allow ${AGENT_PORT}/tcp 2>/dev/null || true
ufw allow ${PANEL_PORT}/tcp 2>/dev/null || true
echo "  Portas ${AGENT_PORT} e ${PANEL_PORT} abertas"

echo ""
echo "============================================"
echo "  DEPLOY CONCLUIDO!"
echo "============================================"
echo ""
echo "  Painel:  http://187.127.28.229:${PANEL_PORT}"
echo "  Login:   admin / admin"
echo "  Agente:  http://127.0.0.1:${AGENT_PORT}"
echo ""
echo "  Ao entrar no painel, va em:"
echo "  Servidores → + Novo Servidor"
echo "  e preencha:"
echo ""
echo "    Nome:        Servidor Principal"
echo "    IP:          187.127.28.229"
echo "    Porta:       27015"
echo "    Agent URL:   http://127.0.0.1:${AGENT_PORT}"
echo "    Agent Token: ${AGENT_TOKEN}"
echo ""
echo "  Salve esse token! Ele aparece so uma vez."
echo ""
echo "  Comandos uteis:"
echo "    systemctl status limitados-painel"
echo "    systemctl status cs2-agent"
echo "    journalctl -u limitados-painel -f"
echo "    journalctl -u cs2-agent -f"
echo "============================================"
