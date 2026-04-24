import { useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, 
  FileText, 
  Sparkles, 
  RefreshCw,
  Box,
  Ruler,
  Weight,
  Package,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  BarChart3
} from 'lucide-react';
import { ForceDiagrams } from './ForceDiagrams';
import { Button } from '@/components/ui/button';

const BeamVisualization3D = lazy(() => import('./BeamVisualization3D').then(m => ({ default: m.BeamVisualization3D })));
const FoundationVisualization3D = lazy(() => import('./FoundationVisualization3D').then(m => ({ default: m.FoundationVisualization3D })));
const ColumnVisualization3D = lazy(() => import('./ColumnVisualization3D'));
const SlabVisualization3D = lazy(() => import('./SlabVisualization3D'));
const RetainingWallVisualization3D = lazy(() => import('./RetainingWallVisualization3D'));


const Visualization3DFallback = () => (
  <div className="h-[300px] bg-muted rounded-lg animate-pulse" />
);

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// 2D Cross-Section Components for PDF Export
const Beam2DCrossSection: React.FC<{
  width: number;
  depth: number;
  mainBars: number;
  barDia: number;
  stirrupDia: number;
  cover: number;
}> = ({ width, depth, mainBars, barDia, stirrupDia, cover }) => {
  const padding = 25;
  const maxDim = Math.max(width, depth);
  const scale = (160 - padding * 2) / maxDim;
  
  const w = width * scale;
  const d = depth * scale;
  const c = cover * scale;
  const barR = Math.max(barDia * scale * 0.4, 3);
  const stirrupT = Math.max(stirrupDia * scale * 0.3, 1.5);
  
  const offsetX = (180 - w) / 2;
  const offsetY = (160 - d) / 2;
  
  const barSpacing = (w - c * 2 - barR * 2) / (mainBars - 1);
  const bottomY = offsetY + d - c - barR;
  const topY = offsetY + c + barR;

  return (
    <svg viewBox="0 0 180 160" className="w-full h-full">
      <rect x={offsetX} y={offsetY} width={w} height={d} fill="#718096" stroke="#2d3748" strokeWidth="1.5" />
      <rect x={offsetX + c} y={offsetY + c} width={w - c * 2} height={d - c * 2} fill="none" stroke="#f97316" strokeWidth={stirrupT} />
      {Array.from({ length: mainBars }).map((_, i) => (
        <circle key={`main-${i}`} cx={offsetX + c + barR + i * barSpacing} cy={bottomY} r={barR} fill="#3182ce" />
      ))}
      <circle cx={offsetX + c + barR} cy={topY} r={barR * 0.7} fill="#48bb78" />
      <circle cx={offsetX + w - c - barR} cy={topY} r={barR * 0.7} fill="#48bb78" />
      <line x1={offsetX} y1={offsetY + d + 10} x2={offsetX + w} y2={offsetY + d + 10} stroke="#e2e8f0" strokeWidth="0.8" />
      <text x={offsetX + w/2} y={offsetY + d + 20} fill="#e2e8f0" fontSize="8" textAnchor="middle">{width} mm</text>
      <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + d} stroke="#e2e8f0" strokeWidth="0.8" />
      <text x={offsetX - 14} y={offsetY + d/2} fill="#e2e8f0" fontSize="8" textAnchor="middle" transform={`rotate(-90, ${offsetX - 14}, ${offsetY + d/2})`}>{depth} mm</text>
    </svg>
  );
};

