import { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldAlert } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  username: z.string().min(1, "Usuário obrigatório"),
  password: z.string().min(1, "Senha obrigatória"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { setToken, token } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useLogin();

  useEffect(() => {
    if (token) setLocation("/dashboard");
  }, [token, setLocation]);

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        setToken(data.token);
        toast({ title: "Acesso liberado", description: "Bem-vindo ao Limitados Painel." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Acesso negado",
          description: (error as any).response?.status === 401 ? "Usuário ou senha inválidos" : "Ocorreu um erro",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="h-full w-full" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm border-primary/20 shadow-2xl relative z-10">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
        <CardHeader className="space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-lg">
              <ShieldAlert className="w-10 h-10 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <CardTitle className="text-2xl font-mono tracking-wider font-bold">LIMITADOS</CardTitle>
            <CardDescription className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
              Painel de Gerenciamento CS2
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Usuário</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nome de usuário"
                        {...field}
                        className="bg-background/50 font-mono focus-visible:ring-primary/50"
                        data-testid="input-username"
                        autoComplete="username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Senha</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="bg-background/50 font-mono focus-visible:ring-primary/50"
                        data-testid="input-password"
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full font-mono font-bold tracking-widest uppercase transition-all duration-200"
                disabled={loginMutation.isPending}
                data-testid="btn-submit-login"
              >
                {loginMutation.isPending ? "Autenticando..." : "Entrar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
