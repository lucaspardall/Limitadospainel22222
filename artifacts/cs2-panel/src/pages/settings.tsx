import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Terminal, Bell, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Settings() {
  const { user } = useAuth();
  
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Configuration</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">System preferences and preferences</p>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="border-b border-border/50 bg-muted/10">
            <CardTitle className="font-mono text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Security
            </CardTitle>
            <CardDescription>Authentication and access controls</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Two-Factor Authentication</Label>
                <p className="text-xs text-muted-foreground">Require 2FA for all admin accounts</p>
              </div>
              <Switch disabled checked={true} />
            </div>
            <div className="flex items-center justify-between pb-2">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Session Timeout</Label>
                <p className="text-xs text-muted-foreground">Automatically log out after inactivity</p>
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
            <CardDescription>Display preferences</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Dark Mode</Label>
                <p className="text-xs text-muted-foreground">Tactical interface theme</p>
              </div>
              <Switch checked={true} disabled />
            </div>
            <div className="flex items-center justify-between pb-2">
              <div className="space-y-0.5">
                <Label className="font-mono font-bold uppercase tracking-wider text-xs">Telemetry Refresh</Label>
                <p className="text-xs text-muted-foreground">Log polling interval</p>
              </div>
              <div className="font-mono text-sm text-primary">5000ms</div>
            </div>
          </CardContent>
        </Card>

        <div className="p-4 border border-dashed border-border rounded-lg text-center bg-muted/5">
          <p className="text-muted-foreground text-sm font-mono">Further configuration options will be available in future intelligence drops.</p>
        </div>
      </div>
    </div>
  );
}
