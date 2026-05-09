import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileCog, Loader2, RefreshCw, RotateCcw, Save, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type StartupConfig = {
  port: string;
  ip: string;
  maxPlayers: string;
  map: string;
  mapgroup: string;
  gameMode: string;
  gameType: string;
  tickrate: string;
  console: boolean;
  usercon: boolean;
  vac: boolean;
  svLan: string;
  rconPassword: string;
  gsltToken: string;
  hostname: string;
  region: string;
  workshopCollection: string;
  workshopStartMap: string;
  execConfig: string;
  hltv: boolean;
  autoRestart: boolean;
  customParams: string;
  additionalFlags: string[];
};

type StartupPayload = {
  path: string;
  exists: boolean;
  command: string;
  generatedCommand: string;
  config: StartupConfig;
  prefix: string[];
  unknownParams: string[];
  backupPath?: string | null;
  message?: string;
};

const emptyConfig: StartupConfig = {
  port: "",
  ip: "",
  maxPlayers: "",
  map: "",
  mapgroup: "",
  gameMode: "",
  gameType: "",
  tickrate: "",
  console: false,
  usercon: false,
  vac: true,
  svLan: "",
  rconPassword: "",
  gsltToken: "",
  hostname: "",
  region: "",
  workshopCollection: "",
  workshopStartMap: "",
  execConfig: "",
  hltv: false,
  autoRestart: false,
  customParams: "",
  additionalFlags: [],
};

const authFetch = (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem("cs2_token") ?? "";
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
};

async function jsonOrError<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? "Falha na requisicao");
  }
  return data as T;
}

function quoteToken(value: string) {
  if (!value) return "";
  return /\s|"/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function splitParams(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function tokenizeParams(value: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of value.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function buildPreview(config: StartupConfig, prefix: string[] = []) {
  const tokens = [...(prefix.length ? prefix : ["start", "/wait", "srcds.exe", "-game", "csgo"])];
  if (config.console) tokens.push("-console");
  if (config.usercon) tokens.push("-usercon");
  if (!config.vac) tokens.push("-insecure");
  const add = (key: string, value: string | boolean) => {
    const normalized = typeof value === "boolean" ? (value ? "1" : "0") : String(value || "").trim();
    if (normalized) tokens.push(key, normalized);
  };
  add("-port", config.port);
  add("+ip", config.ip);
  add("+maxplayers", config.maxPlayers);
  add("+map", config.map);
  add("+mapgroup", config.mapgroup);
  add("+game_mode", config.gameMode);
  add("+game_type", config.gameType);
  add("-tickrate", config.tickrate);
  add("+sv_lan", config.svLan);
  add("+rcon_password", config.rconPassword);
  add("+sv_setsteamaccount", config.gsltToken);
  add("+hostname", config.hostname);
  add("+sv_region", config.region);
  add("+host_workshop_collection", config.workshopCollection);
  add("+host_workshop_map", config.workshopStartMap);
  add("+exec", config.execConfig);
  add("+tv_enable", config.hltv);
  if (config.autoRestart) tokens.push("-autorestart");
  tokens.push(...config.additionalFlags);
  if (config.customParams.trim()) tokens.push(...tokenizeParams(config.customParams));
  return tokens.map(quoteToken).filter(Boolean).join(" ");
}

