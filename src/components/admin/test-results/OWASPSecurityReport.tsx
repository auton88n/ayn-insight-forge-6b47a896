import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  Database,
  Globe,
  Lock,
  Zap
} from 'lucide-react';
import { adminApi as supabase } from '@/lib/adminApi';
import { toast } from 'sonner';

// SUPABASE_URL and SUPABASE_ANON_KEY imported from central config

interface SecurityTestResult {
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped';
  details?: Record<string, unknown>;
  error_message?: string | null;
}

interface CategorySummary {
  category: string;
  icon: React.ReactNode;
  passed: number;
  failed: number;
  total: number;
  tests: SecurityTestResult[];
}

export function OWASPSecurityReport() {
  const [results, setResults] = useState<SecurityTestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSecurityResults();
  }, []);

  const loadSecurityResults = async () => {
    try {
      const { data, error } = await supabase
        .from('test_results')
        .select('*')
        .eq('test_suite', 'security')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Type-safe mapping using correct column names
      const mappedResults: SecurityTestResult[] = (data || []).map(row => ({
        name: row.test_name,
        category: row.test_suite,
        status: row.status as 'passed' | 'failed' | 'skipped',
        details: undefined,
        error_message: row.error_message
      }));
      
      setResults(mappedResults);
    } catch (error) {
      console.error('Failed to load security results:', error);
    }
  };

  const runOWASPScan = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/run-real-tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ suite: 'security' })
      });

      if (!response.ok) throw new Error('Security scan failed');

      const data = await response.json();
      toast.success(`Security scan complete: ${data.summary?.passed || 0}/${data.summary?.total || 0} passed`);
      loadSecurityResults();
    } catch (error) {
      console.error('OWASP scan error:', error);
      toast.error('Failed to run security scan');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, React.ReactNode> = {
      'XSS': <Eye className="w-4 h-4" />,
      'SQL Injection': <Database className="w-4 h-4" />,
      'SSRF': <Globe className="w-4 h-4" />,
      'Auth': <Lock className="w-4 h-4" />,
      'Rate Limiting': <Zap className="w-4 h-4" />,
    };
    return icons[category] || <Shield className="w-4 h-4" />;
  };

  // Group results by security category
  const categories: CategorySummary[] = React.useMemo(() => {
    const categoryMap = new Map<string, SecurityTestResult[]>();
    
    results.forEach(result => {
      const categoryName = result.name.includes('XSS') ? 'XSS' :
                          result.name.includes('SQL') ? 'SQL Injection' :
                          result.name.includes('SSRF') ? 'SSRF' :
                          result.name.includes('Auth') || result.name.includes('Protected') ? 'Auth' :
                          result.name.includes('Rate') ? 'Rate Limiting' : 'Other';
      
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }
      categoryMap.get(categoryName)!.push(result);
    });

    return Array.from(categoryMap.entries()).map(([category, tests]) => ({
      category,
      icon: getCategoryIcon(category),
      passed: tests.filter(t => t.status === 'passed').length,
      failed: tests.filter(t => t.status === 'failed').length,
      total: tests.length,
      tests
    }));
  }, [results]);

  const totalPassed = results.filter(r => r.status === 'passed').length;
  const totalFailed = results.filter(r => r.status === 'failed').length;
  const totalTests = results.length;
  const overallScore = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-500" />
            <CardTitle>OWASP Security Report</CardTitle>
          </div>
          <Button 
            onClick={runOWASPScan} 
            disabled={loading}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Run Full Scan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="p-4 rounded-lg bg-background/50 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Security Score</span>
            <Badge variant={overallScore >= 90 ? 'default' : overallScore >= 70 ? 'secondary' : 'destructive'}>
              {overallScore}%
            </Badge>
          </div>
          <Progress value={overallScore} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-green-500" />
              {totalPassed} passed
            </span>
            <span className="flex items-center gap-1">
              <ShieldX className="w-3 h-3 text-red-500" />
              {totalFailed} failed
            </span>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Security Categories</h4>
          
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No security test results yet</p>
              <p className="text-xs">Run a security scan to see results</p>
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.category} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat.category)}
                  className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded ${cat.failed > 0 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                      {cat.icon}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">{cat.category}</p>
                      <p className="text-xs text-muted-foreground">
                        {cat.passed}/{cat.total} tests passed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cat.failed > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {cat.failed} failed
                      </Badge>
                    )}
                    {expandedCategories.has(cat.category) ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
                
                {expandedCategories.has(cat.category) && (
                  <div className="border-t bg-muted/20 p-2 space-y-1">
                    {cat.tests.map((test, idx) => (
                      <div 
                        key={idx}
                        className={`p-2 rounded text-xs flex items-start justify-between ${
                          test.status === 'passed' ? 'bg-green-500/10' : 
                          test.status === 'failed' ? 'bg-red-500/10' : 'bg-muted'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {test.status === 'passed' ? (
                            <ShieldCheck className="w-3 h-3 text-green-500 mt-0.5" />
                          ) : test.status === 'failed' ? (
                            <ShieldX className="w-3 h-3 text-red-500 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium">{test.name}</p>
                            {test.error_message && (
                              <p className="text-red-500 mt-1">{test.error_message}</p>
                            )}
                          </div>
                        </div>
                        <Badge 
                          variant={test.status === 'passed' ? 'default' : 'destructive'}
                          className="text-[10px] shrink-0"
                        >
                          {test.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* OWASP Categories Reference */}
        <div className="p-3 rounded-lg bg-muted/30 border">
          <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            OWASP Top 10 Coverage
          </h5>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>✓ A01: Broken Access Control</span>
            <span>✓ A02: Cryptographic Failures</span>
            <span>✓ A03: Injection (XSS, SQL)</span>
            <span>✓ A07: Auth Failures</span>
            <span>✓ A10: SSRF</span>
            <span>✓ Rate Limiting</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
