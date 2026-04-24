import React, { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mountain, Sparkles, PlusCircle, FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { SurveyUploader } from '@/components/engineering/SurveyUploader';
import { GradingRequirements } from '@/components/engineering/GradingRequirements';

const TerrainVisualization3D = lazy(() => import('@/components/engineering/TerrainVisualization3D').then(m => ({ default: m.TerrainVisualization3D })));
import { GradingResults } from '@/components/engineering/GradingResults';
import { GradingComplianceDisplay } from '@/components/engineering/GradingComplianceDisplay';
import { DesignReviewMode } from '@/components/engineering/DesignReviewMode';
import { DesignAnalysisResults } from '@/components/engineering/DesignAnalysisResults';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SEO } from '@/components/shared/SEO';
import { type GradingRegion } from '@/lib/gradingStandards';

interface SurveyPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  fgl?: number;
  cutFill?: number;
}

interface TerrainAnalysis {
  minElevation: number;
  maxElevation: number;
  elevationRange: number;
  avgElevation: number;
  pointCount: number;
  estimatedArea: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Using component-compatible types (matching GradingResults and DesignAnalysisResults props)
type GradingDesign = Parameters<typeof GradingResults>[0]['design'];
type CostBreakdown = Parameters<typeof GradingResults>[0]['costBreakdown'];
type AnalysisResult = Parameters<typeof DesignAnalysisResults>[0]['result'];
type Optimization = Parameters<typeof DesignAnalysisResults>[0]['onApplyOptimizations'] extends (optimizations: infer T) => void ? T extends Array<infer O> ? O : never : never;

const AIGradingDesigner: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('create');
  const [projectName, setProjectName] = useState('Untitled Project');
  
  // Create mode state
  const [points, setPoints] = useState<SurveyPoint[]>([]);
  const [terrainAnalysis, setTerrainAnalysis] = useState<TerrainAnalysis | null>(null);
  const [requirements, setRequirements] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [design, setDesign] = useState<GradingDesign>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [fglPoints, setFglPoints] = useState<SurveyPoint[]>([]);
  const [gradingRegion, setGradingRegion] = useState<GradingRegion>('USA');

  // Review mode state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);
  const [isApplyingOptimizations, setIsApplyingOptimizations] = useState(false);

  const handleUploadComplete = (uploadedPoints: SurveyPoint[], analysis: TerrainAnalysis) => {
    setPoints(uploadedPoints);
    setTerrainAnalysis(analysis);
    setDesign(null);
    setFglPoints([]);
  };

  const handleGenerateDesign = async () => {
    if (!terrainAnalysis || points.length === 0) {
      toast({ title: 'Upload survey data first', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-grading-design', {
        body: { 
          points, 
          terrainAnalysis, 
          requirements: requirements || 'Standard site grading for construction with proper drainage',
          region: gradingRegion,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setDesign(data.design);
      setCostBreakdown(data.costBreakdown);
      setTotalCost(data.totalCost);
      setFglPoints(data.fglPoints);

      toast({
        title: 'Grading design generated!',
        description: `Cut: ${data.design.totalCutVolume?.toLocaleString()} m³, Fill: ${data.design.totalFillVolume?.toLocaleString()} m³`,
      });
    } catch (err) {
      console.error('Generation error:', err);
      toast({
        title: 'Failed to generate design',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalysisComplete = (result: Record<string, unknown>) => {
    setAnalysisResult(result as unknown as NonNullable<AnalysisResult>);
  };

  const handleApplyOptimizations = async (optimizations: Optimization[]) => {
    if (!analysisResult?.parsedData) return;

    setIsApplyingOptimizations(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-design-optimizations', {
        body: {
          parsedData: analysisResult.parsedData,
          optimizations,
          projectName,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Download the optimized DXF
      const blob = new Blob([data.dxfContent], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Optimizations applied!',
        description: `Saved ${data.comparison.improvement.costSavings.toLocaleString()} SAR. DXF downloaded.`,
      });
    } catch (err) {
      console.error('Optimization error:', err);
      toast({
        title: 'Failed to apply optimizations',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsApplyingOptimizations(false);
    }
  };

  return (
    <>
      <SEO 
        title="AI Grading Designer - Civil Engineering"
        description="AI-powered site grading design tool. Upload survey data, describe requirements, get automatic cut/fill calculations and DXF exports."
      />
      
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/engineering')}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                    <Mountain className="h-5 w-5 text-white" />
                  </div>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="text-lg font-semibold border-none bg-transparent p-0 h-auto focus-visible:ring-0 max-w-[300px]"
                    placeholder="Project Name"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>AI-Powered Grading Design</span>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="create" className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                Create New Design
              </TabsTrigger>
              <TabsTrigger value="review" className="flex items-center gap-2">
                <FileSearch className="h-4 w-4" />
                Review Existing Design
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <SurveyUploader onUploadComplete={handleUploadComplete} isLoading={isGenerating} />
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <GradingRequirements
                      requirements={requirements}
                      onRequirementsChange={setRequirements}
                      onGenerate={handleGenerateDesign}
                      isGenerating={isGenerating}
                      hasPoints={points.length > 0}
                      region={gradingRegion}
                      onRegionChange={setGradingRegion}
                    />
                  </motion.div>
                </div>
                <div className="space-y-6">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Suspense fallback={<div className="h-[400px] bg-muted rounded-lg animate-pulse" />}>
                      <TerrainVisualization3D points={fglPoints.length > 0 ? fglPoints : points} showFGL={fglPoints.length > 0} />
                    </Suspense>
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-4">
                    <GradingResults design={design} costBreakdown={costBreakdown} totalCost={totalCost} fglPoints={fglPoints} projectName={projectName} />
                    {design && (
                      <GradingComplianceDisplay
                        region={gradingRegion}
                        disturbedAreaAcres={terrainAnalysis ? terrainAnalysis.estimatedArea / 4046.86 : 0}
                        designSlopes={{
                          foundation: design.slopePercentage,
                          fill: design.slopePercentage,
                        }}
                      />
                    )}
                  </motion.div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="review">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DesignReviewMode
                  onAnalysisComplete={handleAnalysisComplete}
                  isAnalyzing={isAnalyzing}
                  setIsAnalyzing={setIsAnalyzing}
                />
                <DesignAnalysisResults
                  result={analysisResult}
                  onApplyOptimizations={handleApplyOptimizations}
                  isApplying={isApplyingOptimizations}
                />
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
};

export default AIGradingDesigner;
