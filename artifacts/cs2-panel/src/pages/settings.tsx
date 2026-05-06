import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Terminal } from "lucide-react";

export default function Settings() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Preferências do sistema</p>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Segurança
            </CardTitle>
            <CardDescription>Autenticação e controle de acesso</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Autenticação em dois fatores</Label>
                <p className="text-xs text-muted-foreground">Exigir 2FA para todas as contas admin</p>
              </div>
              <Switch disabled checked={true} />
            </div>
            <div className="flex items-center justify-between pb-2">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Expiração de sessão</Label>
                <p className="text-xs text-muted-foreground">Logout automático após inatividade</p>
              </div>
              <div className="font-mono text-sm text-primary">24h</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" /> Interface
            </CardTitle>
            <CardDescription>Preferências de exibição</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Modo escuro</Label>
                <p className="text-xs text-muted-foreground">Tema tático da interface</p>
              </div>
              <Switch checked={true} disabled />
            </div>
            <div className="flex items-center justify-between pb-2">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Intervalo de atualização</Label>
                <p className="text-xs text-muted-foreground">Frequência de polling dos logs</p>
              </div>
              <div className="font-mono text-sm text-primary">5000ms</div>
            </div>
          </CardContent>
        </Card>

        <div className="p-4 border border-dashed border-border rounded-lg text-center bg-muted/5">
          <p className="text-muted-foreground text-sm font-mono">Mais opções de configuração estarão disponíveis em breve.</p>
        </div>
      </div>
    </div>
  );
}
