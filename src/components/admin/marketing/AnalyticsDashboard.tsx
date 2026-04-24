import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { TrendingUp, Eye, Heart, Repeat, MessageCircle, Loader2, Zap } from 'lucide-react';

interface TwitterPost {
  id: string;
  content: string;
  status: string;
  content_type: string | null;
  target_audience: string | null;
  psychological_strategy: string | null;
  impressions: number | null;
  likes: number | null;
  retweets: number | null;
  replies: number | null;
  created_at: string;
  posted_at: string | null;
}

const THEME_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--primary) / 0.6)',
  'hsl(var(--muted-foreground) / 0.5)',
];

// Skeleton placeholder
const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div className="animate-pulse space-y-2" style={{ height }}>
    <div className="flex items-end gap-1 h-full pt-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex-1 bg-muted/30 rounded-t" style={{ height: `${30 + Math.random() * 60}%` }} />
      ))}
    </div>
  </div>
);

export const AnalyticsDashboard = () => {
  const [posts, setPosts] = useState<TwitterPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('twitter_posts')
        .select('*')
        .eq('status', 'posted')
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts((data as unknown as TwitterPost[]) || []);
      setIsLoading(false);
    };
    load();
  }, []);

  if (isLoading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="animate-pulse space-y-2"><div className="h-3 bg-muted/30 rounded w-16" /><div className="h-8 bg-muted/20 rounded w-20 mt-2" /></div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardHeader className="pb-2"><div className="h-4 bg-muted/30 rounded w-32 animate-pulse" /></CardHeader><CardContent><ChartSkeleton /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  // Empty state with placeholder charts
  if (posts.length === 0) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Impressions', icon: Eye },
          { label: 'Likes', icon: Heart },
          { label: 'Retweets', icon: Repeat },
          { label: 'Replies', icon: MessageCircle },
        ].map(({ label, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-muted-foreground/20">0</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted/20 flex items-center justify-center mx-auto">
            <TrendingUp className="w-6 h-6 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">No analytics data yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Post content to X and analytics will appear here automatically</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const totalImpressions = posts.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
  const totalRetweets = posts.reduce((s, p) => s + (p.retweets || 0), 0);
  const totalReplies = posts.reduce((s, p) => s + (p.replies || 0), 0);
  const engagementRate = totalImpressions > 0 ? ((totalLikes + totalRetweets) / totalImpressions * 100).toFixed(2) : '0';

  // Content type breakdown
  const typeBreakdown = posts.reduce((acc, p) => {
    const type = p.content_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const pieData = Object.entries(typeBreakdown).map(([name, value]) => ({ name, value }));

  // Engagement over time
  const timeData = posts.slice(0, 14).reverse().map(p => ({
    date: new Date(p.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    impressions: p.impressions || 0,
    likes: p.likes || 0,
    retweets: p.retweets || 0,
  }));

  // Best performers
  const topPosts = [...posts].sort((a, b) => ((b.likes || 0) + (b.retweets || 0)) - ((a.likes || 0) + (a.retweets || 0))).slice(0, 3);

  // Strategy breakdown
  const strategyData = posts.reduce((acc, p) => {
    const strat = p.psychological_strategy || 'none';
    if (!acc[strat]) acc[strat] = { count: 0, likes: 0, impressions: 0 };
    acc[strat].count += 1;
    acc[strat].likes += p.likes || 0;
    acc[strat].impressions += p.impressions || 0;
    return acc;
  }, {} as Record<string, { count: number; likes: number; impressions: number }>);
  const strategyBarData = Object.entries(strategyData)
    .map(([name, v]) => ({ name: name.replace(/_/g, ' '), ...v, rate: v.impressions > 0 ? ((v.likes / v.impressions) * 100).toFixed(1) : '0' }))
    .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

  // Audience breakdown
  const audienceData = posts.reduce((acc, p) => {
    const aud = p.target_audience || 'general';
    if (!acc[aud]) acc[aud] = { impressions: 0, likes: 0, count: 0 };
    acc[aud].impressions += p.impressions || 0;
    acc[aud].likes += p.likes || 0;
    acc[aud].count += 1;
    return acc;
  }, {} as Record<string, { impressions: number; likes: number; count: number }>);
  const audienceBarData = Object.entries(audienceData).map(([name, v]) => ({ name, ...v, engagementRate: v.impressions > 0 ? ((v.likes / v.impressions) * 100).toFixed(1) : '0' }));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Impressions', value: totalImpressions, icon: Eye },
          { label: 'Likes', value: totalLikes, icon: Heart },
          { label: 'Retweets', value: totalRetweets, icon: Repeat },
          { label: 'Replies', value: totalReplies, icon: MessageCircle },
          { label: 'Eng. Rate', value: `${engagementRate}%`, icon: Zap },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-2xl font-bold mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Engagement over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Engagement Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeData}>
                <defs>
                  <linearGradient id="impressionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground) / 0.3)" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground) / 0.3)" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#impressionGrad)" />
                <Line type="monotone" dataKey="likes" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Content type breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Content Type Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((entry, i) => <Cell key={entry.name} fill={THEME_COLORS[i % THEME_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Strategy performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> Strategy Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {strategyBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={strategyBarData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground) / 0.3)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} stroke="hsl(var(--muted-foreground) / 0.3)" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="likes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">No strategy data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Top performers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🏆 Top Performers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-primary/20 text-primary' : 'bg-muted/50 text-muted-foreground'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-relaxed line-clamp-2">{post.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {post.likes != null && <span className="text-[10px] text-muted-foreground">♥ {post.likes}</span>}
                    {post.retweets != null && <span className="text-[10px] text-muted-foreground">🔄 {post.retweets}</span>}
                    {post.impressions != null && <span className="text-[10px] text-muted-foreground">👁 {post.impressions}</span>}
                    {post.content_type && <Badge variant="secondary" className="text-[8px] h-3 px-1">{post.content_type}</Badge>}
                  </div>
                </div>
              </div>
            ))}
            {topPosts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No engagement data yet</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
