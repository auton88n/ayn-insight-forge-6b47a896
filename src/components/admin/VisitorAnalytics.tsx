import { spineApi } from '@/lib/spineApi';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Globe, 
  Users, 
  Monitor, 
  Smartphone, 
  Tablet,
  TrendingUp,
  MapPin,
  Clock,
  RefreshCw
} from 'lucide-react';
import { adminApi as supabase } from '@/lib/adminApi';
import { Button } from '@/components/ui/button';
import { format, subDays, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

interface VisitorStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
}

interface CountryData {
  country: string;
  country_code: string;
  count: number;
  percentage: number;
}

interface DeviceData {
  device_type: string;
  count: number;
  percentage: number;
}

interface PageData {
  page_path: string;
  count: number;
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

export const VisitorAnalytics = () => {
  const [stats, setStats] = useState<VisitorStats>({ today: 0, thisWeek: 0, thisMonth: 0, total: 0 });
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [topPages, setTopPages] = useState<PageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await spineApi.req("GET", "/analytics/summary");
      if (error) throw error;
      const d = data as any;

      setStats({
        today: d.today_views || 0,
        thisWeek: d.week_views || 0,
        thisMonth: d.month_views || 0,
        total: d.total_views || 0,
      });

      // Countries
      const countryList = (d.by_country || []).slice(0, 10);
      const totalSessions = countryList.reduce((sum: number, c: any) => sum + c.sessions, 0) || 1;
      setCountries(countryList.map((c: any) => ({
        country: c.country,
        country_code: c.country?.slice(0, 2).toUpperCase() || 'XX',
        count: c.sessions,
        percentage: Math.round((c.sessions / totalSessions) * 100),
      })));

      // Top pages
      setTopPages((d.top_pages || []).slice(0, 5).map((p: any) => ({
        page_path: p.page_path,
        count: p.views,
      })));

      // Devices — not available from visitor_analytics via RPC, show empty
      setDevices([]);

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Tablet className="w-4 h-4" />;
      default: return <Monitor className="w-4 h-4" />;
    }
  };

  const getFlagEmoji = (countryCode: string) => {
    if (countryCode === 'XX' || !countryCode) return '🌍';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Visitor Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Last updated: {format(lastUpdated, 'HH:mm:ss')}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchAnalytics}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Today', value: stats.today, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'This Week', value: stats.thisWeek, icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'This Month', value: stats.thisMonth, icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'All Time', value: stats.total, icon: Globe, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} variants={itemVariants}>
              <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1">
                        {isLoading ? '...' : stat.value.toLocaleString()}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.bg}`}>
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Countries */}
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Top Countries (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[280px]">
                <div className="space-y-3">
                  {countries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data yet
                    </p>
                  ) : (
                    countries.map((country, index) => (
                      <div key={country.country} className="flex items-center gap-3">
                        <span className="text-lg">{getFlagEmoji(country.country_code)}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{country.country}</span>
                            <span className="text-xs text-muted-foreground">
                              {country.count.toLocaleString()} ({country.percentage}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${country.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Devices & Pages */}
        <div className="space-y-6">
          {/* Device Breakdown */}
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Devices (30 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {devices.map((device) => (
                    <div key={device.device_type} className="flex-1 text-center p-3 rounded-lg bg-muted/50">
                      <div className="flex justify-center mb-2">
                        {getDeviceIcon(device.device_type)}
                      </div>
                      <p className="text-lg font-bold">{device.percentage}%</p>
                      <p className="text-xs text-muted-foreground capitalize">{device.device_type}</p>
                    </div>
                  ))}
                  {devices.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center w-full py-4">
                      No data yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Top Pages */}
          <motion.div variants={itemVariants}>
            <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Top Pages (30 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topPages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No data yet
                    </p>
                  ) : (
                    topPages.map((page, index) => (
                      <div key={page.page_path} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs w-5 h-5 p-0 flex items-center justify-center">
                            {index + 1}
                          </Badge>
                          <span className="text-sm font-mono truncate max-w-[180px]">
                            {page.page_path}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {page.count.toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
