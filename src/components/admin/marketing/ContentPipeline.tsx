import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Send, Trash2, Edit3, Clock, CheckCircle,
  Loader2, Sparkles, Calendar as CalendarIcon, RefreshCw, Camera, Target,
  AlertCircle, Plus, ChevronDown, ImageIcon
} from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';

interface TwitterPost {
  id: string;
  content: string;
  status: string;
  psychological_strategy: string | null;
  target_audience: string | null;
  content_type: string | null;
  quality_score: Record<string, number> | null;
  tweet_id: string | null;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
  image_url: string | null;
  scheduled_at: string | null;
  thread_id: string | null;
  thread_order: number | null;
  impressions: number | null;
  likes: number | null;
  retweets: number | null;
  replies: number | null;
}

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string; emptyText: string; emptyAction: string }> = {
  draft: { icon: Clock, color: 'text-amber-600', label: 'Drafts', emptyText: 'No drafts yet', emptyAction: 'Generate your first tweet' },
  scheduled: { icon: CalendarIcon, color: 'text-blue-600', label: 'Scheduled', emptyText: 'Nothing scheduled', emptyAction: 'Schedule a draft' },
  posted: { icon: CheckCircle, color: 'text-emerald-600', label: 'Posted', emptyText: 'No posts yet', emptyAction: 'Post a draft to X' },
};

// Tiny sparkline for engagement
const EngagementSparkline = ({ post }: { post: TwitterPost }) => {
  const data = [
    { name: '👁', value: post.impressions || 0 },
    { name: '♥', value: (post.likes || 0) * 10 },
    { name: '🔄', value: (post.retweets || 0) * 20 },
    { name: '💬', value: (post.replies || 0) * 15 },
  ];
  const hasData = data.some(d => d.value > 0);
  if (!hasData) return null;

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="w-16 h-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>👁 {post.impressions?.toLocaleString() || 0}</span>
        <span>♥ {post.likes || 0}</span>
        <span>🔄 {post.retweets || 0}</span>
      </div>
    </div>
  );
};

