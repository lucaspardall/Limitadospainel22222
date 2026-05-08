import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Gamepad2, Plus, Trash2, Loader2, CheckCircle2,
  Zap, Target, RefreshCcw, BookOpen, Settings2, Swords
} from "lucide-react";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type GameMode = {
  id: number;
  serverId: number;
  name: string;
  displayName: string;
  description: string | null;
  gameType: number;
  gameMode: number;
  plugins: string[];
  configs: string[];
  cvars: Record<string, string>;
  mapgroup: string | null;
  isActive: boolean;
  createdAt: string;
};

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GM_LABELS: Record<string, string> = {
  "0-0": "Casual", "0-1": "Competitivo", "0-2": "Wingman",
  "1-0": "Arms Race", "1-2": "Deathmatch",
  "2-0": "Treino", "3-0": "Custom",
};
const gameModeLabel = (gt: number, gm: number) =>
  GM_LABELS[`${gt}-${gm}`] ?? `type${gt}/mode${gm}`;

const MODE_ICONS: Record<string, React.ElementType> = {
  competitive: Target,
  retake: RefreshCcw,
  deathmatch: Zap,
  practice: BookOpen,
  arena: Swords,
  treino: BookOpen,
};

const DEFAULT_MODES = [
  { displayName: "Competitive", name: "competitive", description: "Modo competitivo padrao", gameType: 0, gameMode: 1, plugins: [], configs: ["gamemode_competitive_server.cfg"], cvars: { "bot_quota": "0", "mp_restartgame": "1" }, mapgroup: "mg_active" },
  { displayName: "Casual", name: "casual", description: "Modo casual publico", gameType: 0, gameMode: 0, plugins: [], configs: ["server.cfg"], cvars: { "bot_quota": "0", "mp_restartgame": "1" }, mapgroup: "mg_active" },
  { displayName: "Deathmatch", name: "deathmatch", description: "Treino de mira com respawn rapido", gameType: 1, gameMode: 2, plugins: [], configs: ["gamemode_deathmatch.cfg"], cvars: { "bot_quota": "0", "mp_restartgame": "1" }, mapgroup: "mg_deathmatch" },
  { displayName: "Skins", name: "skins", description: "WeaponPaints, PlayerSettings e MenuManager", gameType: 0, gameMode: 1, plugins: ["WeaponPaints", "PlayerSettings", "MenuManagerCore"], configs: [], cvars: {}, mapgroup: "mg_active" },
  { displayName: "Admins", name: "admins", description: "AdminPlus para comandos administrativos", gameType: 0, gameMode: 1, plugins: ["AdminPlusv1.0.7"], configs: [], cvars: {}, mapgroup: "mg_active" },
];

