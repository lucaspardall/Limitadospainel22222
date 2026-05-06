import { useGetDashboardSummary, useGetDashboardActivity, useListServers } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Activity, Users, Power, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const ACTIVITY_LABELS: Record<string, string> = {
  server_start:   "Servidor iniciado",
  server_stop:    "Servidor parado",
  server_restart: "Servidor reiniciado",
  player_kick:    "Jogador kickado",
  player_ban:     "Jogador banido",
  plugin_change:  "Plugin alterado",
  user_login:     "Login efetuado",
  rcon_command:   "Comando RCON",
};

function StatCard({ title, value, icon: Icon, description, isLoading }: any) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium font-mono uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-primary" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20 bg-muted/50" />
        ) : (
          <div className="text-2xl font-bold font-mono">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity();
  const { data: servers, isLoading: serversLoading } = useListServers();

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Visão Geral</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Servidores"
          value={summary?.totalServers ?? 0}
          icon={HardDrive}
          description="Instâncias registradas"
          isLoading={summaryLoading}
        />
        <StatCard
          title="Online"
          value={summary?.onlineServers ?? 0}
          icon={Power}
          description="Acessíveis agora"
          isLoading={summaryLoading}
        />
        <StatCard
          title="Jogadores"
          value={summary?.totalPlayers ?? 0}
          icon={Users}
          description="Em todos os servidores"
          isLoading={summaryLoading}
        />
        <StatCard
          title="Equipe"
          value={summary?.totalUsers ?? 0}
          icon={Activity}
          description="Usuários registrados"
          isLoading={summaryLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold font-mono uppercase tracking-widest border-b border-border pb-2">Servidores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {serversLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full bg-card" />
              ))
            ) : servers?.length === 0 ? (
              <div className="col-span-2 p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground">
                Nenhum servidor cadastrado.{" "}
                <Link href="/servers/new" className="text-primary hover:underline">Adicionar agora.</Link>
              </div>
            ) : (
              servers?.map(server => (
                <Card key={server.id} className="bg-card hover:border-primary/50 transition-colors">
                  <Link href={`/servers/${server.id}`}>
                    <div className="block cursor-pointer" data-testid={`card-server-${server.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg truncate">{server.name}</CardTitle>
                          <Server className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <CardDescription className="font-mono text-xs">{server.ip}:{server.port}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2 items-center">
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Online</Badge>
                        </div>
                      </CardContent>
                    </div>
                  </Link>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold font-mono uppercase tracking-widest border-b border-border pb-2">Atividade Recente</h2>
          <div className="space-y-3">
            {activityLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-card" />
              ))
            ) : activity?.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Sem atividade recente</div>
            ) : (
              activity?.slice(0, 10).map(entry => (
                <div key={entry.id} className="flex gap-3 text-sm p-3 bg-card border border-border rounded-md">
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-primary uppercase text-xs tracking-wider">
                        {ACTIVITY_LABELS[entry.type] ?? entry.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <span className="text-foreground text-xs">{entry.details}</span>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{entry.serverName || "Sistema"}</span>
                      <span>Por: {entry.userName || "Sistema"}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