const Foundation2DPlan: React.FC<{
  length: number;
  width: number;
  columnWidth: number;
  columnDepth: number;
}> = ({ length, width, columnWidth, columnDepth }) => {
  const padding = 20;
  const maxDim = Math.max(length, width);
  const scale = (160 - padding * 2) / maxDim;
  
  const fL = length * scale;
  const fW = width * scale;
  const cW = columnWidth * scale;
  const cD = columnDepth * scale;
  
  const offsetX = (180 - fL) / 2;
  const offsetY = (160 - fW) / 2;
  const gridSpacing = Math.min(fL, fW) / 5;

  return (
    <svg viewBox="0 0 180 160" className="w-full h-full">
      <rect x={offsetX} y={offsetY} width={fL} height={fW} fill="#718096" stroke="#2d3748" strokeWidth="1.5" />
      {Array.from({ length: Math.floor(fW / gridSpacing) + 1 }).map((_, i) => (
        <line key={`x-${i}`} x1={offsetX + 4} y1={offsetY + 4 + i * gridSpacing} x2={offsetX + fL - 4} y2={offsetY + 4 + i * gridSpacing} stroke="#f97316" strokeWidth="1" />
      ))}
      {Array.from({ length: Math.floor(fL / gridSpacing) + 1 }).map((_, i) => (
        <line key={`y-${i}`} x1={offsetX + 4 + i * gridSpacing} y1={offsetY + 4} x2={offsetX + 4 + i * gridSpacing} y2={offsetY + fW - 4} stroke="#f97316" strokeWidth="1" />
      ))}
      <rect x={offsetX + (fL - cW) / 2} y={offsetY + (fW - cD) / 2} width={cW} height={cD} fill="#a0aec0" stroke="#666" strokeWidth="1" />
      <text x={offsetX + fL/2} y={offsetY + fW + 12} fill="#e2e8f0" fontSize="8" textAnchor="middle">{(length/1000).toFixed(2)} m</text>
      <text x={offsetX - 8} y={offsetY + fW/2} fill="#e2e8f0" fontSize="8" textAnchor="middle" transform={`rotate(-90, ${offsetX - 8}, ${offsetY + fW/2})`}>{(width/1000).toFixed(2)} m</text>
    </svg>
  );
};

// Column 2D Cross-Section for PDF Export
const Column2DCrossSection: React.FC<{
  width: number;
  depth: number;
  cover: number;
  columnType: string;
}> = ({ width, depth, cover, columnType }) => {
  const padding = 25;
  const maxDim = Math.max(width, depth);
  const scale = (140 - padding * 2) / maxDim;
  
  const w = width * scale;
  const d = depth * scale;
  const c = cover * scale;
  const barR = Math.max(w * 0.04, 3);
  const tieT = barR * 0.5;
  
  const offsetX = (180 - w) / 2;
  const offsetY = (160 - d) / 2;
  
  // Bar positions (8 bars)
  const barPositions = [
    [offsetX + c + barR, offsetY + c + barR],
    [offsetX + w - c - barR, offsetY + c + barR],
    [offsetX + c + barR, offsetY + d - c - barR],
    [offsetX + w - c - barR, offsetY + d - c - barR],
    [offsetX + w/2, offsetY + c + barR],
    [offsetX + w/2, offsetY + d - c - barR],
    [offsetX + c + barR, offsetY + d/2],
    [offsetX + w - c - barR, offsetY + d/2],
  ];

  return (
    <svg viewBox="0 0 180 160" className="w-full h-full">
      {/* Concrete section */}
      <rect x={offsetX} y={offsetY} width={w} height={d} fill="#718096" stroke="#2d3748" strokeWidth="1.5" />
      
      {/* Tie/Stirrup */}
      {columnType === 'tied' ? (
        <rect 
          x={offsetX + c} y={offsetY + c} 
          width={w - c * 2} height={d - c * 2}
          fill="none" stroke="#f97316" strokeWidth={tieT}
        />
      ) : (
        <circle
          cx={offsetX + w/2} cy={offsetY + d/2}
          r={Math.min(w, d)/2 - c}
          fill="none" stroke="#f97316" strokeWidth={tieT}
        />
      )}
      
      {/* Reinforcement bars */}
      {barPositions.map((pos, i) => (
        <circle key={i} cx={pos[0]} cy={pos[1]} r={barR} fill="#3182ce" />
      ))}
      
      {/* Dimensions */}
      <line x1={offsetX} y1={offsetY + d + 10} x2={offsetX + w} y2={offsetY + d + 10} stroke="#e2e8f0" strokeWidth="0.8" />
      <text x={offsetX + w/2} y={offsetY + d + 20} fill="#e2e8f0" fontSize="8" textAnchor="middle">{width} mm</text>
      
      <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + d} stroke="#e2e8f0" strokeWidth="0.8" />
      <text x={offsetX - 14} y={offsetY + d/2} fill="#e2e8f0" fontSize="8" textAnchor="middle" transform={`rotate(-90, ${offsetX - 14}, ${offsetY + d/2})`}>{depth} mm</text>
    </svg>
  );
};

