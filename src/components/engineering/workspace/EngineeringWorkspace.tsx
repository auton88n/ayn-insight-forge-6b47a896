import React, { useState, useCallback, Suspense, lazy, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HardHat, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalculatorSidebar, CalculatorType } from './CalculatorSidebar';
import { EngineeringBottomChat } from './EngineeringBottomChat';
import { PreviewPlaceholder } from './PreviewPlaceholder';
import { CalculationHistoryModal } from '@/components/engineering/CalculationHistoryModal';
import { CalculationComparison } from '@/components/engineering/CalculationComparison';
import { SaveDesignDialog } from '@/components/engineering/SaveDesignDialog';
import { useEngineeringHistory } from '@/hooks/useEngineeringHistory';
import { useEngineeringSessionOptional } from '@/contexts/EngineeringSessionContext';
import { SEO } from '@/components/shared/SEO';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { type BuildingCodeId, type NBCCVersion } from '@/lib/buildingCodes';
import { toast } from 'sonner';


// Lazy load calculator components
const BeamCalculator = lazy(() => import('@/components/engineering/BeamCalculator').then(m => ({ default: m.BeamCalculator })));
const FoundationCalculator = lazy(() => import('@/components/engineering/FoundationCalculator').then(m => ({ default: m.FoundationCalculator })));
const ColumnCalculator = lazy(() => import('@/components/engineering/ColumnCalculator'));
const SlabCalculator = lazy(() => import('@/components/engineering/SlabCalculator'));
const RetainingWallCalculator = lazy(() => import('@/components/engineering/RetainingWallCalculator'));
const GradingDesigner = lazy(() => import('@/components/engineering/GradingDesignerPanel'));
const ComplianceWizard = lazy(() => import('@/components/engineering/compliance/ComplianceWizard'));

// Lazy load 3D visualizations
const BeamVisualization3D = lazy(() => import('@/components/engineering/BeamVisualization3D').then(m => ({ default: m.BeamVisualization3D })));
const FoundationVisualization3D = lazy(() => import('@/components/engineering/FoundationVisualization3D').then(m => ({ default: m.FoundationVisualization3D })));
const ColumnVisualization3D = lazy(() => import('@/components/engineering/ColumnVisualization3D'));
const SlabVisualization3D = lazy(() => import('@/components/engineering/SlabVisualization3D'));
const RetainingWallVisualization3D = lazy(() => import('@/components/engineering/RetainingWallVisualization3D'));
const TerrainVisualization3D = lazy(() => import('@/components/engineering/TerrainVisualization3D').then(m => ({ default: m.TerrainVisualization3D })));

// Lazy load results panel
const DetailedResultsPanel = lazy(() => import('@/components/engineering/results/DetailedResultsPanel'));

interface CalculationResult {
  type: CalculatorType;
  inputs: Record<string, number | string>;
  outputs: Record<string, number | string | object>;
  timestamp: Date;
}

interface EngineeringWorkspaceProps {
  userId: string;
}

// Loading fallback for lazy components
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-pulse flex flex-col items-center gap-3">
      <HardHat className="w-8 h-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

