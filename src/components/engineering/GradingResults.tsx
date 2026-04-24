import React, { useRef, useState, useCallback, lazy, Suspense } from 'react';
import { Download, TrendingUp, TrendingDown, FileText, AlertTriangle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { StationDataTable } from './StationDataTable';
const ElevationProfile = lazy(() => import('./ElevationProfile').then(m => ({ default: m.ElevationProfile })));
import { GradingPDFReport } from './GradingPDFReport';

interface Point {
  id: string;
  x: number;
  y: number;
  z: number;
  fgl?: number;
  cutFill?: number;
}

interface GradingDesign {
  designElevation: number;
  slopeDirection: string;
  slopePercentage: number;
  gradingZones?: Array<{
    name: string;
    area: number;
    nglAvg: number;
    fglTarget: number;
    cutVolume: number;
    fillVolume: number;
  }>;
  totalCutVolume: number;
  totalFillVolume: number;
  netVolume: number;
  designNotes: string[];
  drainageRecommendations: string;
  compactionRequirements: string;
}

interface CostBreakdown {
  excavation: number;
  fill: number;
  compaction: number;
  disposal: number;
  surveying: number;
}

interface GradingResultsProps {
  design: GradingDesign | null;
  costBreakdown?: CostBreakdown | null;
  totalCost?: number;
  fglPoints: Point[];
  projectName: string;
}

export const GradingResults: React.FC<GradingResultsProps> = ({
  design,
  costBreakdown,
  totalCost,
  fglPoints,
  projectName,
}) => {
  const [exporting, setExporting] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [activeView, setActiveView] = useState('summary');
  const pdfRef = useRef<HTMLDivElement>(null);

  const handleExportDXF = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-grading-dxf', {
        body: { points: fglPoints, design, projectName }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      const blob = new Blob([data.dxfContent], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'DXF exported successfully',
        description: `Downloaded ${data.fileName}`,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Export error:', err);
      }
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const getTargetElement = useCallback(() => pdfRef.current, []);

  const handleExportPDF = async () => {
    if (!pdfRef.current || !design) return;
    
    setExportingPDF(true);
    try {
      const { default: generatePDF, Margin } = await import('react-to-pdf');
      await generatePDF(getTargetElement, {
        filename: `${projectName.replace(/\s+/g, '_')}_Grading_Report.pdf`,
        page: {
          margin: Margin.SMALL,
          format: 'A4',
          orientation: 'portrait',
        },
        canvas: {
          mimeType: 'image/jpeg',
          qualityRatio: 0.95,
        },
        overrides: {
          canvas: {
            useCORS: true,
          },
        },
      });

      toast({
        title: 'PDF exported successfully',
        description: `Downloaded ${projectName}_Grading_Report.pdf`,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('PDF export error:', err);
      }
      toast({
        title: 'PDF export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setExportingPDF(false);
    }
  };

  if (!design) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground py-8">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Generate a grading design to see results</p>
        </div>
      </Card>
    );
  }

  const netVolumeLabel = design.netVolume > 0 ? 'Excess Cut' : 'Import Required';
  const netVolumeColor = design.netVolume > 0 ? 'text-amber-500' : 'text-blue-500';

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Navigation Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView} className="print:hidden">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="profile">Elevation Profile</TabsTrigger>
          <TabsTrigger value="stations">Station Data</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4 mt-4">
          {/* Volume Summary */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Earthwork Volumes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Total Cut</span>
                </div>
                <p className="text-2xl font-bold">{design.totalCutVolume?.toLocaleString()} m³</p>
              </div>
              
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-blue-500">Total Fill</span>
                </div>
                <p className="text-2xl font-bold">{design.totalFillVolume?.toLocaleString()} m³</p>
              </div>
              
              <div className="bg-muted/50 border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-5 h-5 ${netVolumeColor}`} />
                  <span className={`text-sm font-medium ${netVolumeColor}`}>{netVolumeLabel}</span>
                </div>
                <p className="text-2xl font-bold">{Math.abs(design.netVolume)?.toLocaleString()} m³</p>
              </div>
            </div>
          </Card>

          {/* Design Parameters */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Design Parameters</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Design Elevation</p>
                <p className="text-lg font-semibold">{design.designElevation?.toFixed(2)}m</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Slope Direction</p>
                <p className="text-lg font-semibold">{design.slopeDirection}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Slope Percentage</p>
                <p className="text-lg font-semibold">{design.slopePercentage}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Points Processed</p>
                <p className="text-lg font-semibold">{fglPoints.length}</p>
              </div>
            </div>
          </Card>

        </TabsContent>

        {/* Elevation Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <Suspense fallback={<div className="h-[400px] bg-muted animate-pulse rounded-lg" />}>
            <ElevationProfile points={fglPoints} height={400} />
          </Suspense>
        </TabsContent>

        {/* Station Data Tab */}
        <TabsContent value="stations" className="mt-4">
          <StationDataTable points={fglPoints} interval={5} />
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4 mt-4">
          {/* Design Notes */}
          {design.designNotes && design.designNotes.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">AI Design Notes</h3>
              <ul className="space-y-2">
                {design.designNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span className="text-muted-foreground">{note}</span>
                  </li>
                ))}
              </ul>
              
              {design.drainageRecommendations && (
                <div className="mt-4 pt-4 border-t">
                  <p className="font-medium mb-1">Drainage Recommendations:</p>
                  <p className="text-sm text-muted-foreground">{design.drainageRecommendations}</p>
                </div>
              )}
              
              {design.compactionRequirements && (
                <div className="mt-3">
                  <p className="font-medium mb-1">Compaction Requirements:</p>
                  <p className="text-sm text-muted-foreground">{design.compactionRequirements}</p>
                </div>
              )}
            </Card>
          )}

          {/* Grading Zones if available */}
          {design.gradingZones && design.gradingZones.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Grading Zones</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-semibold">Zone</th>
                      <th className="px-3 py-2 text-right font-semibold">Area (m²)</th>
                      <th className="px-3 py-2 text-right font-semibold">NGL Avg (m)</th>
                      <th className="px-3 py-2 text-right font-semibold">FGL Target (m)</th>
                      <th className="px-3 py-2 text-right font-semibold text-red-500">Cut (m³)</th>
                      <th className="px-3 py-2 text-right font-semibold text-blue-500">Fill (m³)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.gradingZones.map((zone, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{zone.name}</td>
                        <td className="px-3 py-2 text-right">{zone.area?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{zone.nglAvg?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{zone.fglTarget?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-red-500">{zone.cutVolume?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-blue-500">{zone.fillVolume?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Hidden PDF content for export */}
      <div className="absolute -left-[9999px] top-0">
        <GradingPDFReport
          ref={pdfRef}
          design={design}
          fglPoints={fglPoints}
          projectName={projectName}
        />
      </div>

      {/* Export Buttons */}
      <div className="flex gap-3 print:hidden">
        <Button
          onClick={handleExportDXF}
          disabled={exporting || exportingPDF}
          className="flex-1"
          size="lg"
        >
          {exporting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Generating DXF...
            </>
          ) : (
            <>
              <Download className="w-5 h-5 mr-2" />
              Export DXF
            </>
          )}
        </Button>
        <Button
          onClick={handleExportPDF}
          disabled={exporting || exportingPDF}
          variant="secondary"
          size="lg"
          className="flex-1"
        >
          {exportingPDF ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              Generating PDF...
            </>
          ) : (
            <>
              <FileDown className="w-5 h-5 mr-2" />
              Export PDF Report
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
