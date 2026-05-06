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
import { ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const userSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
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
    defaultValues: {
      username: "",
      password: "",
      role: "user",
    },
  });

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "User Created", description: "Operator profile registered successfully." });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Creation Failed", description: err.response?.statusText || "An error occurred", variant: "destructive" });
      }
    });
  };

  const handleDelete = (userId: number) => {
    if (userId === currentUser?.id) {
      toast({ title: "Action Denied", description: "Cannot delete your own profile.", variant: "destructive" });
      return;
    }

    if (confirm("Are you sure you want to permanently delete this operator?")) {
      deleteMutation.mutate({ userId }, {
        onSuccess: () => {
          toast({ title: "User Deleted", description: "Operator profile removed." });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Deletion Failed", description: err.response?.statusText || "An error occurred", variant: "destructive" });
        }
      });
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="p-12 text-center text-destructive font-mono flex flex-col items-center">
        <ShieldAlert className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-bold uppercase tracking-widest">Unauthorized Access</h2>
        <p className="text-sm mt-2 opacity-80">Security clearance level insufficient for this quadrant.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Personnel</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Manage system operators and clearances</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono uppercase tracking-wider text-xs">
              <UserPlus className="w-4 h-4 mr-2" /> Add Operator
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest">Register New Operator</DialogTitle>
              <DialogDescription className="font-mono text-xs">Provision a new user account with system access.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Operator ID</FormLabel>
                      <FormControl>
                        <Input placeholder="username" {...field} className="bg-background/50 font-mono" />
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
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Security Key</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background/50 font-mono" />
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
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Clearance Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background/50 font-mono">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="user">User (Standard)</SelectItem>
                          <SelectItem value="admin">Admin (Full Access)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="font-mono text-xs uppercase">Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="font-mono text-xs uppercase tracking-widest">
                    {createMutation.isPending ? "Provisioning..." : "Provision"}
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
              <TableHead className="font-mono text-xs uppercase tracking-wider">Operator</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Clearance</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Inducted</TableHead>
              <TableHead className="text-right font-mono text-xs uppercase tracking-wider">Actions</TableHead>
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
                <TableCell colSpan={5} className="text-center p-8 text-muted-foreground font-mono text-sm">No operators found</TableCell>
              </TableRow>
            ) : (
              users?.map((u) => (
                <TableRow key={u.id} className="border-border/50">
                  <TableCell className="font-mono text-muted-foreground text-xs">#{u.id.toString().padStart(4, '0')}</TableCell>
                  <TableCell className="font-medium font-mono flex items-center gap-2">
                    {u.username}
                    {u.id === currentUser?.id && <Badge variant="outline" className="text-[9px] h-4 py-0">YOU</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className={cn("uppercase text-[10px] tracking-wider font-mono", u.role === 'admin' ? "bg-primary/20 text-primary border-primary/30" : "")}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {format(new Date(u.createdAt), "yyyy-MM-dd")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8 border-destructive/30 hover:bg-destructive/20 text-destructive disabled:opacity-30" 
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id || deleteMutation.isPending}
                      title="Revoke Access"
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
