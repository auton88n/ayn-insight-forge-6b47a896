import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, RefreshCw, MessageSquare, ThumbsUp, ThumbsDown, Bug, Lightbulb, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface FeedbackEntry {
  id: string;
  user_id: string;
  overall_rating: number | null;
  favorite_features: string[] | null;
  improvement_suggestions: string | null;
  bugs_encountered: string | null;
  would_recommend: boolean | null;
  additional_comments: string | null;
  credits_awarded: number | null;
  submitted_at: string | null;
  user_name?: string;
}

export const BetaFeedbackViewer = () => {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeedback = async () => {
    try {
      // Fetch feedback
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('beta_feedback')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (feedbackError) throw feedbackError;

      // Get unique user IDs
      const userIds = [...new Set((feedbackData || []).map(f => f.user_id))];

      // Fetch profiles for these users
      const { data: profilesData } = await supabase
        .from('admin_users_view')
        .select('id, display_name, email')
        .in('id', userIds);

      // Create a map of user_id to name
      const userNameMap = new Map<string, string>();
      (profilesData || []).forEach(p => {
        userNameMap.set((p as any).id, (p as any).display_name || (p as any).email?.split('@')[0] || '');
      });

      // Merge feedback with user names
      const enrichedFeedback: FeedbackEntry[] = (feedbackData || []).map(f => ({
        ...f,
        user_name: userNameMap.get(f.user_id) || undefined
      }));

      setFeedback(enrichedFeedback);
      
      // Security: Log admin access to beta feedback
      if (feedbackData && feedbackData.length > 0) {
        supabase.from('security_logs').insert({
          action: 'beta_feedback_view',
          details: { count: feedbackData.length, timestamp: new Date().toISOString() },
          severity: 'medium'
        });
      }
    } catch (err) {
      console.error('Error fetching feedback:', err);
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchFeedback();
  };

  // Calculate stats
  const totalResponses = feedback.length;
  const avgRating = totalResponses > 0
    ? (feedback.reduce((sum, f) => sum + (f.overall_rating || 0), 0) / totalResponses).toFixed(1)
    : '0';
  const recommendCount = feedback.filter(f => f.would_recommend === true).length;
  const nps = totalResponses > 0 
    ? Math.round((recommendCount / totalResponses) * 100)
    : 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Beta Feedback</h2>
          <p className="text-muted-foreground">User experience insights</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalResponses}</p>
                <p className="text-xs text-muted-foreground">Total Responses</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Star className="w-8 h-8 text-yellow-500 fill-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{avgRating}</p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ThumbsUp className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{nps}%</p>
                <p className="text-xs text-muted-foreground">Would Recommend</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {feedback.filter(f => f.improvement_suggestions || f.bugs_encountered).length}
                </p>
                <p className="text-xs text-muted-foreground">With Comments</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Feedback List */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {feedback.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No feedback submitted yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {feedback.map((entry) => (
                    <motion.div
                      key={entry.id}
                      variants={itemVariants}
                      className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {/* Rating Stars */}
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  "w-4 h-4",
                                  (entry.overall_rating || 0) >= star
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                          </div>
                          {entry.would_recommend !== null && (
                            <Badge variant={entry.would_recommend ? "default" : "secondary"}>
                              {entry.would_recommend ? (
                                <><ThumbsUp className="w-3 h-3 mr-1" /> Would Recommend</>
                              ) : (
                                <><ThumbsDown className="w-3 h-3 mr-1" /> Not Yet</>
                              )}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {entry.submitted_at ? format(new Date(entry.submitted_at), 'MMM d, yyyy HH:mm') : 'Unknown'}
                        </span>
                      </div>

                      {/* Favorite Features */}
                      {entry.favorite_features && entry.favorite_features.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1">Favorite Features:</p>
                          <div className="flex flex-wrap gap-1">
                            {entry.favorite_features.map((feature) => (
                              <Badge key={feature} variant="outline" className="text-xs">
                                {feature.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Improvements */}
                      {entry.improvement_suggestions && (
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <Lightbulb className="w-3 h-3" /> Suggestions:
                          </p>
                          <p className="text-sm bg-muted/50 p-2 rounded">
                            {entry.improvement_suggestions}
                          </p>
                        </div>
                      )}

                      {/* Bugs */}
                      {entry.bugs_encountered && (
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <Bug className="w-3 h-3" /> Bugs Reported:
                          </p>
                          <p className="text-sm bg-red-500/10 p-2 rounded text-red-600 dark:text-red-400">
                            {entry.bugs_encountered}
                          </p>
                        </div>
                      )}

                      {/* Credits Awarded */}
                      <div className="mt-3 pt-3 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          User: {entry.user_name || entry.user_id.slice(0, 8) + '...'}
                        </span>
                        {entry.credits_awarded && (
                          <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-600">
                            +{entry.credits_awarded} credits awarded
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};
