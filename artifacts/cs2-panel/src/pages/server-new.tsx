import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateServer, getListServersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";
import { Link } from "wouter";

const serverSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ip: z.string().min(1, "IP address is required"),
  port: z.coerce.number().min(1).max(65535),
  agentUrl: z.string().url("Must be a valid URL"),
  agentToken: z.string().min(1, "Agent token is required"),
  description: z.string().optional(),
});

export default function NewServer() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof serverSchema>>({
    resolver: zodResolver(serverSchema),
    defaultValues: {
      name: "",
      ip: "",
      port: 27015,
      agentUrl: "",
      agentToken: "",
      description: "",
    },
  });

  const createMutation = useCreateServer();

  const onSubmit = (values: z.infer<typeof serverSchema>) => {
    createMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
        toast({
          title: "Instance Deployed",
          description: "Server registered successfully.",
        });
        setLocation(`/servers/${data.id}`);
      },
      onError: (error) => {
        toast({
          title: "Deployment Failed",
          description: error.response?.statusText || "An error occurred",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/servers">
          <Button variant="outline" size="icon" className="h-8 w-8 bg-card border-border hover:bg-muted" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-foreground">Deploy Instance</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Register a new CS2 server node</p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="border-b border-border/50 bg-muted/10">
          <CardTitle className="font-mono text-lg">Configuration Parameters</CardTitle>
          <CardDescription>Enter connection details for the remote agent.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Instance Name</FormLabel>
                      <FormControl>
                        <Input placeholder="EU-West Competitive" {...field} className="bg-background/50 font-mono" data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Primary match server" {...field} className="bg-background/50 font-mono" data-testid="input-desc" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="ip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">IP Address</FormLabel>
                      <FormControl>
                        <Input placeholder="192.168.1.100" {...field} className="bg-background/50 font-mono" data-testid="input-ip" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Port</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="27015" {...field} className="bg-background/50 font-mono" data-testid="input-port" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="agentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Agent URL</FormLabel>
                      <FormControl>
                        <Input placeholder="http://192.168.1.100:8080" {...field} className="bg-background/50 font-mono" data-testid="input-agent-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="agentToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Agent Token</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Secret token" {...field} className="bg-background/50 font-mono" data-testid="input-agent-token" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                  className="font-mono uppercase tracking-widest text-xs"
                  data-testid="btn-submit"
                >
                  {createMutation.isPending ? "Deploying..." : (
                    <><Save className="w-4 h-4 mr-2" /> Deploy Node</>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