function validate(config: StartupConfig) {
  const errors: string[] = [];
  const checkNumber = (value: string, label: string, min: number, max: number) => {
    if (!value.trim()) return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${label}: ${min}-${max}`);
  };
  checkNumber(config.port, "Porta", 1, 65535);
  checkNumber(config.maxPlayers, "Max players", 1, 128);
  checkNumber(config.gameMode, "Game mode", 0, 99);
  checkNumber(config.gameType, "Game type", 0, 99);
  checkNumber(config.tickrate, "Tickrate", 1, 1000);
  checkNumber(config.svLan, "sv_lan", 0, 1);
  checkNumber(config.region, "Regiao", 0, 255);
  if (config.ip.trim() && config.ip !== "*" && config.ip !== "localhost") {
    const parts = config.ip.split(".");
    if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p) || Number(p) > 255)) {
      errors.push("IP bind invalido");
    }
  }
  return errors;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background/60 font-mono text-sm"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2.5">
      <Label className="font-mono text-xs uppercase tracking-wider">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-sm uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

export function StartupTab({ serverId }: { serverId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StartupConfig>(emptyConfig);
  const [flagsText, setFlagsText] = useState("");

  const startupQ = useQuery<StartupPayload>({
    queryKey: ["server-startup", serverId],
    queryFn: async () => jsonOrError(await authFetch(`/api/servers/${serverId}/startup`)),
    enabled: !!serverId,
  });

  useEffect(() => {
    if (!startupQ.data?.config) return;
    setForm({ ...emptyConfig, ...startupQ.data.config });
    setFlagsText((startupQ.data.config.additionalFlags ?? []).join("\n"));
  }, [startupQ.data?.path, startupQ.data?.command]);

  const errors = useMemo(() => validate(form), [form]);
  const preview = useMemo(
    () => buildPreview({ ...form, additionalFlags: splitParams(flagsText) }, startupQ.data?.prefix ?? []),
    [form, flagsText, startupQ.data?.prefix],
  );

  const set = <K extends keyof StartupConfig>(key: K, value: StartupConfig[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        path: startupQ.data?.path,
        config: { ...form, additionalFlags: splitParams(flagsText) },
      };
      return jsonOrError<StartupPayload>(await authFetch(`/api/servers/${serverId}/startup`, {
        method: "POST",
        body: JSON.stringify(payload),
      }));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["server-startup", serverId], data);
      toast({
        title: "Inicializacao salva",
        description: data.backupPath ? `Backup criado: ${data.backupPath}` : data.message,
      });
    },
    onError: (error: any) => {
      toast({ title: "Falha ao salvar", description: error.message, variant: "destructive" });
    },
  });

  const restartMut = useMutation({
    mutationFn: async () => jsonOrError(await authFetch(`/api/servers/${serverId}/restart`, { method: "POST" })),
    onSuccess: () => toast({ title: "Servidor reiniciando" }),
    onError: (error: any) => toast({ title: "Falha ao reiniciar", description: error.message, variant: "destructive" }),
  });

  if (startupQ.isLoading) {
    return <Skeleton className="h-[520px] w-full bg-card" />;
  }

  if (startupQ.isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center gap-3 p-6 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-mono text-sm">{(startupQ.error as Error).message}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ServerCog className="h-5 w-5 text-primary" />
              <h2 className="font-mono text-lg font-bold uppercase tracking-widest">Inicialização do Servidor</h2>
              <Badge variant={startupQ.data?.exists ? "default" : "secondary"} className="font-mono text-[10px] uppercase">
                {startupQ.data?.exists ? "Arquivo detectado" : "Novo arquivo"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileCog className="h-4 w-4 shrink-0" />
              <span className="truncate font-mono">{startupQ.data?.path}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => startupQ.refetch()}
              disabled={startupQ.isFetching || saveMut.isPending}
              className="font-mono text-xs uppercase tracking-wider"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Recarregar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => restartMut.mutate()}
              disabled={restartMut.isPending}
              className="border-yellow-500/40 font-mono text-xs uppercase tracking-wider text-yellow-500 hover:bg-yellow-500/10"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reiniciar Servidor
            </Button>
            <Button
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || errors.length > 0}
              className="font-mono text-xs uppercase tracking-wider"
            >
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-xs font-mono text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {errors.map((error) => <Badge key={error} variant="destructive">{error}</Badge>)}
          </CardContent>
        </Card>
      )}

      <Section title="Rede / Inicialização">
        <Field label="Porta do servidor (-port)" value={form.port} onChange={(v) => set("port", v)} placeholder="27015" type="number" />
        <Field label="IP bind (+ip)" value={form.ip} onChange={(v) => set("ip", v)} placeholder="0.0.0.0" />
        <Field label="Max players (+maxplayers)" value={form.maxPlayers} onChange={(v) => set("maxPlayers", v)} placeholder="20" type="number" />
        <Field label="Mapa inicial (+map)" value={form.map} onChange={(v) => set("map", v)} placeholder="de_mirage" />
        <Field label="Mapgroup (+mapgroup)" value={form.mapgroup} onChange={(v) => set("mapgroup", v)} placeholder="mg_active" />
        <Field label="Game mode (+game_mode)" value={form.gameMode} onChange={(v) => set("gameMode", v)} placeholder="1" type="number" />
        <Field label="Game type (+game_type)" value={form.gameType} onChange={(v) => set("gameType", v)} placeholder="0" type="number" />
        <Field label="Tickrate (-tickrate)" value={form.tickrate} onChange={(v) => set("tickrate", v)} placeholder="128" type="number" />
        <ToggleRow label="Console (-console)" checked={form.console} onCheckedChange={(v) => set("console", v)} />
        <ToggleRow label="Usercon (-usercon)" checked={form.usercon} onCheckedChange={(v) => set("usercon", v)} />
      </Section>

      <Section title="Segurança">
        <ToggleRow label="VAC habilitado" checked={form.vac} onCheckedChange={(v) => set("vac", v)} />
        <Field label="sv_lan" value={form.svLan} onChange={(v) => set("svLan", v)} placeholder="0" type="number" />
        <Field label="RCON password" value={form.rconPassword} onChange={(v) => set("rconPassword", v)} placeholder="senha" />
        <Field label="GSLT token (+sv_setsteamaccount)" value={form.gsltToken} onChange={(v) => set("gsltToken", v)} placeholder="TOKEN" />
      </Section>

      <Section title="Servidor">
        <Field label="Nome do servidor (+hostname)" value={form.hostname} onChange={(v) => set("hostname", v)} placeholder="Limitados Skins" />
        <Field label="Região (+sv_region)" value={form.region} onChange={(v) => set("region", v)} placeholder="255" type="number" />
        <Field label="Workshop collection" value={form.workshopCollection} onChange={(v) => set("workshopCollection", v)} placeholder="ID da colecao" />
        <Field label="Workshop start map" value={form.workshopStartMap} onChange={(v) => set("workshopStartMap", v)} placeholder="ID do mapa" />
        <Field label="Exec config (+exec)" value={form.execConfig} onChange={(v) => set("execConfig", v)} placeholder="server.cfg" />
        <ToggleRow label="HLTV / CSTV (+tv_enable)" checked={form.hltv} onCheckedChange={(v) => set("hltv", v)} />
        <ToggleRow label="Auto restart" checked={form.autoRestart} onCheckedChange={(v) => set("autoRestart", v)} />
      </Section>

      <Card className="bg-card/60 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-sm uppercase tracking-widest">Avançado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Flags adicionais</Label>
            <Textarea
              value={flagsText}
              onChange={(event) => setFlagsText(event.target.value)}
              placeholder={"-dedicated\n-nobots"}
              className="min-h-32 bg-background/60 font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Parâmetros customizados preservados</Label>
            <Textarea
              value={form.customParams}
              onChange={(event) => set("customParams", event.target.value)}
              placeholder="+custom_cvar valor -custom_flag"
              className="min-h-32 bg-background/60 font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black border-border">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-sm uppercase tracking-widest text-primary">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/80 p-4 font-mono text-xs text-foreground">
            {preview}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