// Character count ring
const CharCount = ({ count }: { count: number }) => {
  const max = 280;
  const pct = Math.min(count / max, 1);
  const isOver = count > max;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - pct * circumference;

  return (
    <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
      <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
        <circle cx="10" cy="10" r={radius} fill="none" stroke={isOver ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      {isOver && <span className="absolute text-[7px] font-bold text-destructive">{max - count}</span>}
    </div>
  );
};

// Thread connector
const ThreadConnector = ({ isFirst, isLast }: { isFirst: boolean; isLast: boolean }) => (
  <div className="absolute -left-4 top-0 bottom-0 w-5 flex flex-col items-center">
    {!isFirst && <div className="w-0.5 flex-1 bg-primary/20" />}
    <div className="w-2.5 h-2.5 rounded-full bg-primary/40 border-2 border-primary shrink-0" />
    {!isLast && <div className="w-0.5 flex-1 bg-primary/20" />}
  </div>
);

interface ContentPipelineProps {
  onOpenCreativeEditor?: (post: TwitterPost) => void;
}

// Schedule popover component
const SchedulePopover = ({ post, onSchedule }: { post: TwitterPost; onSchedule: (post: TwitterPost, date: string) => void }) => {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('09:00');
  const [open, setOpen] = useState(false);

  const handleSchedule = () => {
    if (!date) return;
    const [h, m] = time.split(':').map(Number);
    const scheduled = new Date(date);
    scheduled.setHours(h, m, 0, 0);
    onSchedule(post, scheduled.toISOString());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
          <CalendarIcon className="w-2.5 h-2.5" /> Schedule
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 space-y-3" align="start">
        <Calendar mode="single" selected={date} onSelect={setDate} className="p-0 pointer-events-auto" disabled={(d: Date) => d < new Date()} />
        <div className="flex items-center gap-2">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs w-28" />
          <Button size="sm" className="h-8 text-xs" onClick={handleSchedule} disabled={!date}>Confirm</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const ContentPipeline = ({ onOpenCreativeEditor }: ContentPipelineProps) => {
  const [posts, setPosts] = useState<TwitterPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [filterContentType, setFilterContentType] = useState('all');
  const [filterAudience, setFilterAudience] = useState('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (status: string) => {
    setCollapsedSections(prev => ({ ...prev, [status]: !prev[status] }));
  };

  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('twitter_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPosts((data as unknown as TwitterPost[]) || []);
    } catch { toast.error('Failed to load posts'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleGenerate = async (mode?: 'single' | 'thread' | 'campaign' | 'image') => {
    setIsGenerating(true);
    try {
      const body: Record<string, unknown> = {};
      if (filterContentType !== 'all') body.content_type = filterContentType;
      if (filterAudience !== 'all') body.target_audience = filterAudience;
      if (mode === 'thread') body.thread_mode = true;
      if (mode === 'campaign') body.campaign_plan = true;
      if (mode === 'image') body.image_only = true;

      const { data, error } = await supabase.functions.invoke('twitter-auto-market', { body });
      if (error) throw error;
      
      const modeLabels: Record<string, string> = {
        thread: 'Thread generated!',
        campaign: 'Campaign plan generated!',
        image: 'Image post generated!',
        single: 'Tweet generated!',
      };
      toast.success(modeLabels[mode || 'single'] || 'Tweet generated!');
      fetchPosts();
    } catch { toast.error('Failed to generate'); }
    finally { setIsGenerating(false); }
  };

  const handlePost = async (post: TwitterPost) => {
    setIsPosting(post.id);
    try {
      const { error } = await supabase.functions.invoke('twitter-post', { body: { text: post.content, post_id: post.id } });
      if (error) throw error;
      toast.success('Posted to X!');
      fetchPosts();
    } catch { toast.error('Failed to post'); }
    finally { setIsPosting(null); }
  };

  const handleRetry = async (post: TwitterPost) => {
    await supabase.from('twitter_posts').update({ status: 'draft', error_message: null }).eq('id', post.id);
    toast.success('Moved back to drafts');
    fetchPosts();
  };

  const handleSchedule = async (post: TwitterPost, scheduledAt: string) => {
    try {
      const { error } = await supabase.from('twitter_posts').update({ status: 'scheduled', scheduled_at: scheduledAt }).eq('id', post.id);
      if (error) throw error;
      toast.success(`Scheduled for ${format(new Date(scheduledAt), 'MMM d, h:mm a')}`);
      fetchPosts();
    } catch { toast.error('Failed to schedule'); }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('twitter_posts').delete().eq('id', id);
      if (error) throw error;
      setPosts(prev => prev.filter(p => p.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleSaveEdit = async (id: string) => {
    if (editContent.length > 280) { toast.error('Exceeds 280 chars'); return; }
    try {
      const { error } = await supabase.from('twitter_posts').update({ content: editContent }).eq('id', id);
      if (error) throw error;
      setPosts(prev => prev.map(p => p.id === id ? { ...p, content: editContent } : p));
      setEditingId(null);
      toast.success('Updated');
    } catch { toast.error('Failed to update'); }
  };

  // Group threads together
  const groupPosts = (statusPosts: TwitterPost[]) => {
    const threads = new Map<string, TwitterPost[]>();
    const singles: TwitterPost[] = [];

    statusPosts.forEach(p => {
      if (p.thread_id) {
        const existing = threads.get(p.thread_id) || [];
        existing.push(p);
        threads.set(p.thread_id, existing);
      } else {
        singles.push(p);
      }
    });

    threads.forEach(posts => posts.sort((a, b) => (a.thread_order || 0) - (b.thread_order || 0)));
    return { threads, singles };
  };

  const sections: { status: string; posts: TwitterPost[] }[] = [
    { status: 'draft', posts: posts.filter(p => p.status === 'draft') },
    { status: 'scheduled', posts: posts.filter(p => p.status === 'scheduled') },
    { status: 'posted', posts: posts.filter(p => p.status === 'posted') },
  ];

  const failedPosts = posts.filter(p => p.status === 'failed');

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading pipeline...</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Generate controls */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/50">
        <Select value={filterContentType} onValueChange={setFilterContentType}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any type</SelectItem>
            <SelectItem value="value">💡 Value</SelectItem>
            <SelectItem value="engagement">🔥 Engagement</SelectItem>
            <SelectItem value="feature">⚡ Feature</SelectItem>
            <SelectItem value="personality">😎 Personality</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAudience} onValueChange={setFilterAudience}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Audience" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any audience</SelectItem>
            <SelectItem value="engineer">Engineers</SelectItem>
            <SelectItem value="business_owner">Business</SelectItem>
            <SelectItem value="student">Students</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border/50 mx-1" />

        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleGenerate('single')} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Tweet
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleGenerate('thread')} disabled={isGenerating}>
          🧵 Thread
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleGenerate('campaign')} disabled={isGenerating}>
          📅 Campaign
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleGenerate('image')} disabled={isGenerating}>
          <ImageIcon className="w-3 h-3" /> Image Post
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 ml-auto" onClick={fetchPosts} title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Failed posts alert */}
      {failedPosts.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-destructive">{failedPosts.length} failed post{failedPosts.length > 1 ? 's' : ''}</p>
            <div className="mt-1.5 space-y-1.5">
              {failedPosts.map(post => (
                <div key={post.id} className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground truncate flex-1">{post.content.slice(0, 60)}...</p>
                  <Button size="sm" variant="outline" className="h-5 text-[9px] px-2" onClick={() => handleRetry(post)}>Retry</Button>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(post.id)}>
                    <Trash2 className="w-2.5 h-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vertically stacked sections */}
      <div className="space-y-3">
        {sections.map(({ status, posts: sectionPosts }) => {
          const config = statusConfig[status];
          const Icon = config.icon;
          const { threads, singles } = groupPosts(sectionPosts);
          const isOpen = !collapsedSections[status];

          return (
            <Collapsible key={status} open={isOpen} onOpenChange={() => toggleSection(status)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/15 border border-border/30 hover:bg-muted/25 transition-colors cursor-pointer">
                  <Icon className={`w-4 h-4 ${config.color}`} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{config.label}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-2">{sectionPosts.length}</Badge>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="space-y-2 pt-2">
                  {/* Thread groups */}
                  {Array.from(threads.entries()).map(([threadId, threadPosts]) => (
                    <div key={threadId} className="relative pl-6 space-y-2">
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 mb-1">🧵 Thread · {threadPosts.length} tweets</Badge>
                      {threadPosts.map((post, idx) => (
                        <div key={post.id} className="relative">
                          <ThreadConnector isFirst={idx === 0} isLast={idx === threadPosts.length - 1} />
                          <PostCard
                            post={post}
                            editingId={editingId}
                            editContent={editContent}
                            isPosting={isPosting}
                            setEditingId={setEditingId}
                            setEditContent={setEditContent}
                            handleSaveEdit={handleSaveEdit}
                            handlePost={handlePost}
                            handleSchedule={handleSchedule}
                            handleDelete={handleDelete}
                            onOpenCreativeEditor={onOpenCreativeEditor}
                          />
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Single posts */}
                  {singles.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      editingId={editingId}
                      editContent={editContent}
                      isPosting={isPosting}
                      setEditingId={setEditingId}
                      setEditContent={setEditContent}
                      handleSaveEdit={handleSaveEdit}
                      handlePost={handlePost}
                      handleSchedule={handleSchedule}
                      handleDelete={handleDelete}
                      onOpenCreativeEditor={onOpenCreativeEditor}
                    />
                  ))}

                  {sectionPosts.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/50 p-8 text-center space-y-2">
                      <Icon className="w-6 h-6 text-muted-foreground/30 mx-auto" />
                      <p className="text-xs text-muted-foreground">{config.emptyText}</p>
                      {status === 'draft' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 mt-2" onClick={() => handleGenerate('single')} disabled={isGenerating}>
                          <Plus className="w-3 h-3" /> {config.emptyAction}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

// Extracted PostCard component
interface PostCardProps {
  post: TwitterPost;
  editingId: string | null;
  editContent: string;
  isPosting: string | null;
  setEditingId: (id: string | null) => void;
  setEditContent: (content: string) => void;
  handleSaveEdit: (id: string) => void;
  handlePost: (post: TwitterPost) => void;
  handleSchedule: (post: TwitterPost, date: string) => void;
  handleDelete: (id: string) => void;
  onOpenCreativeEditor?: (post: TwitterPost) => void;
}

const PostCard = ({
  post, editingId, editContent, isPosting,
  setEditingId, setEditContent, handleSaveEdit, handlePost, handleSchedule, handleDelete,
  onOpenCreativeEditor,
}: PostCardProps) => (
  <Card className="group hover:shadow-md transition-shadow">
    <CardContent className="p-3 space-y-2">
      {editingId === post.id ? (
        <div className="space-y-1.5">
          <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[60px] text-xs resize-none" maxLength={300} />
          <div className="flex items-center gap-1.5">
            <CharCount count={editContent.length} />
            <span className={`text-[10px] ${editContent.length > 280 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{editContent.length}/280</span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" className="h-6 text-[10px]" onClick={() => handleSaveEdit(post.id)}>Save</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="text-xs leading-relaxed flex-1">{post.content}</p>
          <CharCount count={post.content.length} />
        </div>
      )}

      {/* Image preview — prominent */}
      {post.image_url && (
        <img src={post.image_url} alt="" className="w-full rounded-lg aspect-square object-cover border border-border/20" loading="lazy" />
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {post.content_type && <Badge variant="secondary" className="text-[9px] h-4 px-1">{post.content_type}</Badge>}
        {post.target_audience && <Badge variant="secondary" className="text-[9px] h-4 px-1"><Target className="w-2 h-2 mr-0.5" />{post.target_audience}</Badge>}
        {post.thread_id && <Badge variant="outline" className="text-[9px] h-4 px-1">#{post.thread_order}</Badge>}
        {post.scheduled_at && (
          <span className="text-[9px] text-muted-foreground ml-auto flex items-center gap-1">
            <CalendarIcon className="w-2 h-2" />
            {format(new Date(post.scheduled_at), 'MMM d, h:mm a')}
          </span>
        )}
      </div>

      {/* Engagement sparkline for posted */}
      {post.status === 'posted' && <EngagementSparkline post={post} />}

      {/* Actions — always visible */}
      <div className="flex items-center gap-1 pt-1">
        {post.status === 'draft' && (
          <>
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handlePost(post)} disabled={isPosting === post.id}>
              {isPosting === post.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Send className="w-2.5 h-2.5" />} Post
            </Button>
            <SchedulePopover post={post} onSchedule={handleSchedule} />
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditingId(post.id); setEditContent(post.content); }}>
              <Edit3 className="w-2.5 h-2.5" />
            </Button>
            {onOpenCreativeEditor && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onOpenCreativeEditor(post)} title="Generate image">
                <Camera className="w-2.5 h-2.5" />
              </Button>
            )}
          </>
        )}
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive ml-auto" onClick={() => handleDelete(post.id)}>
          <Trash2 className="w-2.5 h-2.5" />
        </Button>
      </div>
    </CardContent>
  </Card>
);
