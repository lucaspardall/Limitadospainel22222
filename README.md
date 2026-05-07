# Limitados Painel

> Painel web completo para gerenciamento de servidores Counter-Strike 2, com suporte a múltiplos modos de jogo, controle de plugins, gravação de demos CSTV e muito mais.

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Instalação Local](#instalação-local)
- [Deploy em VPS](#deploy-em-vps)
- [Configuração do Agente CS2](#configuração-do-agente-cs2)
- [Configurando o CS2](#configurando-o-cs2)
- [SourceMod e Metamod](#sourcemod-e-metamod)
- [Sistema de Modos de Jogo](#sistema-de-modos-de-jogo)
- [CSTV e Demos](#cstv-e-demos)
- [Docker](#docker)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Referência de Portas e Firewall](#referência-de-portas-e-firewall)
- [Guia para IA / Codex](#guia-para-ia--codex)
- [Troubleshooting](#troubleshooting)

---

## Funcionalidades

| Módulo | O que faz |
|--------|-----------|
| **Dashboard** | Visão geral: servidores online, players ativos, timeline de atividades |
| **Servidor** | Start / Stop / Restart / Update via agente na VPS |
| **Modos de Jogo** | Troca dinâmica: move plugins, aplica configs, muda game_type/game_mode, reinicia |
| **Players** | Lista em tempo real, Kick / Ban / Mute via RCON |
| **Admins** | Gerenciar admins SourceMod via RCON (`sm_addadmin`, `sm_removeadmin`) |
| **Mapas** | Troca de mapa via RCON, suporte a mapas workshop |
| **Plugins** | Lista de plugins SourceMod ativos via `sm plugins list` |
| **CSTV / Demos** | Gravar, pausar, parar, listar, baixar, renomear e excluir demos |
| **Console** | RCON direto com painel de comandos rápidos (~35 botões) |
| **Logs** | Logs do servidor em tempo real com polling |
| **Usuários** | Gerenciar usuários do painel (admin/operador) |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                     Limitados Painel                        │
│                                                             │
│  ┌──────────────────┐     ┌─────────────────────────────┐  │
│  │  Frontend         │────▶│  API Backend (Express)      │  │
│  │  React + Vite     │     │  JWT Auth + PostgreSQL      │  │
│  │  Tailwind CSS     │     │  Proxy para o Agente        │  │
│  └──────────────────┘     └────────────┬────────────────┘  │
└────────────────────────────────────────┼────────────────────┘
                                          │ HTTP (Bearer token)
                          ┌───────────────▼───────────────────┐
                          │       VPS do Servidor CS2          │
                          │                                    │
                          │  ┌─────────────────────────────┐  │
                          │  │  cs2_agent.py (Python)       │  │
                          │  │  • Controla arquivos/plugins │  │
                          │  │  • RCON para o CS2          │  │
                          │  │  • Gerencia demos           │  │
                          │  └──────────────┬──────────────┘  │
                          │                 │ RCON TCP         │
                          │  ┌─────────────▼──────────────┐   │
                          │  │  CS2 Server + SourceMod     │   │
                          │  │  + Metamod + Plugins        │   │
                          │  └────────────────────────────┘   │
                          └────────────────────────────────────┘
```

**Princípio fundamental:** o backend do painel **nunca executa comandos localmente**. Tudo é encaminhado ao agente Python rodando na VPS via HTTP, com autenticação por Bearer token por servidor.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, TanStack Query, wouter |
| Backend | Node.js 20+, Express 5, JWT, bcrypt |
| Banco de dados | PostgreSQL + Drizzle ORM |
| Validação | Zod v4, drizzle-zod |
| Agente VPS | Python 3.8+ (sem dependências externas, opcional: psutil) |
| Monorepo | pnpm workspaces |

---

## Instalação Local

### Pré-requisitos

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL 14+

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/SEU_USUARIO/limitados-painel.git
cd limitados-painel

# 2. Criar arquivo .env
cp .env.example .env
# Edite .env com suas configurações

# 3. Instalar dependências
pnpm install

# 4. Criar tabelas no banco de dados
pnpm --filter @workspace/db run push

# 5. Iniciar o backend (terminal 1)
pnpm --filter @workspace/api-server run dev

# 6. Iniciar o frontend (terminal 2)
pnpm --filter @workspace/cs2-panel run dev
```

O painel estará disponível em `http://localhost:19623`.

**Login padrão:** `admin` / `admin`

---

## Deploy em VPS

### Opção 1 — Script automático (recomendado)

```bash
# Na VPS (Ubuntu 22.04 / Debian 11+), como root:
wget https://raw.githubusercontent.com/SEU_USUARIO/limitados-painel/main/scripts/vps-install.sh
chmod +x vps-install.sh
REPO_URL=https://github.com/SEU_USUARIO/limitados-painel.git ./vps-install.sh
```

### Opção 2 — Manual

```bash
# 1. Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm

# 2. Instalar PostgreSQL
sudo apt-get install -y postgresql
sudo -u postgres psql -c "CREATE USER limitados WITH PASSWORD 'SENHA';"
sudo -u postgres psql -c "CREATE DATABASE limitados_painel OWNER limitados;"

# 3. Clonar e instalar
git clone https://github.com/SEU_USUARIO/limitados-painel.git /opt/limitados-painel
cd /opt/limitados-painel
cp .env.example .env
# Edite .env com DATABASE_URL e SESSION_SECRET
pnpm install
pnpm --filter @workspace/db run push
pnpm run build

# 4. Criar serviço systemd
sudo tee /etc/systemd/system/limitados-painel.service << 'EOF'
[Unit]
Description=Limitados Painel CS2
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/limitados-painel/artifacts/api-server
EnvironmentFile=/opt/limitados-painel/.env
ExecStart=/usr/bin/node --enable-source-maps /opt/limitados-painel/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now limitados-painel

# 5. Configurar Nginx como proxy reverso
sudo tee /etc/nginx/sites-available/limitados-painel << 'EOF'
server {
    listen 80;
    server_name SEU_DOMINIO.com;

    # Frontend (build estático)
    location / {
        root /opt/limitados-painel/artifacts/cs2-panel/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Necessário para downloads de demos (sem timeout)
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/limitados-painel /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. SSL com Let's Encrypt
sudo certbot --nginx -d SEU_DOMINIO.com
```

---

## Configuração do Agente CS2

O agente é um script Python leve que roda na VPS onde o CS2 está instalado.

### Instalação

```bash
# Na VPS do CS2
pip3 install psutil

# Baixar o agente
wget https://raw.githubusercontent.com/SEU_USUARIO/limitados-painel/main/scripts/agent/cs2_agent.py
```

### Execução

```bash
python3 cs2_agent.py \
  --token TOKEN_SECRETO_QUALQUER \
  --port 7777 \
  --rcon-host 127.0.0.1 \
  --rcon-port 27015 \
  --rcon-password SENHA_RCON_DO_CS2 \
  --cs2-dir /home/steam/cs2
```

### Executar em background com screen

```bash
screen -S cs2agent
python3 cs2_agent.py --token MEU_TOKEN --rcon-password MINHA_SENHA
# Ctrl+A, D para desanexar
# screen -r cs2agent  para reconectar
```

### Executar como serviço systemd

```bash
sudo tee /etc/systemd/system/cs2-agent.service << 'EOF'
[Unit]
Description=Limitados CS2 Agent
After=network.target

[Service]
Type=simple
User=steam
ExecStart=/usr/bin/python3 /home/steam/cs2_agent.py \
  --token SEU_TOKEN \
  --port 7777 \
  --rcon-host 127.0.0.1 \
  --rcon-port 27015 \
  --rcon-password SENHA_RCON \
  --cs2-dir /home/steam/cs2
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cs2-agent
```

### Registrar o servidor no painel

No painel: **Servidores → + Novo Servidor**

| Campo | Valor |
|-------|-------|
| Nome | Servidor Principal |
| IP | IP público da VPS do CS2 |
| Porta | 27015 |
| Agent URL | `http://IP_DA_VPS:7777` |
| Agent Token | O token que você usou acima |

---

## Configurando o CS2

### server.cfg mínimo

```cfg
# Identificação
hostname "Limitados CS2"
sv_password ""

# RCON (obrigatório para o painel)
rcon_password "MESMA_SENHA_DO_ARGUMENTO_--rcon-password"

# CSTV
tv_enable 1
tv_autorecord 1
tv_delay 30
tv_maxclients 10

# Básico
sv_cheats 0
mp_autoteambalance 1
```

### Script de start (obrigatório para botões Start/Restart)

Crie `/home/steam/cs2/start.sh`:

```bash
#!/bin/bash
cd /home/steam/cs2
./game/bin/linuxSteamRT/srcds_run \
  -game csgo \
  -console \
  -usercon \
  -port 27015 \
  +map de_dust2 \
  +sv_setsteamaccount SEU_GSLT_TOKEN \
  -maxplayers_override 10 \
  -tickrate 128
```

```bash
chmod +x /home/steam/cs2/start.sh
```

---

## SourceMod e Metamod

```bash
# Verificar versões mais recentes em:
# https://www.sourcemod.net/downloads.php
# https://www.metamodsource.net/downloads.php

cd /home/steam/cs2/game/csgo

# Metamod
wget https://mms.alliedmods.net/mmsdrop/2.0/mmsource-2.0.0-gitXXXX-linux.tar.gz
tar xzf mmsource-*.tar.gz

# SourceMod
wget https://sm.alliedmods.net/smdrop/1.12/sourcemod-1.12.0-gitXXXX-linux.tar.gz
tar xzf sourcemod-*.tar.gz
```

Adicione ao `game/csgo/addons/metamod/metaplugins.ini`:
```
addons/sourcemod/bin/sourcemod_mm
```

---

## Sistema de Modos de Jogo

O painel suporta troca dinâmica de modo de jogo sem múltiplas instâncias do servidor.

### Como funciona

1. Cada modo tem: lista de plugins, configs, CVARs, gameType/gameMode
2. Ao ativar um modo, o agente:
   - Move **todos** os `.smx` de `plugins/` para `plugins/disabled/`
   - Move apenas os plugins do modo de `disabled/` para `plugins/`
   - Envia CVARs via RCON
   - Executa configs via RCON
   - Reinicia o servidor

### Estrutura de plugins no servidor

```
addons/sourcemod/plugins/         ← plugins ATIVOS
addons/sourcemod/plugins/disabled/ ← plugins DESATIVADOS
```

### Exemplo de modo Competitive

| Campo | Valor |
|-------|-------|
| Game Type | 0 (Classic) |
| Game Mode | 1 (Competitive) |
| Plugins | `matchzy.smx` |
| Configs | `competitive.cfg` |
| CVARs | `mp_maxrounds=24` |

---

## CSTV e Demos

### Comandos CS2 usados

```cfg
tv_enable 1          # Ativar SourceTV
tv_autorecord 1      # Auto-gravar partidas
tv_delay 30          # Delay de transmissão (segundos)
tv_record nome_demo  # Iniciar gravação manual
tv_stoprecord        # Parar gravação
tv_status            # Status do SourceTV
```

### Localização dos arquivos de demo

```
/home/steam/cs2/game/csgo/*.dem
```

### Funcionalidades do painel

- Iniciar/Pausar/Retomar/Parar gravação
- Status ao vivo com timer e tamanho
- Lista de demos com busca e ordenação
- Download direto pelo navegador
- Renomear e excluir demos
- Limite de armazenamento configurável
- Auto-delete de demos antigas

---

## Docker

```bash
# Build
docker build -t limitados-painel .

# Rodar com docker-compose
docker compose up -d
```

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: limitados_painel
      POSTGRES_USER: limitados
      POSTGRES_PASSWORD: CHANGE_ME
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    image: limitados-painel
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://limitados:CHANGE_ME@db:5432/limitados_painel
      SESSION_SECRET: CHANGE_ME_LONG_SECRET
      PORT: 8080
      NODE_ENV: production
    depends_on:
      - db
    restart: unless-stopped

volumes:
  pgdata:
```

---

## Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL |
| `SESSION_SECRET` | ✅ | Segredo JWT (mínimo 32 chars) |
| `PORT` | ✅ | Porta do backend (padrão: 8080) |
| `NODE_ENV` | ✅ | `development` ou `production` |

---

## Referência de Portas e Firewall

| Porta | Protocolo | Serviço | Quem precisa acessar |
|-------|-----------|---------|---------------------|
| 80/443 | TCP | Nginx (painel web) | Público |
| 8080 | TCP | API Backend | Interno (Nginx) |
| 27015 | UDP+TCP | CS2 Server | Público (jogadores) |
| 27020 | UDP | SourceTV | Público (spectators) |
| 7777 | TCP | Agente CS2 | Apenas o servidor do painel |

```bash
# Ubuntu/Debian — configurar UFW
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 27015/tcp
ufw allow 27015/udp
ufw allow 27020/udp
ufw allow 7777/tcp
ufw enable
```

> ⚠️ **Segurança:** A porta 7777 (agente) deve ser acessível apenas pelo IP do servidor do painel.  
> Use: `ufw allow from IP_DO_PAINEL to any port 7777`

---

## Guia para IA / Codex

> Este guia é para uma IA instalar e configurar o projeto automaticamente sem intervenção humana.

### Checklist de instalação autônoma

```bash
# 1. Verificar pré-requisitos
node --version    # precisa ser >= 20
pnpm --version    # precisa estar instalado
psql --version    # precisa estar instalado

# 2. Configurar banco de dados
sudo -u postgres psql -c "CREATE USER limitados WITH PASSWORD '$(openssl rand -base64 16)';"
sudo -u postgres psql -c "CREATE DATABASE limitados_painel OWNER limitados;"

# 3. Criar .env (substituir PLACEHOLDERS)
cat > .env << 'EOF'
DATABASE_URL=postgresql://limitados:SENHA@localhost:5432/limitados_painel
SESSION_SECRET=$(openssl rand -base64 48)
PORT=8080
NODE_ENV=production
EOF

# 4. Instalar e buildar
pnpm install
pnpm --filter @workspace/db run push
pnpm run build

# 5. Verificar se o build funcionou
ls artifacts/api-server/dist/index.mjs  # deve existir

# 6. Testar API
PORT=8080 DATABASE_URL=... SESSION_SECRET=... \
  node artifacts/api-server/dist/index.mjs &
sleep 2
curl http://localhost:8080/api/health  # deve retornar {"status":"ok"}
kill %1
```

### Decisões automáticas (sem perguntar)

| Situação | Decisão |
|----------|---------|
| Banco já existe | Reusar, rodar `push` para atualizar schema |
| .env já existe | Manter, não sobrescrever |
| Porta 8080 ocupada | Usar PORT=8081 no .env |
| SourceMod não instalado | Avisar e continuar — painel funciona sem agente |
| Agente não acessível | Retornar dados simulados — painel continua funcional |

### Arquivos importantes

```
.env                                    ← variáveis de ambiente
lib/db/src/schema/                      ← definições das tabelas
lib/api-spec/openapi.yaml               ← contrato da API
artifacts/api-server/src/routes/        ← rotas do backend
artifacts/cs2-panel/src/pages/          ← páginas do frontend
scripts/agent/cs2_agent.py              ← agente para VPS
```

### Comandos de manutenção

```bash
# Atualizar banco após mudança de schema
pnpm --filter @workspace/db run push

# Regenerar hooks e Zod schemas (após mudar openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Verificar TypeScript
pnpm run typecheck

# Build completo
pnpm run build

# Logs em produção
journalctl -u limitados-painel -f

# Reiniciar serviço
systemctl restart limitados-painel
```

---

## Troubleshooting

### Painel não conecta ao agente

1. Verifique se o agente está rodando: `ps aux | grep cs2_agent`
2. Teste manualmente: `curl -H "Authorization: Bearer SEU_TOKEN" http://IP_DA_VPS:7777/server/status`
3. Verifique o firewall: `ufw status`
4. Verifique a URL do agente no painel (sem barra no final)

### RCON não funciona

1. Verifique `rcon_password` no `server.cfg` do CS2
2. Teste: `rcon -a IP:27015 -p SENHA status`
3. Certifique-se que a porta 27015 TCP está aberta

### Modos de jogo: plugin não encontrado

- O plugin deve estar em `plugins/` ou `plugins/disabled/`
- O nome deve incluir `.smx` (ex: `matchzy.smx`)
- Verifique o log de troca de modo no painel

### Build falha — bcrypt

```bash
cd artifacts/api-server
pnpm approve-builds
# Selecionar bcrypt na lista
pnpm install
```

### Erro de banco de dados

```bash
# Verificar conexão
psql "$DATABASE_URL" -c "SELECT 1;"

# Recriar tabelas (CUIDADO: apaga dados)
pnpm --filter @workspace/db run push-force
```

---

## Login Padrão

| Usuário | Senha | Role |
|---------|-------|------|
| `admin` | `admin` | Administrador |
| `operator` | `admin` | Operador |

> ⚠️ **Mude as senhas padrão imediatamente após o primeiro acesso.**

---

## Licença

MIT
