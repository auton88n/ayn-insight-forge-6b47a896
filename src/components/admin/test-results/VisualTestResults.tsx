import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Eye, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Loader2,
  Globe,
  Zap,
  Accessibility,
  Layout,
  Image,
  FileText,
  Monitor,
  Smartphone,
  ExternalLink,
  Camera,
  Maximize2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VisualIssue {
  type: 'layout' | 'visual' | 'responsive' | 'accessibility' | 'content' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  element?: string;
  suggestion: string;
}

interface ViewportResult {
  viewport: string;
  screenshotUrl: string;
  issues: VisualIssue[];
  analysisTime: number;
}

interface PageResult {
  path: string;
  name: string;
  status: 'passed' | 'warning' | 'failed';
  analysisMethod: string;
  viewportResults?: ViewportResult[];
  issues: VisualIssue[];
  metrics: {
    screenshotCount?: number;
    totalIssues?: number;
    analysisTime?: number;
    htmlSize?: number;
    loadTime?: number;
    elementsCount?: number;
    imagesCount?: number;
    linksCount?: number;
    formsCount?: number;
  };
}

interface VisualTestResultsProps {
  summary?: {
    totalPages: number;
    totalScreenshots?: number;
    passed: number;
    warnings: number;
    failed: number;
    totalIssues: number;
    criticalIssues: number;
    highIssues?: number;
    avgLoadTime?: string;
    avgAnalysisTime?: string;
    healthScore: number;
    overallRating: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  };
  results?: PageResult[];
  aiAnalysis?: string;
  isLoading?: boolean;
}

const getIssueTypeIcon = (type: string) => {
  switch (type) {
    case 'layout': return <Layout className="h-3 w-3" />;
    case 'visual': return <Image className="h-3 w-3" />;
    case 'responsive': return <Globe className="h-3 w-3" />;
    case 'accessibility': return <Accessibility className="h-3 w-3" />;
    case 'content': return <FileText className="h-3 w-3" />;
    case 'performance': return <Zap className="h-3 w-3" />;
    default: return <AlertTriangle className="h-3 w-3" />;
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-500/20 text-red-500 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    case 'low': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'passed': return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
    default: return <Eye className="h-4 w-4 text-muted-foreground" />;
  }
};

const getViewportIcon = (viewport: string) => {
  return viewport === 'mobile' 
    ? <Smartphone className="h-3 w-3" /> 
    : <Monitor className="h-3 w-3" />;
};

