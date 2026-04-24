import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, 
  FileText, 
  Calculator, 
  AlertTriangle, 
  Lightbulb, 
  Droplets, 
  Shield,
  Loader2,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ChecklistGroup } from './ui/ChecklistGroup';

interface AnalysisOptions {
  calculateVolumes: boolean;
  findProblems: boolean;
  suggestOptimizations: boolean;
  checkDrainage: boolean;
  checkCompliance: boolean;
}

interface ParsedDesignData {
  data?: {
    points: Array<{ x: number; y: number; z: number }>;
    layers: string[];
  };
  summary: {
    totalPoints: number;
    nglPointCount: number;
    designPointCount: number;
    layerCount: number;
    extractedLevels?: number[];
  };
  terrainAnalysis?: {
    minElevation: number;
    maxElevation: number;
    avgElevation: number;
  };
}

interface DesignReviewModeProps {
  onAnalysisComplete: (result: Record<string, unknown>) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (value: boolean) => void;
}

export const DesignReviewMode: React.FC<DesignReviewModeProps> = ({
  onAnalysisComplete,
  isAnalyzing,
  setIsAnalyzing
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedDesignData | null>(null);
  const [userRequirements, setUserRequirements] = useState('');
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({
    calculateVolumes: true,
    findProblems: true,
    suggestOptimizations: true,
    checkDrainage: true,
    checkCompliance: true,
  });

  const [isParsing, setIsParsing] = useState(false);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (!['dxf', 'dwg', 'pdf'].includes(extension || '')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a .dxf, .dwg, or .pdf file',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
    setParsedData(null);
    setIsParsing(true);

    try {
      if (extension === 'dxf') {
        // Read DXF as text
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target?.result as string;
          setFileContent(content);
          
          try {
            const { data, error } = await supabase.functions.invoke('parse-dxf-design', {
              body: { fileContent: content, fileType: 'dxf' }
            });
            
            if (error) throw error;
            if (!data.success) throw new Error(data.error);
            
            setParsedData(data);
            toast({
              title: 'File parsed successfully',
              description: `Found ${data.summary.totalPoints} points, ${data.summary.layerCount} layers`,
            });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('Parse error:', err);
            }
            toast({
              title: 'Failed to parse file',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'destructive',
            });
          } finally {
            setIsParsing(false);
          }
        };
        reader.readAsText(file);
      } else if (extension === 'dwg') {
        setIsParsing(false);
        toast({
          title: 'DWG format not directly supported',
          description: 'Please save your file as DXF (ASCII) format in AutoCAD',
          variant: 'destructive',
        });
        setUploadedFile(null);
      } else if (extension === 'pdf') {
        // Read PDF as base64 and use OCR
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result as string;
          setFileContent(base64);
          
          toast({
            title: 'Processing PDF with AI...',
            description: 'Extracting survey points and levels using OCR',
          });
          
          try {
            const { data, error } = await supabase.functions.invoke('parse-pdf-drawing', {
              body: { pdfBase64: base64, fileName: file.name }
            });
            
            if (error) throw error;
            if (!data.success) throw new Error(data.error);
            
            setParsedData(data);
            
            const levelInfo = data.summary.extractedLevels?.length > 0 
              ? `, ${data.summary.extractedLevels.length} elevation values`
              : '';
            
            toast({
              title: 'PDF analyzed successfully',
              description: `Found ${data.summary.totalPoints} points${levelInfo}`,
            });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('PDF parse error:', err);
            }
            toast({
              title: 'Failed to parse PDF',
              description: err instanceof Error ? err.message : 'OCR extraction failed',
              variant: 'destructive',
            });
            setUploadedFile(null);
          } finally {
            setIsParsing(false);
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      setIsParsing(false);
      if (import.meta.env.DEV) {
        console.error('File read error:', err);
      }
      toast({
        title: 'Failed to read file',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setUploadedFile(null);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      const input = document.createElement('input');
      input.type = 'file';
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      handleFileSelect({ target: input } as React.ChangeEvent<HTMLInputElement>);
    }
  }, [handleFileSelect]);

  const handleAnalyze = async () => {
    if (!parsedData) {
      toast({
        title: 'No file loaded',
        description: 'Please upload and parse a DXF file first',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-autocad-design', {
        body: {
          parsedData: parsedData.data,
          analysisOptions,
          userRequirements,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      onAnalysisComplete({
        ...data.analysis,
        parsedData: parsedData.data,
        fileName: uploadedFile?.name,
      });

      toast({
        title: 'Analysis complete!',
        description: `Found ${data.analysis.problemsSummary.critical} critical issues, ${data.analysis.problemsSummary.warnings} warnings`,
      });
    } catch (err) {
      console.error('Analysis error:', err);
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFileContent(null);
    setParsedData(null);
  };

  const toggleOption = (option: keyof AnalysisOptions) => {
    setAnalysisOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const triggerFileInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Design File
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!uploadedFile ? (
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf,.dwg,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Drop your engineering drawing here</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports DXF, DWG, and PDF files (PDFs use AI-powered OCR)
              </p>
              <Button
                variant="outline" 
                type="button"
                onClick={triggerFileInput}
              >
                Browse Files
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  {isParsing ? (
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  ) : (
                    <FileText className="h-8 w-8 text-primary" />
                  )}
                  <div>
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {isParsing 
                        ? uploadedFile.name.endsWith('.pdf') 
                          ? 'Analyzing with AI OCR...' 
                          : 'Parsing file...'
                        : `${(uploadedFile.size / 1024).toFixed(1)} KB`
                      }
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={removeFile} disabled={isParsing}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {parsedData && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg"
                >
                  <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    ✓ File parsed successfully
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Points:</span>
                      <span className="ml-2 font-medium">{parsedData.summary.totalPoints}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">NGL Points:</span>
                      <span className="ml-2 font-medium">{parsedData.summary.nglPointCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Design Points:</span>
                      <span className="ml-2 font-medium">{parsedData.summary.designPointCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Layers:</span>
                      <span className="ml-2 font-medium">{parsedData.summary.layerCount}</span>
                    </div>
                  </div>
                  {parsedData.terrainAnalysis && (
                    <div className="mt-3 pt-3 border-t border-green-500/20">
                      <p className="text-sm text-muted-foreground">
                        Elevation range: {parsedData.terrainAnalysis.minElevation.toFixed(2)}m - {parsedData.terrainAnalysis.maxElevation.toFixed(2)}m 
                        (avg: {parsedData.terrainAnalysis.avgElevation.toFixed(2)}m)
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Analysis Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChecklistGroup
            title="Select Analyses"
            options={[
              {
                id: 'calculateVolumes',
                label: 'Calculate Cut/Fill Volumes',
                description: 'Compute missing earthwork quantities from NGL vs design levels',
                icon: Calculator,
                iconColor: 'text-blue-500',
                checked: analysisOptions.calculateVolumes,
              },
              {
                id: 'findProblems',
                label: 'Find Design Problems',
                description: 'Identify earthwork imbalances, steep slopes, and other issues',
                icon: AlertTriangle,
                iconColor: 'text-amber-500',
                checked: analysisOptions.findProblems,
              },
              {
                id: 'suggestOptimizations',
                label: 'Suggest Optimizations',
                description: 'AI-powered suggestions to improve design efficiency',
                icon: Lightbulb,
                iconColor: 'text-yellow-500',
                checked: analysisOptions.suggestOptimizations,
              },
              {
                id: 'checkDrainage',
                label: 'Check Drainage Adequacy',
                description: 'Verify minimum slopes for proper water drainage',
                icon: Droplets,
                iconColor: 'text-cyan-500',
                checked: analysisOptions.checkDrainage,
              },
              {
                id: 'checkCompliance',
                label: 'Verify Regional Code Compliance',
                description: 'Check against USA (OSHA/IBC) or Canada (CSA/NBCC) standards',
                icon: Shield,
                iconColor: 'text-emerald-500',
                checked: analysisOptions.checkCompliance,
              },
            ]}
            onToggle={(id) => toggleOption(id as keyof AnalysisOptions)}
            onToggleAll={() => {
              const allChecked = Object.values(analysisOptions).every(v => v);
              setAnalysisOptions({
                calculateVolumes: !allChecked,
                findProblems: !allChecked,
                suggestOptimizations: !allChecked,
                checkDrainage: !allChecked,
                checkCompliance: !allChecked,
              });
            }}
          />

          <div>
            <Label htmlFor="requirements" className="text-sm font-medium mb-2 block">
              Specific Concerns or Requirements (Optional)
            </Label>
            <Textarea
              id="requirements"
              placeholder="E.g., 'Focus on the north-east corner slopes', 'Check if we can reduce fill volume', 'Verify accessibility ramps meet 5% max grade'"
              value={userRequirements}
              onChange={(e) => setUserRequirements(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!parsedData || isAnalyzing}
            className="w-full"
            size="lg"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Analyzing Design with AI...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-5 w-5" />
                Analyze Design with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
