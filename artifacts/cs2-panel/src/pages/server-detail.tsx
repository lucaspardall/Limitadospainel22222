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
  getGetServerStatusQueryKey,
  getGetServerLogsQueryKey,
  getListPlayersQueryKey,
  getListPluginsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, Square, RotateCcw, DownloadCloud, Terminal, 
  Activity, Cpu, MemoryStick, Clock, Users, Map, ShieldAlert,
  AlertTriangle, Check, X, ShieldOff, Ban, MessageSquareOff
} from "lucide-react";
import { cn } from "@/lib/utils";

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
        toast({ title: "Command Sent", description: `${actionName} command executed.` });
        queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey(serverId) });
      },
      onError: (err: any) => {
        toast({ title: "Action Failed", description: err.message || "An error occurred", variant: "destructive" });
      }
    });
  };

  if (serverLoading) return <div className="p-6"><Skeleton className="h-64 w-full bg-card" /></div>;
  if (!server) return <div className="p-6 text-destructive">Server not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold font-mono tracking-widest text-foreground">{server.name}</h1>
            {statusLoading ? <Skeleton className="h-6 w-20 bg-muted" /> : 
              !status?.agentReachable ? <Badge variant="destructive" className="uppercase text-[10px] tracking-wider font-mono">Unreachable</Badge> :
              status.online ? <Badge className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px] tracking-wider font-mono"><span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse"></span>Online</Badge> :
              <Badge variant="secondary" className="uppercase text-[10px] tracking-wider font-mono">Offline</Badge>
            }
          </div>
          <p className="text-primary font-mono text-sm">{server.ip}:{server.port}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="font-mono text-xs uppercase tracking-wider bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground"
            disabled={!status?.agentReachable || status?.online || startMutation.isPending}
            onClick={() => handleAction(startMutation, "Start")}
            data-testid="btn-start"
          >
            <Play className="w-4 h-4 mr-2" /> Init
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs uppercase tracking-wider bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive hover:text-destructive-foreground"
            disabled={!status?.agentReachable || !status?.online || stopMutation.isPending}
            onClick={() => handleAction(stopMutation, "Stop")}
            data-testid="btn-stop"
          >
            <Square className="w-4 h-4 mr-2" /> Halt
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs uppercase tracking-wider"
            disabled={!status?.agentReachable || restartMutation.isPending}
            onClick={() => handleAction(restartMutation, "Restart")}
            data-testid="btn-restart"
          >
            <RotateCcw className="w-4 h-4 mr-2" /> Restart
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs uppercase tracking-wider"
            disabled={!status?.agentReachable || status?.online || updateMutation.isPending}
            onClick={() => handleAction(updateMutation, "Update")}
            title="Server must be stopped to update"
            data-testid="btn-update"
          >
            <DownloadCloud className="w-4 h-4 mr-2" /> Update Core
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border w-full justify-start rounded-none h-12 p-0 overflow-x-auto">
          <TabsTrigger value="overview" className="rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-6">Overview</TabsTrigger>
          <TabsTrigger value="players" className="rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-6">Players</TabsTrigger>
          <TabsTrigger value="plugins" className="rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-6">Plugins</TabsTrigger>
          <TabsTrigger value="logs" className="rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-6">Telemetry</TabsTrigger>
          <TabsTrigger value="console" className="rounded-none h-full data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary font-mono text-xs uppercase tracking-widest px-6">Terminal</TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="overview">
            <OverviewTab serverId={serverId} status={status} isLoading={statusLoading} />
          </TabsContent>
          <TabsContent value="players">
            <PlayersTab serverId={serverId} status={status} />
          </TabsContent>
          <TabsContent value="plugins">
            <PluginsTab serverId={serverId} status={status} />
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