export const EngineeringWorkspace: React.FC<EngineeringWorkspaceProps> = ({ userId }) => {
  const navigate = useNavigate();
  const session = useEngineeringSessionOptional();
  const [selectedCalculator, setSelectedCalculator] = useState<CalculatorType>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  
  // Fallback building code state for when session is not available
  const [localBuildingCode, setLocalBuildingCode] = useState<BuildingCodeId>('ACI');
  const [localNbccVersion, setLocalNbccVersion] = useState<NBCCVersion>('2020');
  
  // Use building code from session context if available, otherwise use local state
  const selectedBuildingCode = session?.buildingCode ?? localBuildingCode;
  const setSelectedBuildingCode = session?.setBuildingCode ?? setLocalBuildingCode;
  const nbccVersion = session?.nbccVersion ?? localNbccVersion;
  const setNbccVersion = session?.setNbccVersion ?? setLocalNbccVersion;
  
  // Track previous building code for auto-recalculation
  const prevBuildingCodeRef = useRef(selectedBuildingCode);
  
  // Current inputs/outputs for live preview
  const [currentInputs, setCurrentInputs] = useState<Record<string, any>>({});
  const [currentOutputs, setCurrentOutputs] = useState<Record<string, any> | null>(null);
  
  // Reset key to force calculator re-render on reset
  const [resetKey, setResetKey] = useState(0);

  const { calculationHistory } = useEngineeringHistory(userId);

  // Track calculator switches for AYN
  useEffect(() => {
    if (selectedCalculator && session) {
      session.trackCalculatorSwitch(selectedCalculator);
    }
  }, [selectedCalculator, session]);

  // Expose context to AI agent via window
  useEffect(() => {
    if (session) {
      (window as any).__engineeringSessionContext = session.getAIContext;
      return () => { delete (window as any).__engineeringSessionContext; };
    }
  }, [session]);

  // Track session start time for memory saving
  const sessionStartRef = useRef(Date.now());
  const hasSavedSessionRef = useRef(false);

  // Save session summary to user memory on unmount (for AYN context)
  useEffect(() => {
    const startRef = sessionStartRef.current;
    return () => {
      if (userId && !hasSavedSessionRef.current && session) {
        const context = session.getAIContext();
        const sessionDuration = Math.round((Date.now() - startRef) / 1000);
        
        // Only save if user actually used calculators and session was meaningful
        const calcUsed = (context as any).calculatorsUsed;
        if (calcUsed && calcUsed.length > 0 && sessionDuration > 30) {
          hasSavedSessionRef.current = true;
          
          // Fire and forget - don't block unmount
          supabase.rpc('upsert_user_memory', {
            _user_id: userId,
            _memory_type: 'project',
            _memory_key: `eng_session_${Date.now()}`,
            _memory_data: {
              calculators: calcUsed,
              lastCalculator: (context as any).activeCalculator,
              calculationsRun: (context as any).calculationsRun || 0,
              sessionDuration,
              date: new Date().toISOString()
            },
            _priority: 2
          });
        }
      }
    };
  }, [userId, session]);

  const handleCalculationComplete = useCallback((result: CalculationResult) => {
    setCalculationResult(result);
    setCurrentOutputs(result.outputs as Record<string, any>);
    setIsCalculating(false);
  }, []);

  const handleInputChange = useCallback((inputs: Record<string, any>) => {
    setCurrentInputs(inputs);
  }, []);

  const handleBack = () => {
    if (selectedCalculator) {
      // If in a calculator, go back to selection
      setSelectedCalculator(null);
      setCurrentInputs({});
      setCurrentOutputs(null);
      setCalculationResult(null);
    } else {
      // If at calculator selection, go back to services page
      navigate('/');
    }
  };

  const handleCalculate = useCallback(() => {
    // Trigger calculation from current calculator
    setIsCalculating(true);
    // Safety timeout - reset after 5 seconds if calculator doesn't respond
    setTimeout(() => setIsCalculating(false), 5000);
  }, []);

  const handleReset = useCallback(() => {
    setCurrentInputs({});
    setCurrentOutputs(null);
    setCalculationResult(null);
    // Increment reset key to force calculator re-render with default values
    setResetKey(prev => prev + 1);
    session?.trackReset();
  }, [session]);

  // AI Agent control functions
  const handleSetInput = useCallback((field: string, value: any) => {
    setCurrentInputs(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSetMultipleInputs = useCallback((inputs: Record<string, any>) => {
    setCurrentInputs(prev => ({ ...prev, ...inputs }));
  }, []);

  const handleSwitchCalculator = useCallback((type: string) => {
    setSelectedCalculator(type as CalculatorType);
    setCurrentInputs({});
    setCurrentOutputs(null);
    setCalculationResult(null);
  }, []);

  // Export PDF handler - generates professional engineering report with direct download
  const handleExportPDF = useCallback(async () => {
    if (!selectedCalculator) {
      toast.error('Please select a calculator first');
      return;
    }
    if (!currentOutputs && !calculationResult) {
      toast.error('Please run a calculation first');
      return;
    }

    try {
      toast.loading('Generating PDF report...', { id: 'pdf-export' });
      
      // Create a temporary container for the PDF content
      const tempDiv = document.createElement('div');
      tempDiv.id = 'pdf-report-temp';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '210mm';
      tempDiv.style.background = 'white';
      
      // Fetch HTML from edge function
      const { data, error } = await supabase.functions.invoke('generate-engineering-pdf', {
        body: {
          type: selectedCalculator,
          inputs: currentInputs,
          outputs: currentOutputs || calculationResult?.outputs || {},
          buildingCode: selectedBuildingCode,
          projectName: `${selectedCalculator.charAt(0).toUpperCase() + selectedCalculator.slice(1).replace('_', ' ')} Design`,
        }
      });

      if (error) throw error;
      
      // Parse and inject HTML content with styles
      const parser = new DOMParser();
      const doc = parser.parseFromString(data.html, 'text/html');
      
      // Extract styles from the head
      const styleContent = doc.querySelector('style');
      // Extract ALL pages (multi-page support)
      const pageElements = doc.querySelectorAll('.page');
      
      // Build the content with styles included
      let htmlContent = '';
      
      // Add the styles first
      if (styleContent) {
        htmlContent += styleContent.outerHTML;
      }
      
      // Add all page content (supports multi-page PDFs)
      if (pageElements.length > 0) {
        pageElements.forEach(page => {
          htmlContent += page.outerHTML;
        });
      } else {
        htmlContent += doc.body.innerHTML;
      }
      
      tempDiv.innerHTML = htmlContent;
      document.body.appendChild(tempDiv);
      
      // Generate and download PDF directly
      const { default: generatePDF, Margin } = await import('react-to-pdf');
      await generatePDF(() => tempDiv, {
        filename: `${selectedCalculator}-design-${Date.now().toString(36).toUpperCase()}.pdf`,
        page: {
          margin: Margin.MEDIUM,
          format: 'A4',
          orientation: 'portrait',
        },
        canvas: {
          mimeType: 'image/jpeg',
          qualityRatio: 0.98,
        },
      });
      
      // Cleanup
      document.body.removeChild(tempDiv);

      toast.success('PDF report downloaded', { id: 'pdf-export' });
      session?.trackExport?.('pdf');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to generate PDF', { id: 'pdf-export' });
    }
  }, [selectedCalculator, currentInputs, currentOutputs, calculationResult, selectedBuildingCode, session]);

  // Export DXF handler - generates CAD drawing
  const handleExportDXF = useCallback(async () => {
    if (!selectedCalculator) {
      toast.error('Please select a calculator first');
      return;
    }
    if (!currentOutputs && !calculationResult) {
      toast.error('Please run a calculation first');
      return;
    }

    try {
      toast.loading('Generating DXF file...', { id: 'dxf-export' });
      
      const { data, error } = await supabase.functions.invoke('generate-dxf', {
        body: {
          type: selectedCalculator,
          inputs: currentInputs,
          outputs: currentOutputs || calculationResult?.outputs || {},
        }
      });

      if (error) throw error;

      // Create and download the DXF file
      const blob = new Blob([data.dxfContent], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCalculator}-design-${Date.now().toString(36).toUpperCase()}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('DXF file downloaded', { id: 'dxf-export' });
      session?.trackExport?.('dxf');
    } catch (error) {
      console.error('DXF export error:', error);
      toast.error('Failed to generate DXF', { id: 'dxf-export' });
    }
  }, [selectedCalculator, currentInputs, currentOutputs, calculationResult, session]);

  // Render calculator form with reset key
  const renderCalculatorForm = () => {
    const commonProps = {
      onCalculate: handleCalculationComplete,
      isCalculating,
      setIsCalculating,
      userId,
      onInputChange: handleInputChange,
      onReset: handleReset,
      key: resetKey, // Force re-render on reset
    };

    switch (selectedCalculator) {
      case 'beam':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <BeamCalculator {...commonProps} />
          </Suspense>
        );
      case 'foundation':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FoundationCalculator {...commonProps} />
          </Suspense>
        );
      case 'column':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ColumnCalculator {...commonProps} />
          </Suspense>
        );
      case 'slab':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <SlabCalculator {...commonProps} />
          </Suspense>
        );
      case 'retaining_wall':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <RetainingWallCalculator {...commonProps} />
          </Suspense>
        );
      case 'grading':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <GradingDesigner onInputChange={handleInputChange} />
          </Suspense>
        );
      case 'compliance':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ComplianceWizard userId={userId} />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // Render live preview
  const renderPreview = () => {
    if (!selectedCalculator) return null;

    const previewInputs = calculationResult?.inputs || currentInputs;
    const previewOutputs = calculationResult?.outputs || currentOutputs;

    const has3DData = Object.keys(previewInputs).length > 0;

    if (!has3DData) return null;

    switch (selectedCalculator) {
      case 'beam':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <BeamVisualization3D outputs={previewOutputs || {}} />
          </Suspense>
        );
      case 'foundation':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FoundationVisualization3D outputs={previewOutputs || {}} />
          </Suspense>
        );
      case 'column':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ColumnVisualization3D 
              width={Number(previewInputs.width) || 400}
              depth={Number(previewInputs.depth) || 400}
              height={Number(previewInputs.height) || 3000}
              cover={Number(previewInputs.cover) || 40}
              columnType={String(previewInputs.columnType) || 'tied'}
            />
          </Suspense>
        );
      case 'slab':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <SlabVisualization3D 
              length={Number(previewInputs.length) || 5000}
              width={Number(previewInputs.width) || 4000}
              thickness={Number(previewInputs.thickness) || 200}
              topBarSpacing={Number(previewInputs.topBarSpacing) || 200}
              bottomBarSpacing={Number(previewInputs.bottomBarSpacing) || 150}
              slabType={String(previewInputs.slabType) || 'one_way'}
            />
          </Suspense>
        );
      case 'retaining_wall':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <RetainingWallVisualization3D 
              wallHeight={Number(previewInputs.wallHeight) || 3}
              stemThicknessTop={Number(previewInputs.stemThicknessTop) || 300}
              stemThicknessBottom={Number(previewInputs.stemThicknessBottom) || 500}
              baseWidth={Number(previewInputs.baseWidth) || 2500}
              baseThickness={Number(previewInputs.baseThickness) || 400}
              toeWidth={Number(previewInputs.toeWidth) || 600}
            />
          </Suspense>
        );
      case 'grading':
        // Use fglPoints if available (after design generation), otherwise use survey points
        const gradingPoints = previewInputs.fglPoints || previewInputs.points || [];
        if (gradingPoints.length === 0) return null;
        return (
          <Suspense fallback={<LoadingFallback />}>
            <TerrainVisualization3D 
              points={gradingPoints}
              showFGL={!!previewInputs.fglPoints}
            />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // Calculator selection view
  const renderCalculatorSelection = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex flex-col items-center justify-center p-8"
    >
      {/* Hero */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
      >
        <Sparkles className="w-4 h-4" />
        AI-Powered Structural Analysis
      </motion.div>
      
      <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
        Professional Engineering Calculations
      </h2>
      <p className="text-muted-foreground max-w-2xl text-center mb-8">
        Select a calculator from the sidebar to begin designing reinforced concrete structures
        with real engineering formulas, 3D visualization, and DXF export.
      </p>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 max-w-3xl">
        {[
          { title: '3D Visualization', desc: 'Interactive beam and foundation models' },
          { title: 'DXF Export', desc: 'Download CAD-ready drawings' },
          { title: 'AI Analysis', desc: 'Smart design recommendations' },
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="text-center p-6 rounded-xl border border-border/50 bg-card/50"
          >
            <h4 className="font-semibold mb-1">{feature.title}</h4>
            <p className="text-sm text-muted-foreground">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  return (
    <>
      <SEO 
        title="Civil Engineering Calculator | Structural Design Tool"
        description="Professional civil engineering calculator for beam design, foundation design, and structural analysis. ACI 318-25 and CSA A23.3-24 compliant calculations."
      />

      <div className="h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
        {/* Header */}
        <header className="shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-xl z-40">
          <div className="px-4 py-3 flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            
            <div className="h-6 w-px bg-border" />
            
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                <HardHat className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Civil Engineering Studio</h1>
                <p className="text-xs text-muted-foreground">
                  {selectedCalculator 
                    ? `${selectedCalculator.charAt(0).toUpperCase() + selectedCalculator.slice(1).replace('_', ' ')} Design`
                    : 'Structural Design Tools'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <CalculatorSidebar
            selectedCalculator={selectedCalculator}
            onSelectCalculator={setSelectedCalculator}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onNavigate={navigate}
            selectedBuildingCode={selectedBuildingCode}
            onBuildingCodeChange={setSelectedBuildingCode}
            nbccVersion={nbccVersion}
            onNbccVersionChange={setNbccVersion}
          />

          {/* Workspace */}
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              {!selectedCalculator ? (
                renderCalculatorSelection()
              ) : (
                <motion.div
                  key={selectedCalculator}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-4 md:p-6"
                >
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* Calculator Form */}
                    {renderCalculatorForm()}
                    
                    {/* 3D Visualization */}
                    {selectedCalculator !== 'column' && (
                      <div className="h-[400px] md:h-[500px] bg-card border border-border/50 rounded-2xl overflow-hidden">
                        {(Object.keys(currentInputs).length > 0 || calculationResult) ? (
                          renderPreview()
                        ) : (
                          <PreviewPlaceholder calculatorType={selectedCalculator || undefined} />
                        )}
                      </div>
                    )}
                    
                    {/* Detailed Results Panel - Shows when outputs exist */}
                    {currentOutputs && selectedCalculator && (
                      <Suspense fallback={<LoadingFallback />}>
                        <DetailedResultsPanel
                          calculatorType={selectedCalculator}
                          inputs={currentInputs}
                          outputs={currentOutputs}
                          buildingCode={selectedBuildingCode}
                        />
                      </Suspense>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        {/* Bottom Chat + Toolbar */}
        <EngineeringBottomChat
          onCalculate={handleCalculate}
          onCompare={() => setIsCompareOpen(true)}
          onHistory={() => setIsHistoryOpen(true)}
          onReset={handleReset}
          onSave={() => setIsSaveDialogOpen(true)}
          onExportPDF={handleExportPDF}
          onExportDXF={handleExportDXF}
          isCalculating={isCalculating}
          hasResults={!!calculationResult || !!currentOutputs}
          canCompare={calculationHistory.length >= 2}
          calculatorType={selectedCalculator}
          currentInputs={currentInputs}
          currentOutputs={currentOutputs}
          onSetInput={handleSetInput}
          onSetMultipleInputs={handleSetMultipleInputs}
          onSwitchCalculator={handleSwitchCalculator}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* History Modal */}
        <CalculationHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          userId={userId}
          onLoadCalculation={(calc) => {
            setSelectedCalculator(calc.calculation_type as CalculatorType);
            setCurrentInputs(calc.inputs as Record<string, any>);
            setCurrentOutputs(calc.outputs as Record<string, any>);
            setCalculationResult({
              type: calc.calculation_type as CalculatorType,
              inputs: calc.inputs as Record<string, any>,
              outputs: calc.outputs as Record<string, any>,
              timestamp: new Date(calc.created_at),
            });
            setIsHistoryOpen(false);
          }}
        />

        {/* Comparison Modal */}
        <AnimatePresence>
          {isCompareOpen && (
            <CalculationComparison
              calculations={calculationHistory}
              onClose={() => setIsCompareOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Save Design Dialog */}
        <SaveDesignDialog
          isOpen={isSaveDialogOpen}
          onClose={() => setIsSaveDialogOpen(false)}
          userId={userId}
          calculationType={selectedCalculator || 'beam'}
          inputs={currentInputs}
          outputs={currentOutputs}
          onSaved={() => {
            session?.trackSave(`${selectedCalculator} design`);
          }}
        />
      </div>
    </>
  );
};

export default EngineeringWorkspace;