export const VisualTestResults: React.FC<VisualTestResultsProps> = ({
  summary,
  results,
  aiAnalysis,
  isLoading
}) => {
  const [selectedScreenshot, setSelectedScreenshot] = useState<{ url: string; name: string; viewport: string } | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-indigo-500" />
          <p className="text-sm text-muted-foreground">Capturing screenshots & analyzing with GPT-4 Vision...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take 1-2 minutes</p>
        </CardContent>
      </Card>
    );
  }

  if (!summary || !results) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No visual test data yet</p>
          <p className="text-xs mt-1">Run the Visual Test to capture screenshots and analyze with AI</p>
        </CardContent>
      </Card>
    );
  }

  const hasViewportResults = results.some(r => r.viewportResults && r.viewportResults.length > 0);

  return (
    <div className="space-y-4">
      {/* AI Analysis Card */}
      {aiAnalysis && (
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-indigo-500" />
              GPT-4 Vision Analysis Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{aiAnalysis}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">{summary.passed}</p>
            <p className="text-xs text-muted-foreground">Pages Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{summary.warnings}</p>
            <p className="text-xs text-muted-foreground">With Warnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-500">{summary.criticalIssues}</p>
            <p className="text-xs text-muted-foreground">Critical Issues</p>
          </CardContent>
        </Card>
        {summary.totalScreenshots && (
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-indigo-500">{summary.totalScreenshots}</p>
              <p className="text-xs text-muted-foreground">Screenshots</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{summary.avgAnalysisTime || summary.avgLoadTime}</p>
            <p className="text-xs text-muted-foreground">Avg Time</p>
          </CardContent>
        </Card>
      </div>

      {/* Screenshot Gallery (if available) */}
      {hasViewportResults && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Screenshot Gallery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={results[0]?.path || ''} className="w-full">
              <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
                {results.map((page, idx) => (
                  <TabsTrigger 
                    key={page.path} 
                    value={page.path}
                    className="text-xs flex items-center gap-1"
                    onClick={() => setActivePageIndex(idx)}
                  >
                    {getStatusIcon(page.status)}
                    {page.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {results.map((page) => (
                <TabsContent key={page.path} value={page.path} className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {page.viewportResults?.map((vr, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-2 bg-muted/30">
                          <div className="flex items-center gap-2">
                            {getViewportIcon(vr.viewport)}
                            <span className="text-sm font-medium capitalize">{vr.viewport}</span>
                            <Badge variant={vr.issues.length === 0 ? 'default' : 'destructive'} className="text-xs">
                              {vr.issues.length} issues
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            {vr.screenshotUrl && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedScreenshot({ 
                                    url: vr.screenshotUrl, 
                                    name: page.name,
                                    viewport: vr.viewport 
                                  })}
                                >
                                  <Maximize2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(vr.screenshotUrl, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {vr.screenshotUrl ? (
                          <div 
                            className="relative cursor-pointer group"
                            onClick={() => setSelectedScreenshot({ 
                              url: vr.screenshotUrl, 
                              name: page.name,
                              viewport: vr.viewport 
                            })}
                          >
                            <img 
                              src={vr.screenshotUrl} 
                              alt={`${page.name} - ${vr.viewport}`}
                              className="w-full h-48 object-cover object-top"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Maximize2 className="h-8 w-8 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="h-48 flex items-center justify-center bg-muted/50">
                            <p className="text-sm text-muted-foreground">Screenshot unavailable</p>
                          </div>
                        )}
                        
                        {/* Issues for this viewport */}
                        {vr.issues.length > 0 && (
                          <div className="p-2 border-t space-y-1 max-h-40 overflow-y-auto">
                            {vr.issues.map((issue, issueIdx) => (
                              <div 
                                key={issueIdx}
                                className={`flex items-start gap-2 p-2 rounded text-xs ${getSeverityColor(issue.severity)}`}
                              >
                                {getIssueTypeIcon(issue.type)}
                                <div className="flex-1">
                                  <p>{issue.description}</p>
                                  {issue.location && (
                                    <p className="text-[10px] opacity-70 mt-0.5">📍 {issue.location}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
      
      {/* Page Results (fallback for non-screenshot results) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detailed Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {results.map((page, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(page.status)}
                      <span className="font-medium text-sm">{page.name}</span>
                      <code className="text-xs text-muted-foreground bg-muted px-1 rounded">
                        {page.path}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {page.analysisMethod === 'gpt4_vision' ? '🤖 GPT-4 Vision' : '📄 HTML'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {page.metrics.analysisTime && (
                        <span>{page.metrics.analysisTime}ms analysis</span>
                      )}
                      {page.metrics.screenshotCount && (
                        <Badge variant="secondary" className="text-xs">
                          📸 {page.metrics.screenshotCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Viewport badges */}
                  {page.viewportResults && page.viewportResults.length > 0 && (
                    <div className="flex gap-2 mb-2">
                      {page.viewportResults.map((vr, vIdx) => (
                        <Badge 
                          key={vIdx}
                          variant={vr.issues.length === 0 ? 'default' : 'outline'}
                          className="text-xs flex items-center gap-1"
                        >
                          {getViewportIcon(vr.viewport)}
                          {vr.viewport}: {vr.issues.length} issues
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  {/* Issues */}
                  {page.issues.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {page.issues.map((issue, issueIdx) => (
                        <div 
                          key={issueIdx} 
                          className={`flex items-start gap-2 p-2 rounded border ${getSeverityColor(issue.severity)}`}
                        >
                          <div className="mt-0.5">{getIssueTypeIcon(issue.type)}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {issue.severity}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {issue.type}
                              </Badge>
                              {issue.location && (
                                <span className="text-[10px] text-muted-foreground">📍 {issue.location}</span>
                              )}
                            </div>
                            <p className="text-xs mt-1">{issue.description}</p>
                            {issue.element && (
                              <code className="text-[10px] text-muted-foreground">{issue.element}</code>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">💡 {issue.suggestion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {page.issues.length === 0 && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      No visual issues detected
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Screenshot Preview Dialog */}
      <Dialog open={!!selectedScreenshot} onOpenChange={() => setSelectedScreenshot(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedScreenshot && getViewportIcon(selectedScreenshot.viewport)}
              {selectedScreenshot?.name} - {selectedScreenshot?.viewport}
            </DialogTitle>
          </DialogHeader>
          {selectedScreenshot && (
            <div className="mt-4">
              <img 
                src={selectedScreenshot.url} 
                alt={`${selectedScreenshot.name} screenshot`}
                className="w-full rounded-lg border"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VisualTestResults;