function OverviewTab({ serverId, status, isLoading }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card className="bg-card border-border lg:col-span-3">
        <CardHeader className="pb-2 border-b border-border/50">
          <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Live Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center"><Users className="w-3 h-3 mr-1"/> Players</span>
              <div className="text-2xl font-bold font-mono">{isLoading ? "-" : `${status?.playerCount || 0}/${status?.maxPlayers || 0}`}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center"><Map className="w-3 h-3 mr-1"/> Map</span>
              <div className="text-xl font-bold font-mono truncate text-primary">{isLoading ? "-" : (status?.map || "None")}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center"><Cpu className="w-3 h-3 mr-1"/> CPU</span>
              <div className="text-2xl font-bold font-mono">{isLoading ? "-" : `${status?.cpuUsage?.toFixed(1) || 0}%`}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center"><MemoryStick className="w-3 h-3 mr-1"/> RAM</span>
              <div className="text-2xl font-bold font-mono">{isLoading ? "-" : `${status?.ramUsage || 0} MB`}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center"><Clock className="w-3 h-3 mr-1"/> Uptime</span>
              <div className="text-lg font-bold font-mono">{isLoading ? "-" : (status?.uptime || "0s")}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlayersTab({ serverId, status }: { serverId: number, status: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: players, isLoading } = useListPlayers(serverId, {
    query: { enabled: !!serverId && !!status?.online, refetchInterval: 10000 }
  });

  const kickMutation = useKickPlayer();
  const banMutation = useBanPlayer();
  const muteMutation = useMutePlayer();

  const handleAction = (mutation: any, steamId: string, actionDesc: string) => {
    mutation.mutate({ serverId, steamId, data: { reason: "Admin action" } }, {
      onSuccess: () => {
        toast({ title: "Command Sent", description: `Player ${actionDesc} successfully.` });
        queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey(serverId) });
      },
      onError: () => {
        toast({ title: "Action Failed", description: "Could not execute command", variant: "destructive" });
      }
    });
  };

  if (!status?.online) {
    return <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-lg font-mono text-sm uppercase tracking-widest">Instance must be online</div>;
  }

  return (
    <Card className="bg-card border-border">
      <Table>
        <TableHeader className="bg-muted/20">
          <TableRow className="border-border">
            <TableHead className="font-mono text-xs uppercase tracking-wider">Player</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider">SteamID</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Score</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Ping</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Time</TableHead>
            <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center p-4">Loading roster...</TableCell>
            </TableRow>
          ) : players?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center p-8 text-muted-foreground font-mono text-sm">No connected players</TableCell>
            </TableRow>
          ) : (
            players?.map((player) => (
              <TableRow key={player.steamId} className="border-border/50">
                <TableCell className="font-medium">{player.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{player.steamId}</TableCell>
                <TableCell className="text-right font-mono text-primary">{player.score}</TableCell>
                <TableCell className={cn("text-right font-mono", player.ping > 100 ? "text-destructive" : player.ping > 50 ? "text-yellow-500" : "text-primary")}>{player.ping}ms</TableCell>
                <TableCell className="text-right font-mono text-xs">{player.duration}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="outline" size="icon" className="h-7 w-7 border-border hover:bg-yellow-500/20 hover:text-yellow-500" onClick={() => handleAction(muteMutation, player.steamId, "muted")} title="Mute">
                    <MessageSquareOff className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 border-border hover:bg-orange-500/20 hover:text-orange-500" onClick={() => handleAction(kickMutation, player.steamId, "kicked")} title="Kick">
                    <ShieldOff className="h-3 w-3" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 border-destructive/30 hover:bg-destructive/20 text-destructive" onClick={() => handleAction(banMutation, player.steamId, "banned")} title="Ban">
                    <Ban className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function PluginsTab({ serverId, status }: { serverId: number, status: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: plugins, isLoading } = useListPlugins(serverId, {
    query: { enabled: !!serverId && status?.agentReachable }
  });

  const enableMutation = useEnablePlugin();
  const disableMutation = useDisablePlugin();

  const togglePlugin = (pluginId: string, enabled: boolean) => {
    const mutation = enabled ? disableMutation : enableMutation;
    mutation.mutate({ serverId, pluginId }, {
      onSuccess: () => {
        toast({ title: "Configuration Updated", description: `Plugin status toggled.` });
        queryClient.invalidateQueries({ queryKey: getListPluginsQueryKey(serverId) });
      },
      onError: () => {
        toast({ title: "Update Failed", description: "Could not modify plugin state", variant: "destructive" });
      }
    });
  };

  if (!status?.agentReachable) {
    return <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-lg font-mono text-sm uppercase tracking-widest">Agent Unreachable</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {isLoading ? (
        Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 bg-card" />)
      ) : plugins?.length === 0 ? (
        <div className="col-span-full p-12 text-center text-muted-foreground border border-dashed border-border rounded-lg">No plugins installed</div>
      ) : (
        plugins?.map((plugin) => (
          <Card key={plugin.id} className={cn("bg-card border-border transition-colors", plugin.enabled ? "border-primary/30" : "opacity-75")}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  {plugin.name}
                  {plugin.enabled && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </CardTitle>
                <CardDescription className="font-mono text-xs mt-1">v{plugin.version} | {plugin.author}</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className={cn("h-7 px-2 font-mono text-[10px] uppercase", plugin.enabled ? "border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground" : "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground")}
                onClick={() => togglePlugin(plugin.id, plugin.enabled)}
                disabled={enableMutation.isPending || disableMutation.isPending}
              >
                {plugin.enabled ? "Disable" : "Enable"}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function LogsTab({ serverId }: { serverId: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: logs, isLoading } = useGetServerLogs(serverId, { lines: 100 }, {
    query: { enabled: !!serverId, refetchInterval: 5000 }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (level: string) => {
    switch(level) {
      case 'error': return 'text-destructive';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-foreground';
      case 'debug': return 'text-muted-foreground';
      default: return 'text-foreground';
    }
  };

  return (
    <Card className="bg-[#0a0a0c] border-border overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/50 bg-black/40">
        <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center text-muted-foreground">
          <Terminal className="w-3 h-3 mr-2" /> Server Output Stream
        </CardTitle>
      </CardHeader>
      <ScrollArea className="h-[500px]" ref={scrollRef}>
        <div className="p-4 font-mono text-xs leading-relaxed space-y-1">
          {isLoading && !logs ? (
            <div className="text-primary animate-pulse">Establishing stream...</div>
          ) : logs?.length === 0 ? (
            <div className="text-muted-foreground">No telemetry available</div>
          ) : (
            logs?.map((log) => (
              <div key={log.id} className="flex gap-3 hover:bg-white/5 px-1 rounded">
                <span className="text-muted-foreground opacity-50 shrink-0 w-[140px]">{log.timestamp.split('T')[1].replace('Z','')}</span>
                <span className={cn("shrink-0 uppercase w-12", getLogColor(log.level))}>{log.level}</span>
                <span className={cn("break-all", getLogColor(log.level))}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

function ConsoleTab({ serverId, status }: { serverId: number, status: any }) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<{type: 'req'|'res', text: string}[]>([]);
  const { toast } = useToast();
  
  const rconMutation = useSendRconCommand();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !status?.online) return;
    
    const cmd = command;
    setCommand("");
    setHistory(h => [...h, { type: 'req', text: `> ${cmd}` }]);
    
    rconMutation.mutate({ serverId, data: { command: cmd } }, {
      onSuccess: (res: any) => {
        if (res.data?.response) {
          setHistory(h => [...h, { type: 'res', text: res.data.response }]);
        } else {
          setHistory(h => [...h, { type: 'res', text: 'Command executed.' }]);
        }
      },
      onError: (err: any) => {
        setHistory(h => [...h, { type: 'res', text: `Error: ${err.message || 'Failed to execute'}` }]);
      }
    });
  };

  return (
    <Card className="bg-[#0a0a0c] border-border overflow-hidden flex flex-col h-[600px]">
      <CardHeader className="py-3 px-4 border-b border-border/50 bg-black/40">
        <CardTitle className="font-mono text-xs uppercase tracking-widest flex items-center text-primary">
          <Terminal className="w-3 h-3 mr-2" /> RCON Interface
        </CardTitle>
      </CardHeader>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 font-mono text-xs leading-relaxed space-y-1">
          <div className="text-muted-foreground mb-4">CS2 Remote Console connected. Instance is {status?.online ? 'ONLINE' : 'OFFLINE'}.</div>
          {history.map((entry, i) => (
            <div key={i} className={cn("whitespace-pre-wrap", entry.type === 'req' ? 'text-primary mt-2' : 'text-foreground opacity-80')}>
              {entry.text}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border/50 bg-black/40">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input 
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={!status?.online || rconMutation.isPending}
            placeholder={status?.online ? "Enter RCON command..." : "Server is offline"}
            className="bg-transparent border-border/50 font-mono focus-visible:ring-primary/30"
          />
          <Button 
            type="submit" 
            disabled={!status?.online || rconMutation.isPending || !command.trim()}
            className="font-mono text-xs uppercase tracking-wider"
          >
            Execute
          </Button>
        </form>
      </div>
    </Card>
  );
}
