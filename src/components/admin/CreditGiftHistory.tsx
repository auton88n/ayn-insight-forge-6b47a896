import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  RefreshCw, 
  Gift, 
  Search, 
  Calendar, 
  User, 
  Sparkles,
  Download,
  Filter,
  TrendingUp
} from 'lucide-react';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';

interface CreditGift {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  gift_type: string | null;
  given_by: string | null;
  created_at: string | null;
  user_name?: string;
  user_email?: string;
  given_by_name?: string;
}

type DateFilter = 'all' | 'today' | 'week' | 'month';
type TypeFilter = 'all' | 'manual' | 'feedback_reward' | 'promotion' | 'compensation';

export const CreditGiftHistory = () => {
  const [gifts, setGifts] = useState<CreditGift[]>([]);
  const [filteredGifts, setFilteredGifts] = useState<CreditGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const fetchGifts = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_credit_gifts');
      if (error) throw error;
      const giftsData = (data || []).map((r: any) => ({
        ...r,
        user_name: r.display_name,
        user_email: r.email,
      }));
      setGifts(giftsData);
    } catch (err) {
      console.error('Error fetching credit gifts:', err);
      toast.error("Couldn't load credit gift history. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGifts();
  }, []);

  // Apply filters
  useEffect(() => {
    let result = [...gifts];

    // Search filter (by user_id or reason)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(g => 
        g.user_id.toLowerCase().includes(query) ||
        g.reason.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateFilter) {
        case 'today':
          startDate = startOfDay(now);
          break;
        case 'week':
          startDate = subDays(now, 7);
          break;
        case 'month':
          startDate = subDays(now, 30);
          break;
        default:
          startDate = new Date(0);
      }

      result = result.filter(g => {
        if (!g.created_at) return false;
        const giftDate = parseISO(g.created_at);
        return isWithinInterval(giftDate, { start: startDate, end: endOfDay(now) });
      });
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(g => g.gift_type === typeFilter);
    }

    setFilteredGifts(result);
  }, [gifts, searchQuery, dateFilter, typeFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGifts();
  };

  const exportToCSV = () => {
    const headers = ['Date', 'User ID', 'Amount', 'Type', 'Reason', 'Given By'];
    const rows = filteredGifts.map(g => [
      g.created_at ? format(parseISO(g.created_at), 'yyyy-MM-dd HH:mm') : 'Unknown',
      g.user_id,
      g.amount,
      g.gift_type || 'manual',
      `"${g.reason.replace(/"/g, '""')}"`,
      g.given_by || 'System'
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-gifts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  // Calculate stats
  const totalCreditsGifted = filteredGifts.reduce((sum, g) => sum + g.amount, 0);
  const uniqueUsers = new Set(filteredGifts.map(g => g.user_id)).size;
  const typeBreakdown = filteredGifts.reduce((acc, g) => {
    const type = g.gift_type || 'manual';
    acc[type] = (acc[type] || 0) + g.amount;
    return acc;
  }, {} as Record<string, number>);

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'feedback_reward':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'promotion':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'compensation':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    }
  };

  const getTypeIcon = (type: string | null) => {
    switch (type) {
      case 'feedback_reward':
        return <Sparkles className="w-3 h-3" />;
      case 'promotion':
        return <TrendingUp className="w-3 h-3" />;
      default:
        return <Gift className="w-3 h-3" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-purple-500" />
            Credit Gift History
          </h2>
          <p className="text-muted-foreground">Track all credit gifts and rewards</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportToCSV} disabled={filteredGifts.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Gift className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{totalCreditsGifted}</p>
                <p className="text-xs text-muted-foreground">Total Credits</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{uniqueUsers}</p>
                <p className="text-xs text-muted-foreground">Unique Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{typeBreakdown['feedback_reward'] || 0}</p>
                <p className="text-xs text-muted-foreground">Feedback Rewards</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Gift className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{typeBreakdown['manual'] || 0}</p>
                <p className="text-xs text-muted-foreground">Manual Gifts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by user ID or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Date Filter */}
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-[160px]">
                <Gift className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="feedback_reward">Feedback Reward</SelectItem>
                <SelectItem value="promotion">Promotion</SelectItem>
                <SelectItem value="compensation">Compensation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Gift List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Gift History ({filteredGifts.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredGifts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No credit gifts found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {filteredGifts.map((gift) => (
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs", getTypeColor(gift.gift_type))}
                          >
                            {getTypeIcon(gift.gift_type)}
                            <span className="ml-1 capitalize">
                              {(gift.gift_type || 'manual').replace(/_/g, ' ')}
                            </span>
                          </Badge>
                          <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                            +{gift.amount}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate">
                          {gift.reason}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {gift.user_name || gift.user_email?.split('@')[0] || gift.user_id.slice(0, 8)}
                          </span>
                          {gift.given_by && (
                            <span>
                              by {gift.given_by_name || gift.given_by?.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {gift.created_at 
                          ? format(parseISO(gift.created_at), 'MMM d, yyyy')
                          : 'Unknown'}
                        <br />
                        {gift.created_at 
                          ? format(parseISO(gift.created_at), 'HH:mm')
                          : ''}
                      </div>
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