// â”€â”€â”€ Auth fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Form helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const emptyForm = () => ({
  displayName: "", name: "", description: "",
  gameType: "0", gameMode: "1",
  pluginsText: "", configsText: "", cvarsText: "",
  mapgroup: "mg_active",
});

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ModesTab({ serverId }: { serverId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const MODES_KEY = ["modes", serverId];

  const [activatingId, setActivatingId]   = useState<number | null>(null);
  const [deletingId, setDeletingId]       = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen]   = useState(false);
  const [form, setForm]                   = useState(emptyForm());

  // â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: modes, isLoading } = useQuery<GameMode[]>({
    queryKey: MODES_KEY,
    queryFn: async () => {
      const res = await authFetch(`/api/servers/${serverId}/modes`);
      if (!res.ok) throw new Error("Falha ao carregar modos");
      return res.json();
    },
    enabled: !!serverId,
  });

  const activeMode = modes?.find(m => m.isActive);

  // â”€â”€ Activate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activateMutation = useMutation({
    mutationFn: async (modeId: number) => {
      setActivatingId(modeId);
      const res = await authFetch(`/api/servers/${serverId}/modes/${modeId}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao ativar modo");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: MODES_KEY });
      const agentOk = data.agentResult?.success;
      toast({
        title: "Modo ativado!",
        description: agentOk
          ? `${data.mode?.displayName} ativado â€” servidor reiniciando...`
          : `${data.mode?.displayName} salvo no painel. Agente: ${data.agentResult?.message ?? "sem resposta"}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao ativar modo", description: err.message, variant: "destructive" });
    },
    onSettled: () => setActivatingId(null),
  });

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const deleteMutation = useMutation({
    mutationFn: async (modeId: number) => {
      setDeletingId(modeId);
      const res = await authFetch(`/api/servers/${serverId}/modes/${modeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir modo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODES_KEY });
      toast({ title: "Modo excluÃ­do" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    },
    onSettled: () => setDeletingId(null),
  });

  // â”€â”€ Create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const createMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await authFetch(`/api/servers/${serverId}/modes`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar modo");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODES_KEY });
      setIsDialogOpen(false);
      setForm(emptyForm());
      toast({ title: "Modo criado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar", description: err.message, variant: "destructive" });
    },
  });

  // â”€â”€ Seed defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const seedMutation = useMutation({
    mutationFn: async () => {
      for (const m of DEFAULT_MODES) {
        await authFetch(`/api/servers/${serverId}/modes`, {
          method: "POST",
          body: JSON.stringify({
            ...m,
            cvars: m.cvars,
          }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODES_KEY });
      toast({ title: "Modos padrÃ£o criados!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar modos padrÃ£o", description: err.message, variant: "destructive" });
    },
  });

  // â”€â”€ Form helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleFormChange = (field: string, value: string) => {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === "displayName") {
        updated.name = value.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      }
      return updated;
    });
  };

  const handleCreate = () => {
    if (!form.displayName.trim() || !form.name.trim()) {
      toast({ title: "Nome e slug sÃ£o obrigatÃ³rios", variant: "destructive" });
      return;
    }
    const plugins = form.pluginsText.split("\n").map(s => s.trim()).filter(Boolean);
    const configs = form.configsText.split("\n").map(s => s.trim()).filter(Boolean);
    const cvars: Record<string, string> = {};
    form.cvarsText.split("\n").forEach(line => {
      const idx = line.indexOf("=");
      if (idx > 0) cvars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    createMutation.mutate({
      name: form.name, displayName: form.displayName,
      description: form.description || null,
      gameType: parseInt(form.gameType), gameMode: parseInt(form.gameMode),
      plugins, configs, cvars, mapgroup: form.mapgroup,
    });
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 bg-card" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-md">
            <Gamepad2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Modo Atual</div>
            {activeMode ? (
              <div className="text-primary font-bold text-lg font-mono flex items-center gap-2">
                {activeMode.displayName}
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
              </div>
            ) : (
              <div className="text-muted-foreground font-mono text-sm">Nenhum modo ativo</div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {/* Seed button â€” only if empty */}
          {modes?.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs uppercase border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="btn-seed-modes"
            >
              {seedMutation.isPending
                ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                : <Zap className="w-3 h-3 mr-1.5" />}
              Criar Modos PadrÃ£o
            </Button>
          )}

          {/* Add mode dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-mono text-xs uppercase tracking-wider" data-testid="btn-new-mode">
                <Plus className="w-4 h-4 mr-1.5" /> Novo Modo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-mono uppercase tracking-widest">Criar Modo de Jogo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Nome *</Label>
                    <Input value={form.displayName} onChange={e => handleFormChange("displayName", e.target.value)} placeholder="Deathmatch" className="font-mono text-sm bg-background/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Slug *</Label>
                    <Input value={form.name} onChange={e => handleFormChange("name", e.target.value)} placeholder="deathmatch" className="font-mono text-sm bg-background/50" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">DescriÃ§Ã£o</Label>
                  <Input value={form.description} onChange={e => handleFormChange("description", e.target.value)} placeholder="DescriÃ§Ã£o do modo" className="font-mono text-sm bg-background/50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Game Type</Label>
                    <Select value={form.gameType} onValueChange={v => handleFormChange("gameType", v)}>
                      <SelectTrigger className="font-mono text-xs bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0" className="font-mono text-xs">0 â€” Classic</SelectItem>
                        <SelectItem value="1" className="font-mono text-xs">1 â€” Arms Race</SelectItem>
                        <SelectItem value="2" className="font-mono text-xs">2 â€” Training</SelectItem>
                        <SelectItem value="3" className="font-mono text-xs">3 â€” Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Game Mode</Label>
                    <Select value={form.gameMode} onValueChange={v => handleFormChange("gameMode", v)}>
                      <SelectTrigger className="font-mono text-xs bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0" className="font-mono text-xs">0 â€” Casual / Arms Race</SelectItem>
                        <SelectItem value="1" className="font-mono text-xs">1 â€” Competitivo</SelectItem>
                        <SelectItem value="2" className="font-mono text-xs">2 â€” Wingman / DM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Plugins CounterStrikeSharp — um por linha</Label>
                  <textarea
                    value={form.pluginsText}
                    onChange={e => handleFormChange("pluginsText", e.target.value)}
                    rows={3}
                    placeholder={"WeaponPaints\nPlayerSettings\nMenuManagerCore"}
                    className="w-full rounded-md border border-border bg-background/50 px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Configs (.cfg) â€” um por linha</Label>
                  <textarea
                    value={form.configsText}
                    onChange={e => handleFormChange("configsText", e.target.value)}
                    rows={2}
                    placeholder="competitive.cfg"
                    className="w-full rounded-md border border-border bg-background/50 px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">CVARs â€” KEY=VALUE, um por linha</Label>
                  <textarea
                    value={form.cvarsText}
                    onChange={e => handleFormChange("cvarsText", e.target.value)}
                    rows={2}
                    placeholder={"mp_maxrounds=30\nsv_cheats=0"}
                    className="w-full rounded-md border border-border bg-background/50 px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Mapgroup</Label>
                  <Input value={form.mapgroup} onChange={e => handleFormChange("mapgroup", e.target.value)} placeholder="mg_active" className="font-mono text-sm bg-background/50" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); setForm(emptyForm()); }} className="font-mono text-xs uppercase">Cancelar</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="font-mono text-xs uppercase tracking-wider" data-testid="btn-create-mode">
                  {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Empty state */}
      {modes?.length === 0 && (
        <div className="p-14 text-center border border-dashed border-border rounded-lg space-y-4">
          <Gamepad2 className="w-12 h-12 text-muted-foreground mx-auto opacity-30" />
          <div>
            <div className="text-muted-foreground font-mono text-sm font-medium">Nenhum modo configurado</div>
            <div className="text-muted-foreground/60 text-xs font-mono mt-1">Crie os modos padrÃ£o ou adicione um modo personalizado</div>
          </div>
          <Button
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="font-mono text-xs uppercase border-primary/30 text-primary hover:bg-primary/10"
          >
            {seedMutation.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
            Criar Modos PadrÃ£o
          </Button>
        </div>
      )}

      {/* Mode cards */}
      {modes && modes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modes.map(mode => {
            const isActive    = mode.isActive;
            const isActivating = activatingId === mode.id;
            const isDeleting  = deletingId === mode.id;
            const Icon        = MODE_ICONS[mode.name] ?? Settings2;

            return (
              <Card
                key={mode.id}
                className={cn(
                  "bg-card border-2 transition-all duration-200 relative overflow-hidden flex flex-col",
                  isActive ? "border-primary shadow-[0_0_20px_rgba(74,222,128,0.08)]" : "border-border hover:border-primary/40",
                )}
                data-testid={`card-mode-${mode.name}`}
              >
                {/* Active top bar */}
                {isActive && <div className="absolute top-0 left-0 w-full h-0.5 bg-primary" />}

                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("p-1.5 rounded-md shrink-0", isActive ? "bg-primary/20" : "bg-muted/30")}>
                      <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <CardTitle className={cn("text-base font-bold font-mono flex items-center gap-1.5", isActive && "text-primary")}>
                        {mode.displayName}
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />}
                      </CardTitle>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">
                        {gameModeLabel(mode.gameType, mode.gameMode)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => !isActive && deleteMutation.mutate(mode.id)}
                    disabled={isActive || isDeleting || deleteMutation.isPending}
                    className="text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-20 disabled:cursor-not-allowed shrink-0 mt-0.5"
                    title={isActive ? "Desative o modo antes de excluir" : "Excluir modo"}
                    data-testid={`btn-delete-mode-${mode.name}`}
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </CardHeader>

                <CardContent className="space-y-3 flex-1 flex flex-col">
                  {mode.description && (
                    <p className="text-xs text-muted-foreground">{mode.description}</p>
                  )}

                  {/* Plugins */}
                  {mode.plugins.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Plugins</div>
                      <div className="flex flex-wrap gap-1">
                        {mode.plugins.map(p => (
                          <Badge key={p} variant="outline" className="font-mono text-[9px] px-1.5 py-0 bg-muted/20 border-border/60">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Configs */}
                  {mode.configs.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Configs</div>
                      <div className="flex flex-wrap gap-1">
                        {mode.configs.map(c => (
                          <Badge key={c} variant="outline" className="font-mono text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CVARs count */}
                  {Object.keys(mode.cvars).length > 0 && (
                    <div className="text-[10px] font-mono text-muted-foreground/70">
                      {Object.keys(mode.cvars).length} cvar{Object.keys(mode.cvars).length > 1 ? "s" : ""} configurado{Object.keys(mode.cvars).length > 1 ? "s" : ""}
                    </div>
                  )}

                  {/* Activate / Active indicator */}
                  <div className="mt-auto pt-3">
                    {isActive ? (
                      <div className="flex items-center gap-2 text-primary font-mono text-xs border border-primary/20 rounded-md px-3 py-2 bg-primary/5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Modo Ativo
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full font-mono text-xs uppercase tracking-wider h-9"
                        disabled={!!activatingId}
                        onClick={() => activateMutation.mutate(mode.id)}
                        data-testid={`btn-activate-mode-${mode.name}`}
                      >
                        {isActivating ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Ativando...</>
                        ) : (
                          "Ativar Modo"
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}



