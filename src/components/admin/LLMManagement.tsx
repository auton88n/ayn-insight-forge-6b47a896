import { spineApi } from '@/lib/spineApi';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { 
  Bot, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Zap,
  TrendingUp,
  Activity,
  Trophy,
  Medal
} from 'lucide-react';
import { getErrorMessage, ErrorCodes } from '@/lib/errorMessages';

interface LLMModel {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  intent_type: string;
  priority: number | null;
  is_enabled: boolean | null;
  cost_per_1k_input: number | null;
  cost_per_1k_output: number | null;
  max_tokens: number | null;
  supports_streaming: boolean | null;
}

interface ModelHealth {
  modelId: string;
  successCount: number;
  failureCount: number;
  lastFailure: string | null;
  uptime: number;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3 }
  }
};

export function LLMManagement() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [healthData, setHealthData] = useState<Record<string, ModelHealth>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchModels = async () => {
    try {
      const { data, error } = await spineApi.req("GET", "/admin/llm");
      if (error) throw error;
      const d = data as any;

      const modelsData: LLMModel[] = d?.models || [];
      setModels(modelsData);

      const usageLogs: { model_id: string | null; was_fallback: boolean; created_at: string }[] = d?.recent_logs || [];
      const failures: { model_id: string | null; created_at: string }[] = d?.failures || [];
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentLogs = usageLogs.filter(l => l.created_at >= cutoff);
      const recentFailures = failures.filter(f => f.created_at >= cutoff);

      // Calculate health per model
      const health: Record<string, ModelHealth> = {};
      modelsData.forEach((model: LLMModel) => {
        const modelUsage = recentLogs.filter(l => l.model_id === model.id);
        const modelFailures = recentFailures.filter(f => f.model_id === model.id);
        const total = modelUsage.length + modelFailures.length;
        
        health[model.id] = {
          modelId: model.id,
          successCount: modelUsage.length,
          failureCount: modelFailures.length,
          lastFailure: modelFailures.length > 0 ? (modelFailures[0] as { created_at: string }).created_at : null,
          uptime: total > 0 ? (modelUsage.length / total) * 100 : 100
        };
      });
      setHealthData(health);
    } catch (error) {
      console.error('Error fetching models:', error);
      toast.error(getErrorMessage(ErrorCodes.DATA_LOAD_FAILED).description);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const toggleModel = async (modelId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('llm_models')
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', modelId);

      if (error) throw error;

      setModels(prev => prev.map(m => 
        m.id === modelId ? { ...m, is_enabled: enabled } : m
      ));
      toast.success(`Model ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling model:', error);
      toast.error(getErrorMessage(ErrorCodes.SETTINGS_SAVE_FAILED).description);
    }
  };

  const getStatusIcon = (uptime: number) => {
    if (uptime >= 99) return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (uptime >= 95) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getPriorityIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-amber-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-slate-400" />;
    return <Medal className="w-4 h-4 text-amber-700" />;
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'lovable': return 'bg-primary/10 text-primary border-primary/20';
      case 'openrouter': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.intent_type]) acc[model.intent_type] = [];
    acc[model.intent_type].push(model);
    return acc;
  }, {} as Record<string, LLMModel[]>);

  const activeModels = models.filter(m => m.is_enabled).length;
  const avgUptime = Object.values(healthData).length > 0 
    ? (Object.values(healthData).reduce((a, b) => a + b.uptime, 0) / Object.values(healthData).length)
    : 100;
  const totalCalls = Object.values(healthData).reduce((a, b) => a + b.successCount, 0);
  const totalFailures = Object.values(healthData).reduce((a, b) => a + b.failureCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        >
          <RefreshCw className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">LLM Model Management</h2>
            <p className="text-sm text-muted-foreground">
              Configure and monitor AI models with fallback chains
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => { setIsRefreshing(true); fetchModels(); }}
          disabled={isRefreshing}
          className="border-border/50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Quick Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Models', value: activeModels, icon: Zap, color: 'from-primary/20 to-primary/5', iconColor: 'text-primary' },
          { label: 'Avg Uptime (24h)', value: `${avgUptime.toFixed(1)}%`, icon: TrendingUp, color: 'from-emerald-500/20 to-emerald-500/5', iconColor: 'text-emerald-500' },
          { label: 'Total Calls (24h)', value: totalCalls, icon: Activity, color: 'from-blue-500/20 to-blue-500/5', iconColor: 'text-blue-500' },
          { label: 'Failures (24h)', value: totalFailures, icon: XCircle, color: 'from-red-500/20 to-red-500/5', iconColor: 'text-red-500' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="relative overflow-hidden border border-border/50 bg-card/80 backdrop-blur-xl">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color}`} />
              <CardContent className="relative pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-background/50">
                    <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Models by Intent */}
      <ScrollArea className="h-[500px]">
        <motion.div variants={containerVariants} className="space-y-4">
          {Object.entries(groupedModels).map(([intent, intentModels]) => (
            <motion.div key={intent} variants={itemVariants}>
              <Card className="relative overflow-hidden border border-border/50 bg-card/80 backdrop-blur-xl">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-base capitalize flex items-center gap-2">
                    {intent} Models
                    <Badge variant="outline" className="ml-2 bg-muted/50">
                      {intentModels.length} model{intentModels.length !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {intentModels.map((model, index) => {
                      const health = healthData[model.id] || { uptime: 100, successCount: 0, failureCount: 0 };
                      return (
                        <motion.div 
                          key={model.id}
                          whileHover={{ x: 4 }}
                          className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/40 hover:border-border/50 transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              {getPriorityIcon(index)}
                              {getStatusIcon(health.uptime)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium group-hover:text-primary transition-colors">
                                  {model.display_name}
                                </span>
                                <Badge variant="outline" className={getProviderColor(model.provider)}>
                                  {model.provider}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{model.model_id}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-emerald-500">{health.successCount}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-red-500">{health.failureCount}</span>
                              </div>
                              <Progress 
                                value={health.uptime} 
                                className="h-1.5 w-24 mt-1"
                              />
                            </div>
                            <Switch
                              checked={model.is_enabled ?? false}
                              onCheckedChange={(checked) => toggleModel(model.id, checked)}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </ScrollArea>
    </motion.div>
  );
}
