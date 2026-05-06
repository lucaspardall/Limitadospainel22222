import { useState } from "react";
import { useListUsers, useCreateUser, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const userSchema = z.object({
  username: z.string().min(3, "Usuário precisa ter ao menos 3 caracteres"),
  password: z.string().min(6, "Senha precisa ter ao menos 6 caracteres"),
  role: z.enum(["admin", "user"]),
});

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: users, isLoading } = useListUsers();
  const createMutation = useCreateUser();
  const deleteMutation = useDeleteUser();

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: "", password: "", role: "user" },
  });

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Usuário criado", description: "Perfil registrado com sucesso." });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Erro ao criar", description: err.response?.statusText || "Ocorreu um erro", variant: "destructive" });
      }
    });
  };

  const handleDelete = (userId: number) => {
    if (userId === currentUser?.id) {
      toast({ title: "Ação negada", description: "Você não pode excluir seu próprio perfil.", variant: "destructive" });
      return;
    }
    if (confirm("Tem certeza que deseja excluir este usuário permanentemente?")) {
      deleteMutation.mutate({ userId }, {
        onSuccess: () => {
          toast({ title: "Usuário excluído", description: "Perfil removido com sucesso." });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Erro ao excluir", description: err.response?.statusText || "Ocorreu um erro", variant: "destructive" });
        }
      });
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="p-12 text-center text-destructive font-mono flex flex-col items-center">
        <ShieldAlert className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-widest">Acesso Negado</h2>
        <p className="text-sm mt-2 opacity-80">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Usuários do Painel</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Gerencie operadores e permissões</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono uppercase tracking-wider text-xs">
              <UserPlus className="w-4 h-4 mr-2" /> Adicionar Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest">Novo Usuário</DialogTitle>
              <DialogDescription className="font-mono text-xs">Crie uma nova conta de acesso ao painel.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Usuário</FormLabel>
                      <FormControl>
                        <Input placeholder="nome de usuário" {...field} className="bg-background/50 font-mono" autoComplete="off" />
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
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 font-mono" autoComplete="new-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Nível de Acesso</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 font-mono">
                            <SelectValue placeholder="Selecionar cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">Usuário (padrão)</SelectItem>
                          <SelectItem value="admin">Admin (acesso total)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="font-mono text-xs uppercase">Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="font-mono text-xs uppercase tracking-widest">
                    {createMutation.isPending ? "Criando..." : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow className="border-border">
              <TableHead className="font-mono text-xs uppercase tracking-wider w-[80px]">ID</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Usuário</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Cargo</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Criado em</TableHead>
              <TableHead className="text-right font-mono text-xs uppercase tracking-wider">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="p-4"><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center p-8 text-muted-foreground font-mono text-sm">Nenhum usuário encontrado</TableCell>
              </TableRow>
            ) : (
              users?.map((u) => (
                <TableRow key={u.id} className="border-border/50">
                  <TableCell className="font-mono text-muted-foreground text-xs">#{u.id.toString().padStart(4, '0')}</TableCell>
                  <TableCell className="font-medium font-mono flex items-center gap-2">
                    {u.username}
                    {u.id === currentUser?.id && (
                      <Badge variant="outline" className="text-[9px] h-4 py-0">VOCÊ</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === 'admin' ? 'default' : 'secondary'}
                      className={cn("uppercase text-[10px] tracking-wider font-mono", u.role === 'admin' ? "bg-primary/20 text-primary border-primary/30" : "")}
                    >
                      {u.role === 'admin' ? 'Admin' : 'Usuário'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {format(new Date(u.createdAt), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 border-destructive/30 hover:bg-destructive/20 text-destructive disabled:opacity-30"
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id || deleteMutation.isPending}
                      title="Remover acesso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
