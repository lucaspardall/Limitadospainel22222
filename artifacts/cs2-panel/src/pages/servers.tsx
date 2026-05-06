import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useListServers,
  useGetServerStatus,
} from "@workspace/api-client-react";
import { Search, Plus, AlertTriangle, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ServerStatusBadge({ serverId }: { serverId: number }) {
  const { data: status, isLoading } = useGetServerStatus(serverId, {
    query: { refetchInterval: 10000 }
  });

  if (isLoading) return <Skeleton className="h-5 w-16 bg-muted/50" />;

  if (!status?.agentReachable) {
    return (
      <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30 uppercase text-[10px] tracking-wider font-mono">
        <AlertTriangle className="w-3 h-3 mr-1" /> Inacessível
      </Badge>
    );
  }

  if (status.online) {
    return (
      <Badge variant="default" className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px] tracking-wider font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse inline-block" />
        Online
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="uppercase text-[10px] tracking-wider font-mono">
      Offline
    </Badge>
  );
}

export default function Servers() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: servers, isLoading } = useListServers();
  const { toast: _toast } = useToast();

  const filteredServers = servers?.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.ip.includes(searchTerm)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Servidores</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Gerencie suas instâncias</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar servidores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64 bg-card font-mono text-sm"
              data-testid="input-search-servers"
            />
          </div>
          <Link href="/servers/new">
            <Button className="font-mono uppercase tracking-wider text-xs" data-testid="btn-new-server">
              <Plus className="w-4 h-4 mr-2" /> Adicionar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full bg-card" />
          ))
        ) : filteredServers?.length === 0 ? (
          <div className="col-span-full p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-1">Nenhum servidor encontrado</h3>
            <p className="text-muted-foreground text-sm mb-4">Nenhum servidor corresponde à sua busca.</p>
            <Link href="/servers/new">
              <Button variant="outline" className="font-mono text-xs uppercase tracking-widest">Cadastrar Novo Servidor</Button>
            </Link>
          </div>
        ) : (
          filteredServers?.map(server => (
            <Card key={server.id} className="bg-card border-border hover:border-primary/50 transition-all overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20 flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg truncate flex items-center gap-2">
                    <Link href={`/servers/${server.id}`}>
                      <span className="hover:text-primary transition-colors cursor-pointer" data-testid={`link-server-${server.id}`}>
                        {server.name}
                      </span>
                    </Link>
                  </CardTitle>
                  <CardDescription className="font-mono text-xs mt-1 text-primary/70">{server.ip}:{server.port}</CardDescription>
                </div>
                <ServerStatusBadge serverId={server.id} />
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground line-clamp-1 flex-1">
                    {server.description || "Sem descrição."}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link href={`/servers/${server.id}`}>
                      <Button variant="secondary" size="sm" className="font-mono text-xs uppercase tracking-wider">
                        Gerenciar
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
