import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { 
  useGetServer, 
  useGetServerStatus, 
  useStartServer, 
  useStopServer, 
  useRestartServer, 
  useUpdateServerFiles,
  useGetServerLogs,
  useSendRconCommand,
  useListPlayers,
  useKickPlayer,
  useBanPlayer,
  useMutePlayer,
  useListPlugins,
  useEnablePlugin,
  useDisablePlugin,
  useListAdmins,
  useUpsertAdmin,
  useDeleteAdmin,
  getGetServerStatusQueryKey,
  getListPlayersQueryKey,
  getListPluginsQueryKey,
  getListAdminsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Play, Square, RotateCcw, DownloadCloud, Terminal, 
  Activity, Cpu, MemoryStick, Clock, Users, Map, ShieldAlert,
  ShieldOff, Ban, MessageSquareOff, UserPlus, Trash2, Search, Pencil, Plus, Settings
} from "lucide-react";
import { ModesTab } from "@/components/ModesTab";
import { CSTVTab } from "@/components/CSTVTab";
import { cn } from "@/lib/utils";

const TRIGGER_CLASS = "rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-5 flex-shrink-0";

export default function ServerDetail() {
  const [, params] = useRoute("/servers/:id");
  const serverId = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: server, isLoading: serverLoading } = useGetServer(serverId, {
    query: { enabled: !!serverId }
  });

  const { data: status, isLoading: statusLoading } = useGetServerStatus(serverId, {
    query: { enabled: !!serverId, refetchInterval: 5000 }
  });

  const startMutation = useStartServer();
  const stopMutation = useStopServer();
  const restartMutation = useRestartServer();
  const updateMutation = useUpdateServerFiles();

  const handleAction = (mutation: any, actionName: string) => {
    mutation.mutate({ serverId }, {
      onSuccess: () => {
        toast({ title: "Comando enviado", description: `${actionName} executado com sucesso.` });
        queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey(serverId) });
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err.message || "Falha ao executar comando", variant: "destructive" });
      }
    });
  };

  if (serverLoading) return <div className="p-6"><Skeleton className="h-64 w-full bg-card" /></div>;
  if (!server) return <div className="p-6 text-destructive font-mono">Servidor nÃ£o encontrado</div>;

  const isOnline = status?.online;
  const isReachable = status?.agentReachable;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold font-mono tracking-widest text-foreground">{server.name}</h1>
            {statusLoading ? <Skeleton className="h-6 w-20 bg-muted" /> :
              !isReachable
                ? <Badge variant="destructive" className="uppercase text-[10px] tracking-wider font-mono">Agente Off</Badge>
                : isOnline
                  ? <Badge className="bg-primary/20 text-primary border border-primary/40 uppercase text-[10px] tracking-wider font-mono"><span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse inline-block" />Online</Badge>
                  : <Badge variant="secondary" className="uppercase text-[10px] tracking-wider font-mono">Offline</Badge>
            }
            {status && isReachable && (
              <span className="text-xs font-mono text-muted-foreground">
                {status.playerCount}/{status.maxPlayers} jogadores
                {status.map ? ` - ${status.map}` : ""}
              </span>
            )}
          </div>
          <p className="text-primary font-mono text-xs">{server.ip}:{server.port}</p>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="font-mono text-xs uppercase tracking-wider bg-primary hover:bg-primary/80 text-primary-foreground"
            disabled={!isReachable || !!isOnline || startMutation.isPending}
            onClick={() => handleAction(startMutation, "Start")}
            data-testid="btn-start"
          >
            <Play className="w-4 h-4 mr-1.5" /> Iniciar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="font-mono text-xs uppercase tracking-wider"
            disabled={!isReachable || !isOnline || stopMutation.isPending}
            onClick={() => handleAction(stopMutation, "Stop")}
            data-testid="btn-stop"
          >
            <Square className="w-4 h-4 mr-1.5" /> Parar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs uppercase tracking-wider border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
            disabled={!isReachable || restartMutation.isPending}
            onClick={() => handleAction(restartMutation, "Restart")}
            data-testid="btn-restart"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" /> Reiniciar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="font-mono text-xs uppercase tracking-wider"
            disabled={!isReachable || !!isOnline || updateMutation.isPending}
            onClick={() => handleAction(updateMutation, "Update")}
            title="Servidor deve estar parado para atualizar"
            data-testid="btn-update"
          >
            <DownloadCloud className="w-4 h-4 mr-1.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border w-full justify-start rounded-none h-12 p-0 overflow-x-auto flex">
          <TabsTrigger value="overview" className={TRIGGER_CLASS}>Overview</TabsTrigger>
          <TabsTrigger value="modos" className={TRIGGER_CLASS}>Modos</TabsTrigger>
          <TabsTrigger value="players" className={TRIGGER_CLASS}>Players</TabsTrigger>
          <TabsTrigger value="admins" className={TRIGGER_CLASS}>Admins</TabsTrigger>
          <TabsTrigger value="maps" className={TRIGGER_CLASS}>Maps</TabsTrigger>
          <TabsTrigger value="plugins" className={TRIGGER_CLASS}>Plugins</TabsTrigger>
          <TabsTrigger value="cstv" className={TRIGGER_CLASS}>CSTV</TabsTrigger>
          <TabsTrigger value="logs" className={TRIGGER_CLASS}>Logs</TabsTrigger>
          <TabsTrigger value="console" className={TRIGGER_CLASS}>Console</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <OverviewTab serverId={serverId} status={status} isLoading={statusLoading} />
          </TabsContent>
          <TabsContent value="modos">
            <ModesTab serverId={serverId} />
          </TabsContent>
          <TabsContent value="players">
            <PlayersTab serverId={serverId} status={status} />
          </TabsContent>
          <TabsContent value="admins">
            <AdminsTab serverId={serverId} status={status} />
          </TabsContent>
          <TabsContent value="maps">
            <MapsTab serverId={serverId} status={status} />
          </TabsContent>
          <TabsContent value="plugins">
            <PluginsTab serverId={serverId} status={status} />
          </TabsContent>
          <TabsContent value="cstv">
            <CSTVTab serverId={serverId} />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab serverId={serverId} />
          </TabsContent>
          <TabsContent value="console">
            <ConsoleTab serverId={serverId} status={status} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// â”€â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function quoteRconValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function OverviewTab({ serverId, status, isLoading }: any) {
  const { toast } = useToast();
  const rconMutation = useSendRconCommand();
  const [serverName, setServerName] = useState("Limitados Skins");
  const [serverPassword, setServerPassword] = useState("");
  const [visiblePlayers, setVisiblePlayers] = useState(String(status?.maxPlayers ?? 20));
  const [serverTags, setServerTags] = useState("br,limitados,skins");
  const [botQuota, setBotQuota] = useState("0");
  const [freezeTime, setFreezeTime] = useState("15");
  const [roundTime, setRoundTime] = useState("1.92");
  const [startMoney, setStartMoney] = useState("800");

  useEffect(() => {
    if (status?.maxPlayers) setVisiblePlayers(String(status.maxPlayers));
  }, [status?.maxPlayers]);

  const runRcon = (command: string, label: string) => {
    if (!command.trim() || rconMutation.isPending) return;
    rconMutation.mutate(
      { serverId, data: { command } },
      {
        onSuccess: () => toast({ title: "Config aplicada", description: label }),
        onError: (err: any) => toast({
          title: "Falha ao aplicar",
          description: err?.message ?? command,
          variant: "destructive",
        }),
      },
    );
  };

  const applyPublicPreset = () => runRcon(
    [
      "sv_lan 0",
      "sv_password \"\"",
      "bot_quota 0",
      "mp_autoteambalance 1",
      "mp_limitteams 2",
      "mp_restartgame 1",
    ].join("; "),
    "Servidor publico aplicado.",
  );

  const applyMatchPreset = () => runRcon(
    [
      "bot_quota 0",
      "mp_freezetime 15",
      "mp_roundtime 1.92",
      "mp_maxrounds 24",
      "mp_halftime 1",
      "mp_startmoney 800",
      "mp_restartgame 1",
    ].join("; "),
    "Preset competitivo aplicado.",
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: Users, label: "Players", value: isLoading ? "-" : `${status?.playerCount ?? 0}/${status?.maxPlayers ?? 0}` },
          { icon: Map,   label: "Mapa",    value: isLoading ? "-" : (status?.map ?? "-"), primary: true },
          { icon: Cpu,   label: "CPU",     value: isLoading ? "-" : `${status?.cpuUsage?.toFixed(1) ?? 0}%` },
          { icon: MemoryStick, label: "RAM", value: isLoading ? "-" : `${status?.ramUsage ?? 0} MB` },
          { icon: Clock, label: "Uptime",  value: isLoading ? "-" : (status?.uptime ?? "0s") },
        ].map(({ icon: Icon, label, value, primary }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="pt-5 pb-4">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
                <Icon className="w-3 h-3" /> {label}
              </span>
              <div className={cn("text-2xl font-bold font-mono truncate", primary ? "text-primary" : "")}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center gap-2 text-primary">
            <Settings className="w-4 h-4" /> Configuracao Rapida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Nome</Label>
              <div className="flex gap-2">
                <Input value={serverName} onChange={(e) => setServerName(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending || !serverName.trim()}
                  onClick={() => runRcon(`hostname ${quoteRconValue(serverName.trim())}`, "Nome atualizado.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Senha</Label>
              <div className="flex gap-2">
                <Input value={serverPassword} onChange={(e) => setServerPassword(e.target.value)} placeholder="vazio = publico" className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`sv_password ${quoteRconValue(serverPassword)}`, serverPassword ? "Senha aplicada." : "Senha removida.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Max players visivel</Label>
              <div className="flex gap-2">
                <Input type="number" min="1" max="64" value={visiblePlayers} onChange={(e) => setVisiblePlayers(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending || !visiblePlayers.trim()}
                  onClick={() => runRcon(`sv_visiblemaxplayers ${Number(visiblePlayers) || -1}`, "Slots visiveis atualizados.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Tags</Label>
              <div className="flex gap-2">
                <Input value={serverTags} onChange={(e) => setServerTags(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`sv_tags ${quoteRconValue(serverTags)}`, "Tags atualizadas.")}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Bots</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" max="32" value={botQuota} onChange={(e) => setBotQuota(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`bot_quota ${Number(botQuota) || 0}; bot_quota_mode normal`, "Bots atualizados.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Freezetime</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" max="60" value={freezeTime} onChange={(e) => setFreezeTime(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`mp_freezetime ${Number(freezeTime) || 0}`, "Freezetime atualizado.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Roundtime</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" step="0.01" value={roundTime} onChange={(e) => setRoundTime(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`mp_roundtime ${Number(roundTime) || 0}`, "Roundtime atualizado.")}
                >
                  Salvar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Start money</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" max="16000" value={startMoney} onChange={(e) => setStartMoney(e.target.value)} className="font-mono text-xs bg-background/50" />
                <Button
                  size="sm"
                  disabled={rconMutation.isPending}
                  onClick={() => runRcon(`mp_startmoney ${Number(startMoney) || 0}`, "Start money atualizado.")}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={applyPublicPreset}>Publico</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={applyMatchPreset}>Competitivo</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("mp_friendlyfire 1", "Friendly fire ligado.")}>FF ON</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("mp_friendlyfire 0", "Friendly fire desligado.")}>FF OFF</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("mp_autoteambalance 1; mp_limitteams 2", "Balanco ligado.")}>Balance ON</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("mp_autoteambalance 0; mp_limitteams 0", "Balanco desligado.")}>Balance OFF</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("sv_lan 0; status", "Modo publico/VAC verificado.")}>VAC/status</Button>
            <Button variant="outline" size="sm" disabled={rconMutation.isPending} onClick={() => runRcon("mp_restartgame 1", "Partida reiniciada.")}>Restart</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// â”€â”€â”€ Players â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PlayersTab({ serverId, status }: { serverId: number; status: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: players, isLoading } = useListPlayers(serverId, {
    query: { enabled: !!serverId, refetchInterval: 10000 }
  });

  const kickMutation  = useKickPlayer();
  const banMutation   = useBanPlayer();
  const muteMutation  = useMutePlayer();

  const handleAction = (mutation: any, steamId: string, desc: string) => {
    mutation.mutate({ serverId, steamId, data: { reason: "Admin action" } }, {
      onSuccess: () => {
        toast({ title: "Comando enviado", description: `Jogador ${desc} com sucesso.` });
        queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(serverId) });
      },
      onError: () => toast({ title: "Erro", description: "Falha ao executar comando", variant: "destructive" }),
    });
  };

  if (!status?.online) {
    return <EmptyState text="Servidor precisa estar online" />;
  }

  return (
    <Card className="bg-card border-border overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/20">
          <TableRow className="border-border">
            <TableHead className="font-mono text-xs uppercase tracking-wider">Jogador</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider">SteamID</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Score</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Ping</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Tempo</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">AÃ§Ãµes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center p-6 text-muted-foreground font-mono text-xs">Carregando...</TableCell></TableRow>
          ) : !players?.length ? (
            <TableRow><TableCell colSpan={6} className="text-center p-10 text-muted-foreground font-mono text-sm">Nenhum jogador conectado</TableCell></TableRow>
          ) : players.map((player) => (
            <TableRow key={player.steamId} className="border-border/50">
              <TableCell className="font-medium">{player.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{player.steamId}</TableCell>
              <TableCell className="text-right font-mono text-primary">{player.score}</TableCell>
              <TableCell className={cn("text-right font-mono text-xs", player.ping > 100 ? "text-destructive" : player.ping > 50 ? "text-yellow-500" : "text-primary")}>
                {player.ping}ms
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{player.duration}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button variant="outline" size="icon" className="h-7 w-7 hover:bg-yellow-500/20 hover:text-yellow-500 hover:border-yellow-500/30" onClick={() => handleAction(muteMutation, player.steamId, "mutado")} title="Mutar">
                  <MessageSquareOff className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 hover:bg-orange-500/20 hover:text-orange-500 hover:border-orange-500/30" onClick={() => handleAction(kickMutation, player.steamId, "kickado")} title="Kick">
                  <ShieldOff className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 hover:bg-destructive/20 text-destructive hover:border-destructive/30" onClick={() => handleAction(banMutation, player.steamId, "banido")} title="Ban">
                  <Ban className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// â”€â”€â”€ Admins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CSS_FLAGS = [
  { value: "@css/root", label: "@css/root - acesso total" },
  { value: "@css/admin", label: "@css/admin - admin geral" },
  { value: "@css/ban", label: "@css/ban - banimentos" },
  { value: "@css/kick", label: "@css/kick - expulsar jogadores" },
  { value: "@css/changemap", label: "@css/changemap - trocar mapa" },
  { value: "@css/cvar", label: "@css/cvar - alterar cvars" },
];

type AdminEntry = { steamId: string; name: string; flags: string; immunity: number };

function AdminsTab({ serverId, status }: { serverId: number; status: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: admins = [], isLoading } = useListAdmins(serverId, {
    query: { enabled: !!serverId },
  });
  const upsertAdminMutation = useUpsertAdmin();
  const deleteAdminMutation = useDeleteAdmin();

  const [steamId, setSteamId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [flags, setFlags] = useState("@css/root");
  const [immunity, setImmunity] = useState("50");

  const addAdmin = () => {
    if (!steamId.trim()) {
      toast({ title: "SteamID obrigatÃ³rio", variant: "destructive" });
      return;
    }
    const entry: AdminEntry = { steamId: steamId.trim(), name: adminName.trim() || steamId.trim(), flags, immunity: parseInt(immunity) || 50 };
    upsertAdminMutation.mutate({ serverId, data: entry }, {
      onSuccess: () => {
        toast({ title: "Admin salvo", description: `${entry.name} foi gravado no admins.json.` });
        queryClient.invalidateQueries({ queryKey: getListAdminsQueryKey(serverId) });
        setSteamId(""); setAdminName(""); setFlags("@css/root"); setImmunity("50");
      },
      onError: (err: any) => toast({ title: "Erro ao salvar admin", description: err.message || "Falha ao atualizar admins.json.", variant: "destructive" }),
    });
  };

  const removeAdmin = (a: AdminEntry) => {
    deleteAdminMutation.mutate({ serverId, steamId: a.steamId }, {
      onSuccess: () => {
        toast({ title: "Admin removido", description: `${a.name} saiu do admins.json.` });
        queryClient.invalidateQueries({ queryKey: getListAdminsQueryKey(serverId) });
      },
      onError: (err: any) => toast({ title: "Erro ao remover admin", description: err.message || "Falha ao atualizar admins.json.", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Add Admin */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" /> Adicionar Admin
          </CardTitle>
          <CardDescription className="text-xs font-mono">Edita o arquivo CounterStrikeSharp admins.json na VPS</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">SteamID / SteamID64</Label>
              <Input
                value={steamId}
                onChange={e => setSteamId(e.target.value)}
                placeholder="STEAM_0:0:000000 ou 76561198..."
                className="font-mono text-xs bg-background/50"
                data-testid="input-admin-steamid"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Nome (opcional)</Label>
              <Input
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="Nome do admin"
                className="font-mono text-xs bg-background/50"
                data-testid="input-admin-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Flags</Label>
              <Select value={flags} onValueChange={setFlags}>
                <SelectTrigger className="font-mono text-xs bg-background/50" data-testid="select-admin-flags">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CSS_FLAGS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="font-mono text-xs">{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Imunidade (0-100)</Label>
              <div className="flex gap-2">
                <Input
                  value={immunity}
                  onChange={e => setImmunity(e.target.value)}
                  type="number"
                  min="0" max="100"
                  className="font-mono text-xs bg-background/50"
                  data-testid="input-admin-immunity"
                />
                <Button onClick={addAdmin} disabled={upsertAdminMutation.isPending} className="font-mono text-xs uppercase shrink-0" data-testid="btn-add-admin">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <CardTitle className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> Admins Ativos
            <Badge variant="secondary" className="font-mono text-xs ml-1">{admins.length}</Badge>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow className="border-border">
              <TableHead className="font-mono text-xs uppercase tracking-wider">Nome</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">SteamID</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-center">Flags</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-center">Imunidade</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider text-right">AÃ§Ã£o</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center p-10 text-muted-foreground font-mono text-sm">Carregando admins...</TableCell>
              </TableRow>
            ) : admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center p-10 text-muted-foreground font-mono text-sm">Nenhum admin cadastrado</TableCell>
              </TableRow>
            ) : admins.map((a) => (
              <TableRow key={a.steamId} className="border-border/50">
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.steamId}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/30">{a.flags}</Badge>
                </TableCell>
                <TableCell className="text-center font-mono text-xs">{a.immunity}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 hover:bg-destructive/20 text-destructive hover:border-destructive/30"
                    onClick={() => removeAdmin(a)}
                    title="Remover admin"
                    data-testid={`btn-remove-admin-${a.steamId}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// â”€â”€â”€ Maps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CS2_MAPS = [
  { id: "de_dust2",      name: "Dust II",        type: "Oficial" },
  { id: "de_mirage",     name: "Mirage",         type: "Oficial" },
  { id: "de_inferno",    name: "Inferno",        type: "Oficial" },
  { id: "de_nuke",       name: "Nuke",           type: "Oficial" },
  { id: "de_ancient",    name: "Ancient",        type: "Oficial" },
  { id: "de_anubis",     name: "Anubis",         type: "Oficial" },
  { id: "de_train",      name: "Train",          type: "Oficial" },
  { id: "de_vertigo",    name: "Vertigo",        type: "Oficial" },
  { id: "de_overpass",   name: "Overpass",       type: "Oficial" },
  { id: "cs_office",     name: "Office",         type: "Oficial" },
  { id: "cs_italy",      name: "Italy",          type: "Oficial" },
  { id: "ar_shoots",     name: "Shoots",         type: "Arms Race" },
  { id: "ar_baggage",    name: "Baggage",        type: "Arms Race" },
];

function MapsTab({ serverId, status }: { serverId: number; status: any }) {
  const { toast } = useToast();
  const rconMutation = useSendRconCommand();
  const [workshopId, setWorkshopId] = useState("");
  const [search, setSearch] = useState("");

  const sendCommand = (command: string, successMessage: string) => {
    if (!status?.online) {
      toast({ title: "Servidor offline", description: "Servidor precisa estar online.", variant: "destructive" });
      return;
    }
    rconMutation.mutate({ serverId, data: { command } }, {
      onSuccess: () => toast({ title: "Comando enviado", description: successMessage }),
      onError: () => toast({ title: "Erro", description: "Falha ao trocar mapa.", variant: "destructive" }),
    });
  };

  const sendMap = (mapId: string, label: string) => {
    sendCommand(`changelevel ${mapId}`, `Carregando ${label}...`);
  };

  const loadWorkshop = () => {
    const id = workshopId.trim();
    if (!id) return;
    sendCommand(`host_workshop_map ${id}`, `Carregando mapa da Oficina ${id}...`);
    setWorkshopId("");
  };

  const filtered = CS2_MAPS.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Workshop */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
            <Map className="w-4 h-4 text-primary" /> Mapa da Oficina (Workshop)
          </CardTitle>
          <CardDescription className="text-xs font-mono">Cole o ID do mapa da Oficina do Steam</CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex gap-3">
            <Input
              value={workshopId}
              onChange={e => setWorkshopId(e.target.value)}
              placeholder="Ex: 3070293536"
              className="font-mono text-sm bg-background/50"
              data-testid="input-workshop-id"
            />
            <Button
              onClick={loadWorkshop}
              disabled={!workshopId.trim() || rconMutation.isPending}
              className="font-mono text-xs uppercase tracking-wider shrink-0"
              data-testid="btn-load-workshop"
            >
              Carregar Workshop
            </Button>
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-2">
            EnviarÃ¡: <span className="text-primary">host_workshop_map {"<ID>"}</span>
          </p>
        </CardContent>
      </Card>

      {/* Official Maps */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Mapas Oficiais</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar mapa..."
                className="pl-8 h-8 font-mono text-xs bg-background/50 w-48"
                data-testid="input-map-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((map) => {
              const isCurrent = status?.map === map.id;
              return (
                <button
                  key={map.id}
                  onClick={() => sendMap(map.id, map.name)}
                  disabled={rconMutation.isPending || !status?.online}
                  data-testid={`btn-map-${map.id}`}
                  className={cn(
                    "group relative p-4 rounded-md border text-left transition-all duration-150",
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-foreground hover:border-primary/50 hover:bg-primary/5",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <div className="font-bold text-sm font-mono truncate">{map.name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{map.id}</div>
                  <Badge variant="outline" className="mt-2 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0">
                    {map.type}
                  </Badge>
                  {isCurrent && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// â”€â”€â”€ Plugins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PluginsTab({ serverId, status }: { serverId: number; status: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: plugins, isLoading } = useListPlugins(serverId, {
    query: { enabled: !!serverId && status?.agentReachable }
  });

  const enableMutation  = useEnablePlugin();
  const disableMutation = useDisablePlugin();

  const togglePlugin = (pluginId: string, enabled: boolean) => {
    const mutation = enabled ? disableMutation : enableMutation;
    mutation.mutate({ serverId, pluginId }, {
      onSuccess: () => {
        toast({ title: "Plugin atualizado" });
        queryClient.invalidateQueries({ queryKey: getListPluginsQueryKey(serverId) });
      },
      onError: () => toast({ title: "Erro", description: "Falha ao alterar plugin", variant: "destructive" }),
    });
  };

  if (!status?.agentReachable) return <EmptyState text="Agente inacessÃ­vel" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {isLoading
        ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 bg-card" />)
        : !plugins?.length
          ? <div className="col-span-full p-12 text-center text-muted-foreground border border-dashed border-border rounded-lg font-mono text-sm">Nenhum plugin instalado</div>
          : plugins.map((plugin) => (
            <Card key={plugin.id} className={cn("bg-card border-border transition-colors", plugin.enabled ? "border-primary/30" : "opacity-60")}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                <div className="flex-1 min-w-0 pr-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 truncate">
                    {plugin.name}
                    {plugin.enabled && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs mt-0.5">v{plugin.version}{plugin.author ? ` - ${plugin.author}` : ""}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-7 px-2 font-mono text-[10px] uppercase flex-shrink-0",
                    plugin.enabled
                      ? "border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      : "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                  )}
                  onClick={() => togglePlugin(plugin.id, plugin.enabled)}
                  disabled={enableMutation.isPending || disableMutation.isPending}
                >
                  {plugin.enabled ? "Desativar" : "Ativar"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-2">{plugin.description}</p>
              </CardContent>
            </Card>
          ))
      }
    </div>
  );
}

// â”€â”€â”€ Logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LogsTab({ serverId }: { serverId: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: logs, isLoading } = useGetServerLogs(serverId, { lines: 100 }, {
    query: { enabled: !!serverId, refetchInterval: 5000 }
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const levelColor = (level: string) => ({
    error: "text-destructive", warn: "text-yellow-500", debug: "text-muted-foreground"
  }[level] ?? "text-foreground");

  return (
    <Card className="bg-[#0a0a0c] border-border overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/50 bg-black/40">
        <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center text-muted-foreground">
          <Terminal className="w-3 h-3 mr-2" /> Server Output Stream
        </CardTitle>
      </CardHeader>
      <ScrollArea className="h-[500px]" ref={scrollRef}>
        <div className="p-4 font-mono text-xs leading-relaxed space-y-1">
          {isLoading && !logs
            ? <div className="text-primary animate-pulse">Conectando stream...</div>
            : !logs?.length
              ? <div className="text-muted-foreground">Sem logs disponÃ­veis</div>
              : logs.map((log) => (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 px-1 rounded">
                  <span className="text-muted-foreground opacity-50 shrink-0 w-[140px]">{log.timestamp.split('T')[1]?.replace('Z','') ?? log.timestamp}</span>
                  <span className={cn("shrink-0 uppercase w-12", levelColor(log.level))}>{log.level}</span>
                  <span className={cn("break-all", levelColor(log.level))}>{log.message}</span>
                </div>
              ))
          }
        </div>
      </ScrollArea>
    </Card>
  );
}

// â”€â”€â”€ Console â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type QuickCommand = { label: string; cmd: string };
type QuickCommandGroup = { category: string; cmds: QuickCommand[] };
type CustomQuickCommand = QuickCommand & { id: string; category: string };

const CUSTOM_QUICK_COMMANDS_KEY = "limitados.quickCommands.v1";
const emptyCustomCommand = () => ({ category: "Meus Comandos", label: "", cmd: "" });

const QUICK_COMMANDS: QuickCommandGroup[] = [
  {
    category: "Partida",
    cmds: [
      { label: "Reiniciar Partida", cmd: "mp_restartgame 1" },
      { label: "Encerrar Warmup", cmd: "mp_warmup_end" },
      { label: "Iniciar Warmup", cmd: "mp_warmup_start" },
      { label: "Freezetime 0", cmd: "mp_freezetime 0" },
      { label: "Freezetime 15", cmd: "mp_freezetime 15" },
      { label: "Restart Round", cmd: "mp_restartgame 3" },
    ],
  },
  {
    category: "Bots",
    cmds: [
      { label: "Remover Bots", cmd: "bot_kick" },
      { label: "Matar Bots", cmd: "bot_kill" },
      { label: "Add Bot CT", cmd: "bot_add_ct" },
      { label: "Add Bot TR", cmd: "bot_add_t" },
      { label: "Bot Quota 0", cmd: "bot_quota 0" },
      { label: "Bot Quota 10", cmd: "bot_quota 10" },
      { label: "Bot Normal", cmd: "bot_difficulty 2" },
      { label: "Bot Expert", cmd: "bot_difficulty 4" },
    ],
  },
  {
    category: "Regras",
    cmds: [
      { label: "FF Ligado", cmd: "mp_friendlyfire 1" },
      { label: "FF Desligado", cmd: "mp_friendlyfire 0" },
      { label: "Balanco Auto ON", cmd: "mp_autoteambalance 1" },
      { label: "Balanco Auto OFF", cmd: "mp_autoteambalance 0" },
      { label: "Halftime ON", cmd: "mp_halftime 1" },
      { label: "Halftime OFF", cmd: "mp_halftime 0" },
      { label: "30 Rounds", cmd: "mp_maxrounds 30" },
      { label: "24 Rounds", cmd: "mp_maxrounds 24" },
    ],
  },
  {
    category: "Jogadores",
    cmds: [
      { label: "Dinheiro Inicial 800", cmd: "mp_startmoney 800" },
      { label: "Dinheiro Inicial 16000", cmd: "mp_startmoney 16000" },
      { label: "Comprar em Qualquer Lugar", cmd: "mp_buy_anywhere 1" },
      { label: "Comprar na Base", cmd: "mp_buy_anywhere 0" },
      { label: "Buytime 20s", cmd: "mp_buytime 20" },
      { label: "Buytime 90s", cmd: "mp_buytime 90" },
      { label: "Impactos ON", cmd: "sv_showimpacts 1" },
      { label: "Impactos OFF", cmd: "sv_showimpacts 0" },
    ],
  },
  {
    category: "Servidor",
    cmds: [
      { label: "Status", cmd: "status" },
      { label: "Stats", cmd: "stats" },
      { label: "Players", cmd: "users" },
      { label: "Bans SteamID", cmd: "listid" },
      { label: "Bans IP", cmd: "listip" },
      { label: "Metamod", cmd: "meta list" },
      { label: "CSS Plugins", cmd: "css_plugins list" },
      { label: "Versao", cmd: "version" },
    ],
  },
];

function ConsoleTab({ serverId, status }: { serverId: number; status: any }) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<{ type: "req" | "res" | "err"; text: string }[]>([]);
  const [showQuick, setShowQuick] = useState(true);
  const [customCommands, setCustomCommands] = useState<CustomQuickCommand[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_QUICK_COMMANDS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.label && item?.cmd) : [];
    } catch {
      return [];
    }
  });
  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [commandForm, setCommandForm] = useState(emptyCustomCommand);
  const rconMutation = useSendRconCommand();
  const scrollRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_QUICK_COMMANDS_KEY, JSON.stringify(customCommands));
  }, [customCommands]);

  const customGroups = customCommands.reduce<QuickCommandGroup[]>((groups, item) => {
    const category = item.category.trim() || "Meus Comandos";
    const group = groups.find((g) => g.category === category);
    const commandItem = { label: item.label, cmd: item.cmd };
    if (group) group.cmds.push(commandItem);
    else groups.push({ category, cmds: [commandItem] });
    return groups;
  }, []);
  const quickCommandGroups = [...QUICK_COMMANDS, ...customGroups];

  const editInConsole = (cmd: string) => {
    setCommand(cmd);
    window.requestAnimationFrame(() => commandInputRef.current?.focus());
  };

  const openAddCommand = () => {
    setEditingCommandId(null);
    setCommandForm(emptyCustomCommand());
    setIsCommandDialogOpen(true);
  };

  const openEditCustomCommand = (item: CustomQuickCommand) => {
    setEditingCommandId(item.id);
    setCommandForm({ category: item.category, label: item.label, cmd: item.cmd });
    setIsCommandDialogOpen(true);
  };

  const saveCustomCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const category = commandForm.category.trim() || "Meus Comandos";
    const label = commandForm.label.trim();
    const cmd = commandForm.cmd.trim();
    if (!label || !cmd) return;

    if (editingCommandId) {
      setCustomCommands((items) => items.map((item) => (
        item.id === editingCommandId ? { ...item, category, label, cmd } : item
      )));
    } else {
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      setCustomCommands((items) => [...items, { id, category, label, cmd }]);
    }

    setIsCommandDialogOpen(false);
    setEditingCommandId(null);
    setCommandForm(emptyCustomCommand());
  };

  const deleteCustomCommand = (cmd: string) => {
    setCustomCommands((items) => items.filter((item) => item.cmd !== cmd));
  };

  const execCommand = (cmd: string) => {
    if (!cmd.trim()) return;
    setHistory(h => [...h, { type: "req", text: `> ${cmd}` }]);
    rconMutation.mutate({ serverId, data: { command: cmd } }, {
      onSuccess: (res: any) => {
        const text = res?.data?.response ?? res?.response ?? "OK - comando executado.";
        setHistory(h => [...h, { type: "res", text }]);
      },
      onError: (err: any) => {
        const text = err?.message ?? "Falha ao executar comando.";
        setHistory(h => [...h, { type: "err", text: `[ERRO] ${text}` }]);
      },
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || rconMutation.isPending) return;
    const cmd = command.trim();
    setCommand("");
    execCommand(cmd);
  };

  return (
    <div className="space-y-3">
      {/* Quick Commands Panel */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
          <button
            className="font-mono text-xs uppercase tracking-widest text-primary flex items-center gap-2 hover:text-primary/80"
            onClick={() => setShowQuick(v => !v)}
            data-testid="btn-toggle-quickcmds"
          >
            <Terminal className="w-3.5 h-3.5" /> Comandos Rapidos
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {showQuick ? "recolher" : "expandir"}
            </span>
          </button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openAddCommand}
            className="h-7 px-2 font-mono text-[10px] uppercase tracking-wider"
            data-testid="btn-add-quickcmd"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </Button>
        </div>

        {showQuick && (
          <div className="p-4 space-y-5">
            {quickCommandGroups.map(({ category, cmds }) => (
              <div key={category}>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2.5 pb-1 border-b border-border/30">
                  {category}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                  {cmds.map(({ label, cmd }) => {
                    const customItem = customCommands.find((item) => item.cmd === cmd);
                    return (
                      <div key={`${category}-${cmd}`} className="relative group">
                        <button
                          onClick={() => execCommand(cmd)}
                          disabled={rconMutation.isPending}
                          title={cmd}
                          data-testid={`btn-qcmd-${cmd.replace(/\s+/g, "-")}`}
                          className={cn(
                            "w-full text-left px-3 py-2 pr-16 rounded border font-mono text-xs transition-all duration-100",
                            "border-border bg-muted/20 text-foreground",
                            "hover:border-primary hover:bg-primary/10 hover:text-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "active:scale-[0.97]"
                          )}
                        >
                          <span className="block font-medium leading-tight truncate">{label}</span>
                          <span className="block text-[9px] text-muted-foreground group-hover:text-primary/60 mt-0.5 truncate">{cmd}</span>
                        </button>
                        <div className="absolute right-1.5 top-1.5 flex gap-1">
                          <button
                            type="button"
                            onClick={() => customItem ? openEditCustomCommand(customItem) : editInConsole(cmd)}
                            title={customItem ? "Editar atalho" : "Editar no RCON"}
                            className="h-6 w-6 rounded border border-border bg-background/80 text-muted-foreground hover:text-primary hover:border-primary"
                            data-testid={`btn-edit-qcmd-${cmd.replace(/\s+/g, "-")}`}
                          >
                            <Pencil className="w-3 h-3 mx-auto" />
                          </button>
                          {customItem && (
                            <button
                              type="button"
                              onClick={() => deleteCustomCommand(cmd)}
                              title="Remover atalho"
                              className="h-6 w-6 rounded border border-border bg-background/80 text-muted-foreground hover:text-destructive hover:border-destructive"
                              data-testid={`btn-delete-qcmd-${cmd.replace(/\s+/g, "-")}`}
                            >
                              <Trash2 className="w-3 h-3 mx-auto" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={isCommandDialogOpen} onOpenChange={setIsCommandDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest">
              {editingCommandId ? "Editar Comando" : "Adicionar Comando"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCustomCommand} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider">Categoria</Label>
              <Input
                value={commandForm.category}
                onChange={(e) => setCommandForm((form) => ({ ...form, category: e.target.value }))}
                placeholder="Meus Comandos"
                className="font-mono text-sm bg-background/50"
                data-testid="input-quickcmd-category"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider">Nome do botao</Label>
              <Input
                value={commandForm.label}
                onChange={(e) => setCommandForm((form) => ({ ...form, label: e.target.value }))}
                placeholder="Trocar para Mirage"
                className="font-mono text-sm bg-background/50"
                data-testid="input-quickcmd-label"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider">Comando RCON</Label>
              <Input
                value={commandForm.cmd}
                onChange={(e) => setCommandForm((form) => ({ ...form, cmd: e.target.value }))}
                placeholder="changelevel de_mirage"
                className="font-mono text-sm bg-background/50"
                data-testid="input-quickcmd-command"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCommandDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!commandForm.label.trim() || !commandForm.cmd.trim()}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Terminal */}
      <Card className="bg-[#0a0a0c] border-border overflow-hidden flex flex-col h-[380px]">
        <CardHeader className="py-2.5 px-4 border-b border-border/50 bg-black/40 flex-shrink-0">
          <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center gap-2 text-primary">
            <Terminal className="w-3 h-3" /> RCON
            {status?.online
              ? <span className="text-primary">- ONLINE</span>
              : <span className="text-muted-foreground">- OFFLINE</span>}
            {rconMutation.isPending && <span className="text-yellow-500 animate-pulse">- enviando...</span>}
          </CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4 font-mono text-xs leading-relaxed space-y-0.5">
            <div className="text-muted-foreground/60 mb-3 text-[10px]">
              Sessao iniciada - {new Date().toLocaleTimeString("pt-BR")}
            </div>
            {history.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap py-0.5",
                  entry.type === "req" ? "text-primary font-medium mt-1.5" :
                  entry.type === "err" ? "text-destructive" :
                  "text-foreground/75"
                )}
              >
                {entry.text}
              </div>
            ))}
            {rconMutation.isPending && (
              <div className="text-yellow-500/70 animate-pulse text-[10px]">aguardando resposta...</div>
            )}
          </div>
        </ScrollArea>
        <div className="p-2.5 border-t border-border/50 bg-black/40 flex-shrink-0">
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              ref={commandInputRef}
              value={command}
              onChange={e => setCommand(e.target.value)}
              disabled={rconMutation.isPending}
              placeholder="Digite um comando RCON e pressione Enter..."
              className="bg-transparent border-border/50 font-mono text-xs focus-visible:ring-primary/30 h-8"
              data-testid="input-rcon"
              autoComplete="off"
            />
            <Button
              type="submit"
              disabled={rconMutation.isPending || !command.trim()}
              size="sm"
              className="font-mono text-xs uppercase tracking-wider h-8 px-4 shrink-0"
              data-testid="btn-rcon-send"
            >
              Enviar
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

// â”€â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-lg font-mono text-sm uppercase tracking-widest">
      {text}
    </div>
  );
}
