import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Video, VideoOff, Circle, Square, Pause, Play, Download,
  Trash2, Pencil, Check, X, Search, HardDrive, RefreshCw,
  Loader2, AlertTriangle, Tv2, SortAsc, SortDesc, Settings2,
  CheckCircle2, ChevronDown, ChevronUp
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DemoFile = {
  name: string;
  size: number;
  modified: string;
  map: string;
  durationSec: number;
};

type CSTVStatus = {
  tvEnabled: boolean;
  tvRecording: boolean;
  tvDemoName: string | null;
  tvDelay: number;
  tvAutorecord: boolean;
  tvClients: number;
  recordingDuration: number;
  recordingSize: number;
  agentReachable: boolean;
};

type CSTVConfig = {
  tvEnable: boolean;
  tvDelay: number;
  tvAutorecord: boolean;
  demoFolder: string;
  storageLimit: number;
  autoDeleteOld: boolean;
  autoDeleteAfterDays: number;
};

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Auth fetch ───────────────────────────────────────────────────────────────
const authFetch = (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem("cs2_token") ?? "";
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
};

// ─── CSTVTab ──────────────────────────────────────────────────────────────────
export function CSTVTab({ serverId }: { serverId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const DEMOS_KEY  = ["demos",       serverId];
  const STATUS_KEY = ["cstv-status", serverId];
  const CONFIG_KEY = ["cstv-config", serverId];

  // UI state
  const [recordName, setRecordName]         = useState(`demo_${new Date().toISOString().slice(0,10)}`);
  const [search, setSearch]                 = useState("");
  const [sortBy, setSortBy]                 = useState<"name" | "date" | "size">("date");
  const [sortAsc, setSortAsc]               = useState(false);
  const [renamingDemo, setRenamingDemo]     = useState<string | null>(null);
  const [renameValue, setRenameValue]       = useState("");
  const [showSettings, setShowSettings]     = useState(false);
  const [localCfg, setLocalCfg]             = useState<CSTVConfig | null>(null);

  // Live timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const statusQ = useQuery<CSTVStatus>({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/cstv/status`);
      if (!res.ok) throw new Error("Falha ao obter status CSTV");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const demosQ = useQuery<DemoFile[]>({
    queryKey: DEMOS_KEY,
    queryFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/demos`);
      if (!res.ok) throw new Error("Falha ao listar demos");
      return res.json();
    },
    refetchInterval: (statusQ.data?.tvRecording) ? 10000 : 30000,
  });

  const configQ = useQuery<CSTVConfig>({
    queryKey: CONFIG_KEY,
    queryFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/cstv/config`);
      if (!res.ok) throw new Error("Falha ao obter config");
      return res.json();
    },
  });

  useEffect(() => {
    if (configQ.data && !localCfg) setLocalCfg(configQ.data);
  }, [configQ.data]);

  // Live elapsed timer
  useEffect(() => {
    if (statusQ.data?.tvRecording) {
      setElapsed(statusQ.data.recordingDuration ?? 0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [statusQ.data?.tvRecording]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const recordMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/demos/record`, {
        method: "POST", body: JSON.stringify({ name: recordName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao iniciar gravação");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      toast({ title: "Gravação iniciada!", description: recordName });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const stopMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/demos/stop`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Falha ao parar gravação");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      qc.invalidateQueries({ queryKey: DEMOS_KEY });
      toast({ title: "Gravação parada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const pauseMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/demos/pause`, { method: "POST" });
      if (!res.ok) throw new Error("Falha ao pausar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      toast({ title: "Gravação pausada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/demos/resume`, { method: "POST" });
      if (!res.ok) throw new Error("Falha ao retomar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      toast({ title: "Gravação retomada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await authFetch(`/api/servers/${serverId}/demos/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir demo");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEMOS_KEY });
      toast({ title: "Demo excluída" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const renameMut = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const res = await authFetch(`/api/servers/${serverId}/demos/${encodeURIComponent(oldName)}/rename`, {
        method: "POST", body: JSON.stringify({ newName }),
      });
      if (!res.ok) throw new Error("Falha ao renomear");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DEMOS_KEY });
      setRenamingDemo(null);
      toast({ title: "Demo renomeada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const saveCfgMut = useMutation({
    mutationFn: async (cfg: CSTVConfig) => {
      const res = await authFetch(`/api/servers/${serverId}/cstv/config`, {
        method: "POST", body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error("Falha ao salvar configuração");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
      toast({ title: "Configurações salvas" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = async (name: string) => {
    const token = localStorage.getItem("cs2_token") ?? "";
    try {
      const res = await fetch(`/api/servers/${serverId}/demos/${encodeURIComponent(name)}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { toast({ title: "Erro ao baixar demo", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.endsWith(".dem") ? name : `${name}.dem`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Erro ao baixar demo", variant: "destructive" });
    }
  };

  // ── Filtered / sorted demos ─────────────────────────────────────────────────
  const demos = (demosQ.data ?? [])
    .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let diff = 0;
      if (sortBy === "name") diff = a.name.localeCompare(b.name);
      else if (sortBy === "date") diff = new Date(a.modified).getTime() - new Date(b.modified).getTime();
      else if (sortBy === "size") diff = a.size - b.size;
      return sortAsc ? diff : -diff;
    });

  const totalSize = (demosQ.data ?? []).reduce((acc, d) => acc + d.size, 0);
  const storageLimit = (localCfg?.storageLimit ?? 10240) * 1024 * 1024;
  const storagePercent = Math.min(100, (totalSize / storageLimit) * 100);

  const status = statusQ.data;
  const isRecording = status?.tvRecording ?? false;

  // ── Sort toggle ─────────────────────────────────────────────────────────────
  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(a => !a);
    else { setSortBy(col); setSortAsc(false); }
  };
  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <SortAsc className="w-3 h-3 opacity-30" />;
    return sortAsc ? <SortAsc className="w-3 h-3 text-primary" /> : <SortDesc className="w-3 h-3 text-primary" />;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Status + Recording controls ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CSTV Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-mono uppercase tracking-widest">
              <span className="flex items-center gap-2">
                <Tv2 className="w-4 h-4 text-primary" /> CSTV Status
              </span>
              <button onClick={() => qc.invalidateQueries({ queryKey: STATUS_KEY })} className="text-muted-foreground hover:text-primary transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusQ.isLoading ? (
              <Skeleton className="h-16 bg-background/50" />
            ) : !status?.agentReachable ? (
              <div className="flex items-center gap-2 text-yellow-500 text-xs font-mono">
                <AlertTriangle className="w-4 h-4" /> Agente não acessível
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CSTV</div>
                  <Badge className={cn("font-mono text-xs", status.tvEnabled ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground")}>
                    {status.tvEnabled ? "ATIVO" : "INATIVO"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</div>
                  {isRecording ? (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono text-xs animate-pulse">
                      <Circle className="w-2 h-2 mr-1 fill-red-400" /> REC
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-xs text-muted-foreground">STANDBY</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Delay</div>
                  <div className="text-sm font-mono font-bold">{status.tvDelay ?? 0}s</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Clientes</div>
                  <div className="text-sm font-mono font-bold">{status.tvClients ?? 0}</div>
                </div>
              </div>
            )}

            {/* Live recording info */}
            {isRecording && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-red-400 font-mono text-xs font-bold">
                    <Circle className="w-2 h-2 fill-red-400 animate-pulse" />
                    GRAVANDO
                  </div>
                  <div className="font-mono text-xs text-red-300">{fmtDuration(elapsed)}</div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {status?.tvDemoName ?? recordName}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {fmtSize(status?.recordingSize ?? 0)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recording controls */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" /> Controles de Gravação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Nome da Demo</Label>
              <Input
                value={recordName}
                onChange={e => setRecordName(e.target.value)}
                placeholder="nome_da_demo"
                className="font-mono text-sm bg-background/50"
                disabled={isRecording}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {!isRecording ? (
                <Button
                  className="col-span-2 font-mono text-xs uppercase tracking-wider bg-red-600 hover:bg-red-700"
                  onClick={() => recordMut.mutate()}
                  disabled={recordMut.isPending || !recordName.trim()}
                  data-testid="btn-record-start"
                >
                  {recordMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Circle className="w-3.5 h-3.5 mr-1.5 fill-white" />}
                  Iniciar Gravação
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="font-mono text-xs uppercase border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => pauseMut.mutate()}
                    disabled={pauseMut.isPending}
                    data-testid="btn-record-pause"
                  >
                    {pauseMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
                    Pausar
                  </Button>
                  <Button
                    variant="outline"
                    className="font-mono text-xs uppercase border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => stopMut.mutate()}
                    disabled={stopMut.isPending}
                    data-testid="btn-record-stop"
                  >
                    {stopMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 mr-1" />}
                    Parar
                  </Button>
                </>
              )}
            </div>
            {/* Auto record toggle */}
            <div className="flex items-center justify-between py-2 border-t border-border/50">
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">Auto Record</Label>
              <Switch
                checked={status?.tvAutorecord ?? false}
                onCheckedChange={async (checked) => {
                  await authFetch(`/api/servers/${serverId}/command`, {
                    method: "POST",
                    body: JSON.stringify({ command: `tv_autorecord ${checked ? 1 : 0}` }),
                  });
                  qc.invalidateQueries({ queryKey: STATUS_KEY });
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Storage usage bar ──────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <HardDrive className="w-3.5 h-3.5" /> Armazenamento
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {fmtSize(totalSize)} / {fmtSize(storageLimit)}
            </div>
          </div>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-yellow-500" : "bg-primary")}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          {storagePercent > 85 && (
            <div className="mt-2 flex items-center gap-1.5 text-yellow-500 text-xs font-mono">
              <AlertTriangle className="w-3 h-3" /> Pouco espaço disponível
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Demo list ──────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-mono uppercase tracking-widest flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              Demos ({demosQ.data?.length ?? 0})
            </CardTitle>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="pl-8 font-mono text-xs h-8 bg-background/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {demosQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 bg-background/50" />)}</div>
          ) : demos.length === 0 ? (
            <div className="py-10 text-center">
              <VideoOff className="w-8 h-8 text-muted-foreground mx-auto opacity-30 mb-2" />
              <div className="text-muted-foreground font-mono text-sm">{search ? "Nenhuma demo encontrada" : "Nenhuma demo gravada ainda"}</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground uppercase tracking-widest">
                    <th className="text-left pb-2 pr-4">
                      <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-primary transition-colors">
                        Nome <SortIcon col="name" />
                      </button>
                    </th>
                    <th className="text-left pb-2 pr-4 hidden md:table-cell">Mapa</th>
                    <th className="text-left pb-2 pr-4 hidden sm:table-cell">
                      <button onClick={() => handleSort("date")} className="flex items-center gap-1 hover:text-primary transition-colors">
                        Data <SortIcon col="date" />
                      </button>
                    </th>
                    <th className="text-left pb-2 pr-4">
                      <button onClick={() => handleSort("size")} className="flex items-center gap-1 hover:text-primary transition-colors">
                        Tamanho <SortIcon col="size" />
                      </button>
                    </th>
                    <th className="text-right pb-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {demos.map(demo => (
                    <tr key={demo.name} className="border-b border-border/30 hover:bg-muted/10 transition-colors group">
                      <td className="py-2.5 pr-4">
                        {renamingDemo === demo.name ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              className="h-7 font-mono text-xs bg-background/50 w-44"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === "Enter") renameMut.mutate({ oldName: demo.name, newName: renameValue });
                                if (e.key === "Escape") setRenamingDemo(null);
                              }}
                            />
                            <button onClick={() => renameMut.mutate({ oldName: demo.name, newName: renameValue })} className="text-primary hover:text-primary/80">
                              {renameMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setRenamingDemo(null)} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="truncate max-w-[180px] block" title={demo.name}>{demo.name}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 hidden md:table-cell text-muted-foreground">{demo.map || "—"}</td>
                      <td className="py-2.5 pr-4 hidden sm:table-cell text-muted-foreground">{fmtDate(demo.modified)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{fmtSize(demo.size)}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDownload(demo.name)}
                            className="text-muted-foreground hover:text-primary transition-colors p-1"
                            title="Baixar demo"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setRenamingDemo(demo.name); setRenameValue(demo.name); }}
                            className="text-muted-foreground hover:text-yellow-400 transition-colors p-1"
                            title="Renomear"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteMut.mutate(demo.name)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            title="Excluir demo"
                          >
                            {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Settings ───────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <button
          className="w-full p-4 flex items-center justify-between text-sm font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setShowSettings(s => !s)}
        >
          <span className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> Configurações CSTV & Armazenamento</span>
          {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showSettings && localCfg && (
          <CardContent className="pt-0 space-y-5 border-t border-border/50">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* CSTV enable */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">CSTV Ativado</Label>
                  <div className="text-[10px] text-muted-foreground font-mono">tv_enable</div>
                </div>
                <Switch
                  checked={localCfg.tvEnable}
                  onCheckedChange={v => setLocalCfg(c => c && { ...c, tvEnable: v })}
                />
              </div>
              {/* auto record */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider">Auto Record</Label>
                  <div className="text-[10px] text-muted-foreground font-mono">tv_autorecord</div>
                </div>
                <Switch
                  checked={localCfg.tvAutorecord}
                  onCheckedChange={v => setLocalCfg(c => c && { ...c, tvAutorecord: v })}
                />
              </div>
              {/* delay */}
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider">Delay (segundos)</Label>
                <Input
                  type="number" min={0} max={90}
                  value={localCfg.tvDelay}
                  onChange={e => setLocalCfg(c => c && { ...c, tvDelay: parseInt(e.target.value) || 0 })}
                  className="font-mono text-sm bg-background/50"
                />
              </div>
              {/* demo folder */}
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider">Pasta das Demos (VPS)</Label>
                <Input
                  value={localCfg.demoFolder}
                  onChange={e => setLocalCfg(c => c && { ...c, demoFolder: e.target.value })}
                  className="font-mono text-xs bg-background/50"
                  placeholder="/home/steam/cs2/game/csgo"
                />
              </div>
              {/* storage limit */}
              <div className="space-y-1.5">
                <Label className="font-mono text-xs uppercase tracking-wider">Limite de Armazenamento (MB)</Label>
                <Input
                  type="number" min={512}
                  value={localCfg.storageLimit}
                  onChange={e => setLocalCfg(c => c && { ...c, storageLimit: parseInt(e.target.value) || 10240 })}
                  className="font-mono text-sm bg-background/50"
                />
              </div>
              {/* auto delete */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-mono text-xs uppercase tracking-wider">Auto Delete</Label>
                    <div className="text-[10px] text-muted-foreground font-mono">Excluir demos antigas automaticamente</div>
                  </div>
                  <Switch
                    checked={localCfg.autoDeleteOld}
                    onCheckedChange={v => setLocalCfg(c => c && { ...c, autoDeleteOld: v })}
                  />
                </div>
                {localCfg.autoDeleteOld && (
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Excluir após (dias)</Label>
                    <Input
                      type="number" min={1}
                      value={localCfg.autoDeleteAfterDays}
                      onChange={e => setLocalCfg(c => c && { ...c, autoDeleteAfterDays: parseInt(e.target.value) || 30 })}
                      className="font-mono text-sm bg-background/50 w-32"
                    />
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => localCfg && saveCfgMut.mutate(localCfg)}
              disabled={saveCfgMut.isPending}
              className="font-mono text-xs uppercase tracking-wider"
              data-testid="btn-save-cstv-config"
            >
              {saveCfgMut.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Salvando...</>
                : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Salvar Configurações</>
              }
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
