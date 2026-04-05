import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAdminAICosts, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';
import { AdminSkeleton } from '@/admin-app/hooks/AdminSkeleton';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Calendar,
  Zap,
  PieChart,
  Activity,
  CheckCircle,
  Clock,
  Hash,
  Cpu
} from 'lucide-react';

interface UsageStats {
  today: number;
  week: number;
  month: number;
  byIntent: Record<string, number>;
  byModel: Record<string, { count: number; inputTokens: number; outputTokens: number }>;
  avgResponseTime: number | null;
  successRate: number | null;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function AICostDashboard() {
  const queryClient = useQueryClient();
  const { data: rawData, isLoading } = useAdminAICosts();

  const d = (rawData || {}) as any;
  const stats = useMemo(() => ({
    today: Number(d.today_count || 0),
    week: Number(d.week_count || 0),
    month: Number(d.month_count || 0),
    byIntent: {} as Record<string, number>,
    byModel: d.by_model ? Object.fromEntries((d.by_model).map((m: any) => [m.model, m.count])) : {} as Record<string, any>,
    avgResponseTime: null as number | null,
    successRate: d.today_count > 0 ? Math.round(((d.today_count - d.today_failures) / d.today_count) * 100) : 100,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  }), [d]);
  const fallbackRate = d.today_count > 0 ? Math.round((d.fallback_today / d.today_count) * 100) : 0;

  // Estimated costs based on AI gateway billing
  const ESTIMATED_COST_PER_MSG = 0.0174;
  const estimatedCostToday = stats.today * ESTIMATED_COST_PER_MSG;
  const estimatedCostWeek = stats.week * ESTIMATED_COST_PER_MSG;
  const estimatedCostMonth = stats.month * ESTIMATED_COST_PER_MSG;
  const projectedMonthly = (stats.today * 30) * ESTIMATED_COST_PER_MSG;

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  const avgCostPerMessage = stats.month > 0 ? estimatedCostMonth / stats.month : 0;
  const estimatedCostPerToken = totalTokens > 0 ? estimatedCostMonth / totalTokens : 0;
  const avgTokensPerMessage = stats.month > 0 ? totalTokens / stats.month : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <DollarSign className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">AI Cost Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Monitor AI usage, token consumption, and estimated costs
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: adminKeys.aiCosts() })}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* Cost Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Today', value: `$${estimatedCostToday.toFixed(2)}`, sub: `${stats.today} requests`, icon: Calendar },
          { label: 'This Week', value: `$${estimatedCostWeek.toFixed(2)}`, sub: `${stats.week} requests`, icon: TrendingUp },
          { label: 'This Month', value: `$${estimatedCostMonth.toFixed(2)}`, sub: `${stats.month} requests`, icon: DollarSign },
          { label: 'Projected', value: `$${projectedMonthly.toFixed(2)}`, sub: 'per month', icon: TrendingDown },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border border-border bg-card">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-Message & Per-Token Costs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-border bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Avg Cost / Message</p>
            </div>
            <p className="text-2xl font-bold">
              ${avgCostPerMessage.toFixed(4)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {stats.month} messages this month
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Est. Cost / 1K Tokens</p>
            </div>
            <p className="text-2xl font-bold">
              {totalTokens > 0 ? `$${(estimatedCostPerToken * 1000).toFixed(4)}` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalTokens > 0 ? `${totalTokens.toLocaleString()} total tokens` : 'Awaiting token data'}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Avg Tokens / Message</p>
            </div>
            <p className="text-2xl font-bold">
              {avgTokensPerMessage > 0 ? Math.round(avgTokensPerMessage).toLocaleString() : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              In: {stats.totalInputTokens.toLocaleString()} / Out: {stats.totalOutputTokens.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Input vs Output Ratio</p>
            </div>
            <p className="text-2xl font-bold">
              {totalTokens > 0 ? `${((stats.totalInputTokens / totalTokens) * 100).toFixed(0)}% / ${((stats.totalOutputTokens / totalTokens) * 100).toFixed(0)}%` : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Input tokens vs output tokens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-4 h-4 text-muted-foreground" />
              Usage by Intent (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.byIntent).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No usage data yet</p>
              ) : (
                Object.entries(stats.byIntent)
                  .sort(([, a], [, b]) => b - a)
                  .map(([intent, count]) => {
                    const percentage = (count / stats.month) * 100;
                    return (
                      <div key={intent} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">{intent}</span>
                          <span className="text-sm text-muted-foreground">
                            {count} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Model Usage Breakdown */}
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              Usage by Model (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.byModel).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No model data yet — send a message to start tracking</p>
              ) : (
                Object.entries(stats.byModel)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([model, data]) => {
                    const modelTokens = data.inputTokens + data.outputTokens;
                    const shortName = model.split('/').pop() || model;
                    return (
                      <div key={model} className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{shortName}</span>
                          <Badge variant="outline" className="text-xs">
                            {data.count} calls
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>In: {data.inputTokens.toLocaleString()}</span>
                          <span>Out: {data.outputTokens.toLocaleString()}</span>
                          <span>Total: {modelTokens.toLocaleString()}</span>
                        </div>
                        {data.count > 0 && modelTokens > 0 && (
                          <p className="text-xs text-muted-foreground">
                            ~{Math.round(modelTokens / data.count)} tokens/msg • ~${((data.count * ESTIMATED_COST_PER_MSG) / 1).toFixed(2)} est. cost
                          </p>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { 
                label: 'Fallback Rate', 
                desc: 'When primary models fail',
                value: fallbackRate !== null ? `${fallbackRate.toFixed(1)}%` : 'No data',
                status: fallbackRate !== null ? (fallbackRate < 5 ? 'success' : fallbackRate < 15 ? 'warning' : 'error') : 'neutral',
                icon: Activity
              },
              { 
                label: 'Avg Response Time', 
                desc: 'Typical AI response latency',
                value: stats.avgResponseTime !== null ? `${(stats.avgResponseTime / 1000).toFixed(1)}s` : 'No data',
                status: 'neutral',
                icon: Clock
              },
              { 
                label: 'Success Rate', 
                desc: 'Successful AI responses',
                value: stats.successRate !== null ? `${stats.successRate.toFixed(1)}%` : 'No data',
                status: stats.successRate !== null ? (stats.successRate >= 95 ? 'success' : stats.successRate >= 80 ? 'warning' : 'error') : 'neutral',
                icon: CheckCircle
              },
            ].map((item) => {
              const Icon = item.icon;
              const statusColors: Record<string, string> = {
                success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                error: 'bg-red-500/10 text-red-600 border-red-500/20',
                neutral: 'bg-muted text-muted-foreground border-border'
              };
              
              return (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-background">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={statusColors[item.status]}>
                    {item.value}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
