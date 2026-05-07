#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Limitados Painel — VPS Installer
#  Tested on Ubuntu 22.04 / Debian 11+
#  Run as root or a user with sudo access.
#
#  Usage:
#    chmod +x vps-install.sh
#    ./vps-install.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${BOLD}━━━  $*  ━━━${NC}"; }

INSTALL_DIR="${INSTALL_DIR:-/opt/limitados-painel}"
DB_NAME="${DB_NAME:-limitados_painel}"
DB_USER="${DB_USER:-limitados}"
NODE_VERSION="${NODE_VERSION:-20}"
PANEL_PORT="${PANEL_PORT:-8080}"
AGENT_PORT="${AGENT_PORT:-7777}"

step "Limitados Painel — Instalação VPS"
info "Diretório de instalação: $INSTALL_DIR"

# ── 1. Dependências do sistema ──────────────────────────────────────────────
step "1/7 — Instalando dependências do sistema"
apt-get update -qq
apt-get install -y -qq \
  curl git build-essential python3 python3-pip \
  postgresql postgresql-contrib \
  nginx certbot python3-certbot-nginx \
  ufw screen wget unzip

pip3 install -q psutil

# ── 2. Node.js ──────────────────────────────────────────────────────────────
step "2/7 — Instalando Node.js $NODE_VERSION"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
info "Node.js: $(node --version) | npm: $(npm --version)"

# pnpm
if ! command -v pnpm &> /dev/null; then
  npm install -g pnpm
fi
info "pnpm: $(pnpm --version)"

# ── 3. PostgreSQL ────────────────────────────────────────────────────────────
step "3/7 — Configurando PostgreSQL"
systemctl start postgresql
systemctl enable postgresql

DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || \
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || \
  warn "Banco $DB_NAME já existe."

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
info "Banco de dados configurado: $DB_NAME"

# ── 4. Clonar / atualizar projeto ────────────────────────────────────────────
step "4/7 — Configurando projeto"
mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Atualizando repositório existente..."
  git -C "$INSTALL_DIR" pull
else
  if [ -z "${REPO_URL:-}" ]; then
    warn "REPO_URL não definido. Copie os arquivos manualmente para $INSTALL_DIR"
    warn "Exemplo: git clone https://github.com/SEU_USUARIO/limitados-painel $INSTALL_DIR"
    read -rp "Pressione Enter após copiar os arquivos..."
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
fi

cd "$INSTALL_DIR"

# ── 5. Variáveis de ambiente ────────────────────────────────────────────────
step "5/7 — Configurando variáveis de ambiente"
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

if [ ! -f "$INSTALL_DIR/.env" ]; then
  cat > "$INSTALL_DIR/.env" << EOF
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$JWT_SECRET
PORT=$PANEL_PORT
NODE_ENV=production
EOF
  info ".env criado em $INSTALL_DIR/.env"
else
  warn ".env já existe, mantendo arquivo atual."
fi

# ── 6. Build ────────────────────────────────────────────────────────────────
step "6/7 — Instalando dependências e fazendo build"
export $(grep -v '^#' .env | xargs)
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm run build
info "Build concluído."

# ── 7. Systemd service ──────────────────────────────────────────────────────
step "7/7 — Configurando serviço systemd"
cat > /etc/systemd/system/limitados-painel.service << EOF
[Unit]
Description=Limitados Painel — CS2 Server Management
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/artifacts/api-server
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=/usr/bin/node --enable-source-maps $INSTALL_DIR/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable limitados-painel
systemctl restart limitados-painel
info "Serviço limitados-painel configurado e iniciado."

# ── Firewall ─────────────────────────────────────────────────────────────────
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow "$AGENT_PORT"/tcp  # Agent port
ufw --force enable

# ── Resumo ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Instalação concluída!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "  Painel API:      http://$(hostname -I | awk '{print $1}'):$PANEL_PORT"
echo -e "  Banco de dados:  $DATABASE_URL"
echo -e "  Arquivo .env:    $INSTALL_DIR/.env"
echo ""
echo -e "  ${BOLD}Próximos passos:${NC}"
echo -e "  1. Configure o Nginx como proxy reverso (veja o README)"
echo -e "  2. Configure SSL com: certbot --nginx -d SEU_DOMINIO"
echo -e "  3. Inicie o agente na VPS do CS2:"
echo -e "     python3 scripts/agent/cs2_agent.py \\"
echo -e "       --token SEU_TOKEN --rcon-password SENHA_RCON"
echo -e "  4. Acesse o painel e adicione o servidor CS2"
echo -e ""
echo -e "  ${BOLD}Comandos úteis:${NC}"
echo -e "  systemctl status limitados-painel"
echo -e "  journalctl -u limitados-painel -f"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
