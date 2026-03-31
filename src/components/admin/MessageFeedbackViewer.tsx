import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminMessageFeedback, adminKeys } from '@/admin-app/hooks/useAdminQuery';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MessageRating {
  id: string;
  user_id: string | null;
  session_id: string | null;
  message_preview: string;
  rating: 'positive' | 'negative';
  created_at: string;
  user_name?: string;
  user_email?: string;
}

export const MessageFeedbackViewer = () => {
  const queryClient = useQueryClient();
  const { data: rawData, isLoading: loading } = useAdminMessageFeedback();
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative'>('all');

  const allRatings = useMemo(() => (rawData || []).map((r: any) => ({
    ...r,
    user_name: r.display_name,
    user_email: r.email,
  })) as MessageRating[], [rawData]);

  const ratings = useMemo(() =>
    filter === 'all' ? allRatings : allRatings.filter(r => r.rating === filter),
    [allRatings, filter]
  );

  const positiveCount = allRatings.filter(r => r.rating === 'positive').length;
  const negativeCount = allRatings.filter(r => r.rating === 'negative').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Message Feedback</h2>
          <p className="text-muted-foreground text-sm">User ratings on AI responses</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRatings} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <MessageSquare className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{ratings.length}</p>
                <p className="text-xs text-muted-foreground">Total Ratings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <ThumbsUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{positiveCount}</p>
                <p className="text-xs text-muted-foreground">Positive</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <ThumbsDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{negativeCount}</p>
                <p className="text-xs text-muted-foreground">Negative</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="positive">Positive</TabsTrigger>
          <TabsTrigger value="negative">Negative</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Ratings List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : ratings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No feedback yet
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {ratings.map((rating) => (
                  <div
                    key={rating.id}
                    className="p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">
                          {rating.message_preview}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{formatDistanceToNow(new Date(rating.created_at), { addSuffix: true })}</span>
                          {rating.user_id && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{rating.user_id.slice(0, 8)}...</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={rating.rating === 'positive' ? 'default' : 'destructive'}
                        className="shrink-0"
                      >
                        {rating.rating === 'positive' ? (
                          <ThumbsUp className="w-3 h-3 mr-1" />
                        ) : (
                          <ThumbsDown className="w-3 h-3 mr-1" />
                        )}
                        {rating.rating}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