// Material Quantities Display (no cost estimates for legal protection)
const MaterialQuantitiesDisplay: React.FC<{
  concreteVolume: number;
  steelWeight: number;
  formworkArea?: number;
}> = ({ concreteVolume, steelWeight, formworkArea }) => {
  return (
    <div className="bg-card rounded-lg border border-border p-3 mt-3">
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        <Package className="w-4 h-4 text-blue-500" />
        Material Quantities
      </h4>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Concrete:</span>
          <span className="ml-2 font-medium">{concreteVolume.toFixed(2)} m³</span>
        </div>
        <div>
          <span className="text-muted-foreground">Steel:</span>
          <span className="ml-2 font-medium">{steelWeight.toFixed(0)} kg</span>
        </div>
        {formworkArea && formworkArea > 0 && (
          <div>
            <span className="text-muted-foreground">Formwork:</span>
            <span className="ml-2 font-medium">{formworkArea.toFixed(1)} m²</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Contact local suppliers for current pricing.
      </p>
    </div>
  );
};

interface CalculationResultsProps {
  result: {
    type: 'beam' | 'foundation' | 'column' | 'slab' | 'retaining_wall' | null;
    inputs: Record<string, number | string>;
    outputs: Record<string, number | string | object>;
    timestamp: Date;
  };
  onNewCalculation: () => void;
}

export const CalculationResults = ({ result, onNewCalculation }: CalculationResultsProps) => {
  const [isExportingDXF, setIsExportingDXF] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [aiAnalysis, setAiAnalysis] = useState<{
    compliance: string[];
    optimizations: string[];
  } | null>(null);

  const outputs = result.outputs as Record<string, unknown>;
  

  const handleExportDXF = async () => {
    setIsExportingDXF(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-dxf', {
        body: {
          type: result.type,
          inputs: result.inputs,
          outputs: result.outputs,
        },
      });

      if (error) throw error;

      // Download the DXF file
      const blob = new Blob([data.dxfContent], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.type}-design-${Date.now()}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('DXF file downloaded!');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('DXF export error:', err);
      }
      toast.error('Failed to export DXF file');
    } finally {
      setIsExportingDXF(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const generatePDF = (await import('react-to-pdf')).default;
      const { Margin } = await import('react-to-pdf');
      const element = document.getElementById('calculation-report');
      
      if (!element) {
        throw new Error('Report element not found');
      }

      await generatePDF(() => element, {
        filename: `${result.type}-calculation-${Date.now()}.pdf`,
        page: {
          margin: Margin.SMALL,
          format: 'A4',
          orientation: 'portrait',
        },
        canvas: {
          mimeType: 'image/jpeg',
          qualityRatio: 0.98,
        },
      });
      toast.success('PDF report downloaded!');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('PDF export error:', err);
      }
      toast.error('Failed to export PDF report');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('engineering-ai-analysis', {
        body: {
          type: result.type,
          inputs: result.inputs,
          outputs: result.outputs,
        },
      });

      if (error) throw error;

      setAiAnalysis(data);
      toast.success('AI analysis complete!');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('AI analysis error:', err);
      }
      toast.error('AI analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatNumber = (value: unknown, decimals = 2): string => {
    if (typeof value === 'number') {
      return value.toFixed(decimals);
    }
    return String(value);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="outline" onClick={onNewCalculation} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          New Calculation
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportDXF}
            disabled={isExportingDXF}
            className="gap-2"
          >
            {isExportingDXF ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download DXF
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="gap-2"
          >
            {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Download PDF
          </Button>
          <Button 
            onClick={handleAIAnalysis}
            disabled={isAnalyzing}
            className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Analysis
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 3D Visualization */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-2xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-4">
            <Box className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">3D Visualization</h3>
          </div>
          <div className="aspect-square bg-muted/30 rounded-xl overflow-hidden flex flex-col">
            {result.type === 'beam' ? (
              <Suspense fallback={<Visualization3DFallback />}>
                <BeamVisualization3D outputs={outputs} />
              </Suspense>
            ) : result.type === 'foundation' ? (
              <Suspense fallback={<Visualization3DFallback />}>
                <FoundationVisualization3D outputs={outputs} />
              </Suspense>
            ) : result.type === 'column' ? (
              <Suspense fallback={<Visualization3DFallback />}>
                <ColumnVisualization3D
                  width={(outputs.width || result.inputs.width || 400) as number}
                  depth={(outputs.depth || result.inputs.depth || 400) as number}
                  height={(outputs.height || result.inputs.height || 3000) as number}
                  cover={(result.inputs.cover || 40) as number}
                  columnType={(result.inputs.columnType || 'tied') as string}
                />
              </Suspense>
            ) : result.type === 'slab' ? (
              <Suspense fallback={<Visualization3DFallback />}>
                <SlabVisualization3D
                  length={(outputs.length || (Number(result.inputs.longSpan) || 6) * 1000) as number}
                  width={(outputs.width || (Number(result.inputs.shortSpan) || 4) * 1000) as number}
                  thickness={(outputs.thickness || 150) as number}
                  topBarSpacing={(outputs.topBarSpacing || 200) as number}
                  bottomBarSpacing={(outputs.bottomBarSpacing || 150) as number}
                  slabType={(result.inputs.slabType || 'two_way') as string}
                />
              </Suspense>
            ) : result.type === 'retaining_wall' ? (
              <Suspense fallback={<Visualization3DFallback />}>
                <RetainingWallVisualization3D
                  wallHeight={(outputs.wallHeight || result.inputs.wallHeight || 4000) as number}
                  stemThicknessTop={(outputs.stemThicknessTop || 300) as number}
                  stemThicknessBottom={(outputs.stemThicknessBottom || 400) as number}
                  baseWidth={(outputs.baseWidth || 2500) as number}
                  baseThickness={(outputs.baseThickness || 400) as number}
                  toeWidth={(outputs.toeWidth || outputs.toeLength || 600) as number}
                />
              </Suspense>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                3D visualization not available
              </div>
            )}
          </div>
        </motion.div>

        {/* Results Summary - This is the PDF export area */}
        <motion.div
          id="calculation-report"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          {/* Report Header for PDF */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-lg print:shadow-none">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold capitalize">{result.type} Design Report</h2>
              <span className="text-xs text-muted-foreground">
                {result.timestamp instanceof Date 
                  ? `${result.timestamp.toLocaleDateString()} ${result.timestamp.toLocaleTimeString()}`
                  : new Date(result.timestamp).toLocaleDateString() + ' ' + new Date(result.timestamp).toLocaleTimeString()
                }
              </span>
            </div>
            
            {/* 2D Cross-Section for PDF */}
            <div className="bg-slate-900 rounded-lg p-2 mb-3" style={{ height: '180px' }}>
              {result.type === 'beam' && (
                <Beam2DCrossSection 
                  width={(outputs.width || outputs.beamWidth || 300) as number}
                  depth={(outputs.depth || outputs.beamDepth || 500) as number}
                  mainBars={(outputs.numberOfBars || 4) as number}
                  barDia={(outputs.barDiameter || 20) as number}
                  stirrupDia={(outputs.stirrupDia || 8) as number}
                  cover={40}
                />
              )}
              {result.type === 'foundation' && (
                <Foundation2DPlan
                  length={((outputs.length || 2.0) as number) * 1000}
                  width={((outputs.width || 2.0) as number) * 1000}
                  columnWidth={(outputs.columnWidth || 400) as number}
                  columnDepth={(outputs.columnDepth || 400) as number}
                />
              )}
              {result.type === 'column' && (
                <Column2DCrossSection
                  width={(outputs.width || result.inputs.width || 400) as number}
                  depth={(outputs.depth || result.inputs.depth || 400) as number}
                  cover={(result.inputs.cover || 40) as number}
                  columnType={(result.inputs.columnType || 'tied') as string}
                />
              )}
              {result.type === 'slab' && (
                <svg viewBox="0 0 180 160" className="w-full h-full">
                  <rect x="20" y="30" width="140" height="100" fill="#718096" stroke="#2d3748" strokeWidth="1.5" />
                  {Array.from({ length: 6 }).map((_, i) => (
                    <line key={`h-${i}`} x1="28" y1={38 + i * 16} x2="152" y2={38 + i * 16} stroke="#22c55e" strokeWidth="1.5" />
                  ))}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <line key={`v-${i}`} x1={28 + i * 18} y1="38" x2={28 + i * 18} y2="122" stroke="#22c55e" strokeWidth="1.5" />
                  ))}
                  <text x="90" y="145" fill="#e2e8f0" fontSize="8" textAnchor="middle">{String(outputs.slabType || 'Two-Way')} Slab - t={String(outputs.thickness || 150)}mm</text>
                </svg>
              )}
            </div>
            
            {/* Material Quantities */}
            {(
              <MaterialQuantitiesDisplay
                concreteVolume={(outputs.concreteVolume || 0) as number}
                steelWeight={(outputs.steelWeight || 0) as number}
                formworkArea={(outputs.formworkArea || 0) as number}
              />
            )}
          </div>

          {/* Dimensions Card */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Ruler className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold">Design Dimensions</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {result.type === 'beam' && (
                <>
                  <ResultItem label="Width" value={`${outputs.width || outputs.beamWidth} mm`} />
                  <ResultItem label="Depth" value={`${outputs.depth || outputs.beamDepth} mm`} />
                  <ResultItem label="Effective Depth" value={`${formatNumber(outputs.effectiveDepth)} mm`} />
                  <ResultItem label="Span" value={`${result.inputs.span} m`} />
                </>
              )}
              {result.type === 'foundation' && (
                <>
                  <ResultItem label="Length" value={`${formatNumber(outputs.length)} m`} />
                  <ResultItem label="Width" value={`${formatNumber(outputs.width)} m`} />
                  <ResultItem label="Depth" value={`${formatNumber(outputs.depth)} mm`} />
                  <ResultItem label="Area" value={`${formatNumber(outputs.area)} m²`} />
                </>
              )}
            </div>
          </div>

          {/* Force Diagrams for Beam */}
          {result.type === 'beam' && (
            <div className="bg-card rounded-2xl border border-border p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                <h3 className="text-lg font-semibold">Force Diagrams</h3>
              </div>
              <ForceDiagrams 
                span={Number(result.inputs.span) || 6}
                load={(Number(result.inputs.deadLoad) || 20) + (Number(result.inputs.liveLoad) || 15)}
              />
            </div>
          )}

          {/* Reinforcement Card */}
          {(
            <div className="bg-card rounded-2xl border border-border p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Weight className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Reinforcement</h3>
              </div>
              <div className="space-y-3">
                {result.type === 'beam' && (
                  <>
                    <ReinforcementItem 
                      label="Main Bars (Bottom)" 
                      value={outputs.mainReinforcement as string || `${outputs.mainBars}`} 
                    />
                    <ReinforcementItem 
                      label="Top Bars" 
                      value={outputs.topReinforcement as string || '2Ø12 (nominal)'} 
                    />
                    <ReinforcementItem 
                      label="Stirrups" 
                      value={outputs.stirrups as string || `Ø${outputs.stirrupDia}@${outputs.stirrupSpacing}mm`} 
                    />
                  </>
                )}
                {result.type === 'foundation' && (
                  <>
                    <ReinforcementItem 
                      label="Bottom X-Direction" 
                      value={outputs.reinforcementX as string} 
                    />
                    <ReinforcementItem 
                      label="Bottom Y-Direction" 
                      value={outputs.reinforcementY as string} 
                    />
                  </>
                )}
              </div>
            </div>
          )}


          {/* Material Quantities Card */}
          {(
            <div className="bg-card rounded-2xl border border-border p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold">Material Quantities</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ResultItem 
                  label="Concrete" 
                  value={`${formatNumber(outputs.concreteVolume)} m³`} 
                />
                <ResultItem 
                  label="Steel" 
                  value={`${formatNumber(outputs.steelWeight)} kg`} 
                />
                {result.type === 'beam' && (
                  <ResultItem 
                    label="Formwork" 
                    value={`${formatNumber(outputs.formworkArea)} m²`} 
                  />
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* AI Analysis Results */}
      {aiAnalysis && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-2xl border border-purple-200 dark:border-purple-800 p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold">AI Analysis</h3>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Compliance */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Compliance Checks
              </h4>
              <ul className="space-y-2">
                {aiAnalysis.compliance.map((item, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500 mt-1 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Optimizations */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Optimization Suggestions
              </h4>
              <ul className="space-y-2">
                {aiAnalysis.optimizations.map((item, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-amber-500 mt-1 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Material Quantities Summary */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                Material Quantities
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                Contact local suppliers for current pricing.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Concrete volume and steel weight shown in results above</li>
                <li>• Request quotes from multiple suppliers for best pricing</li>
              </ul>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const ResultItem = ({ label, value }: { label: string; value: string }) => (
  <div className="p-3 bg-muted/30 rounded-lg">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);

const ReinforcementItem = ({ label, value }: { label: string; value: string }) => (
  <div className={cn(
    "flex items-center justify-between p-3 rounded-lg",
    "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
  )}>
    <span className="text-sm text-amber-700 dark:text-amber-300">{label}</span>
    <span className="font-mono font-semibold text-amber-900 dark:text-amber-100">{value}</span>
  </div>
);
