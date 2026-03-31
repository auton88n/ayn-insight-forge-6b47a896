import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Gauge,
  User,
  Smartphone,
  Globe,
  Zap,
  TrendingUp,
  ArrowRight,
  Copy,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface PersonaResult {
  name: string;
  type: 'new_user' | 'expert' | 'mobile' | 'arabic' | 'power_user';
  avgScore: number;
  completedJourneys: number;
  totalJourneys: number;
  frustrations: number;
  avgResponseTime: number;
}

interface JourneyResult {
  name: string;
  steps: {
    name: string;
    status: 'passed' | 'failed' | 'slow';
    duration_ms: number;
    error?: string;
  }[];
  completionRate: number;
  uxScore: number;
  status: 'success' | 'partial' | 'failed';
  personaName: string;
}

interface UXJourneyResultsProps {
  personas?: PersonaResult[];
  journeys?: JourneyResult[];
  summary?: {
    avgUxScore: string;
    overallSuccessRate: string;
    personasTested: number;
    journeysTested: number;
    avgResponseTime: number;
  };
  isLoading?: boolean;
}

const personaIcons: Record<string, React.ReactNode> = {
  new_user: <User className="h-4 w-4" />,
  expert: <Zap className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
  arabic: <Globe className="h-4 w-4" />,
  power_user: <TrendingUp className="h-4 w-4" />,
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-500';
};

const getScoreBg = (score: number) => {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
};

export const UXJourneyResults: React.FC<UXJourneyResultsProps> = ({
  personas = [],
  journeys = [],
  summary,
  isLoading = false,
}) => {
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  const filteredJourneys = selectedPersona 
    ? journeys.filter(j => j.personaName === selectedPersona)
    : journeys;

  const copyResults = () => {
    const md = `# UX Journey Test Results\n\n## Summary\n- Average UX Score: ${summary?.avgUxScore || 'N/A'}\n- Success Rate: ${summary?.overallSuccessRate || 'N/A'}\n- Personas Tested: ${summary?.personasTested || 0}\n- Journeys Tested: ${summary?.journeysTested || 0}\n\n## Persona Results\n${personas.map(p => 
      `### ${p.name}\n- Score: ${p.avgScore}/100\n- Completed: ${p.completedJourneys}/${p.totalJourneys}\n- Frustrations: ${p.frustrations}`
    ).join('\n\n')}\n\n## Journey Details\n${journeys.map(j => 
      `### ${j.name} (${j.personaName})\n- UX Score: ${j.uxScore}/100\n- Completion: ${j.completionRate}%\n- Status: ${j.status}\n- Steps:\n${j.steps.map(s => 
        `  - [${s.status === 'passed' ? '✓' : '✗'}] ${s.name} (${s.duration_ms}ms)`
      ).join('\n')}`
    ).join('\n\n')}`;
    
    navigator.clipboard.writeText(md);
    toast.success('Results copied to clipboard');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4 mx-auto" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">Running UX journey tests with AI personas...</p>
        </CardContent>
      </Card>
    );
  }

  if (personas.length === 0 && journeys.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No UX journey results yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run "UX Journey Test" to simulate real user experiences</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-cyan-500" />
            UX Journey Results
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={copyResults}>
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
        </div>

        {/* Summary Score Card */}
        {summary && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall UX Score</p>
                <p className={`text-4xl font-bold ${getScoreColor(parseInt(summary.avgUxScore))}`}>
                  {summary.avgUxScore}
                  <span className="text-lg text-muted-foreground">/100</span>
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Success Rate</p>
                    <p className="font-medium">{summary.overallSuccessRate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Personas</p>
                    <p className="font-medium">{summary.personasTested}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Journeys</p>
                    <p className="font-medium">{summary.journeysTested}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Progress 
                value={parseInt(summary.avgUxScore)} 
                className="h-2"
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="personas">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="personas">By Persona</TabsTrigger>
            <TabsTrigger value="journeys">By Journey</TabsTrigger>
          </TabsList>

          <TabsContent value="personas">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {personas.map((persona, idx) => (
                <motion.div
                  key={persona.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedPersona === persona.name 
                      ? 'ring-2 ring-primary border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedPersona(
                    selectedPersona === persona.name ? null : persona.name
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getScoreBg(persona.avgScore)}/20`}>
                      {personaIcons[persona.type]}
                    </div>
                    <div>
                      <p className="font-medium">{persona.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {persona.type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">UX Score</span>
                      <span className={`font-bold ${getScoreColor(persona.avgScore)}`}>
                        {persona.avgScore}/100
                      </span>
                    </div>
                    <Progress value={persona.avgScore} className="h-1.5" />
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {persona.completedJourneys}/{persona.totalJourneys} journeys
                      </span>
                      {persona.frustrations > 0 && (
                        <span className="flex items-center gap-1 text-orange-500">
                          <ThumbsDown className="h-3 w-3" />
                          {persona.frustrations} frustrations
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Filtered Journeys */}
            {selectedPersona && (
              <div className="mt-6">
                <h4 className="text-sm font-medium mb-3">
                  Journeys for {selectedPersona}
                </h4>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {filteredJourneys.map((journey, idx) => (
                      <JourneyCard key={idx} journey={journey} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="journeys">
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {journeys.map((journey, idx) => (
                  <JourneyCard key={idx} journey={journey} showPersona />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const JourneyCard: React.FC<{ journey: JourneyResult; showPersona?: boolean }> = ({ 
  journey, 
  showPersona = false 
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`p-3 rounded-lg border ${
      journey.status === 'success' ? 'border-green-500/30' :
      journey.status === 'partial' ? 'border-yellow-500/30' : 'border-red-500/30'
    }`}>
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {journey.status === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : journey.status === 'partial' ? (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="font-medium">{journey.name}</span>
          {showPersona && (
            <Badge variant="outline" className="text-xs">
              {journey.personaName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <span className={getScoreColor(journey.uxScore)}>
              {journey.uxScore}/100
            </span>
          </div>
          <Badge variant={
            journey.completionRate === 100 ? 'default' :
            journey.completionRate >= 50 ? 'secondary' : 'destructive'
          } className="text-xs">
            {journey.completionRate.toFixed(0)}% complete
          </Badge>
        </div>
      </div>

      {expanded && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 pt-3 border-t"
        >
          <div className="flex items-center gap-1 flex-wrap">
            {journey.steps.map((step, idx) => (
              <React.Fragment key={idx}>
                <div className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                  step.status === 'passed' ? 'bg-green-500/10 text-green-600' :
                  step.status === 'slow' ? 'bg-yellow-500/10 text-yellow-600' :
                  'bg-red-500/10 text-red-600'
                }`}>
                  {step.status === 'passed' ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : step.status === 'slow' ? (
                    <Clock className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {step.name}
                  <span className="opacity-60">({step.duration_ms}ms)</span>
                </div>
                {idx < journey.steps.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                )}
              </React.Fragment>
            ))}
          </div>
          {journey.steps.some(s => s.error) && (
            <div className="mt-2 p-2 rounded bg-red-500/10 text-xs text-red-600">
              <strong>Errors:</strong>
              {journey.steps.filter(s => s.error).map((s, i) => (
                <div key={i}>• {s.name}: {s.error}</div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default UXJourneyResults;
