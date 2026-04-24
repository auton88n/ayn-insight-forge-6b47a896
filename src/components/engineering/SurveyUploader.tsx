import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { validateFileExtension, scanForMaliciousContent } from '@/lib/fileValidation';

interface SurveyPoint {
  id: string;
  x: number;
  y: number;
  z: number;
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

interface SurveyUploaderProps {
  onUploadComplete: (points: SurveyPoint[], analysis: TerrainAnalysis) => void;
  isLoading: boolean;
}

const MAX_SURVEY_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for survey files
const ALLOWED_SURVEY_EXTENSIONS = ['txt', 'csv', 'xlsx'];

export const SurveyUploader: React.FC<SurveyUploaderProps> = ({ 
  onUploadComplete,
  isLoading
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{ points: SurveyPoint[], analysis: TerrainAnalysis } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    // Security check 1: File extension validation
    const extCheck = validateFileExtension(file.name);
    if (!extCheck.isValid) {
      toast({
        title: 'Invalid File Type',
        description: extCheck.error || 'This file type is not allowed',
        variant: 'destructive',
      });
      return;
    }

    // Security check 2: Verify allowed survey extensions
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_SURVEY_EXTENSIONS.includes(extension)) {
      toast({
        title: 'Unsupported Format',
        description: 'Please upload a .txt, .csv, or .xlsx file',
        variant: 'destructive',
      });
      return;
    }

    // Security check 3: File size limit
    if (file.size > MAX_SURVEY_FILE_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'Survey files must be smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    // Security check 4: Scan for malicious content
    try {
      const scanResult = await scanForMaliciousContent(file);
      if (!scanResult.isValid) {
        toast({
          title: 'Security Issue Detected',
          description: scanResult.error || 'File contains potentially harmful content',
          variant: 'destructive',
        });
        return;
      }
    } catch (err) {
      toast({
        title: 'Security Scan Failed',
        description: 'Could not verify file safety. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setParseResult(null);

    try {
      const content = await file.text();
      
      const { data, error } = await supabase.functions.invoke('parse-survey-file', {
        body: { content, fileName: file.name }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to parse file');
      }

      setParseResult({ points: data.points, analysis: data.terrainAnalysis });
      onUploadComplete(data.points, data.terrainAnalysis);
      
      toast({
        title: 'Survey file parsed successfully',
        description: `Found ${data.points.length} survey points`,
      });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error parsing file:', err);
      }
      toast({
        title: 'Error parsing file',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setFileName(null);
    } finally {
      setParsing(false);
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary" />
        Upload Survey Data
      </h3>

      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-border'}
          ${isLoading || parsing ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('survey-file-input')?.click()}
      >
        <input
          id="survey-file-input"
          type="file"
          accept=".txt,.csv,.xlsx"
          className="hidden"
          onChange={onFileSelect}
          disabled={isLoading || parsing}
        />

        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            <p className="text-muted-foreground">Parsing survey file...</p>
          </div>
        ) : parseResult ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="font-medium">{fileName}</p>
            <p className="text-sm text-muted-foreground">
              {parseResult.points.length} points parsed successfully
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              Upload Different File
            </Button>
          </div>
        ) : (
          <>
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium mb-2">Drop survey file here or click to browse</p>
            <p className="text-sm text-muted-foreground mb-4">
              Supports .txt (tab-separated), .csv formats
            </p>
            <div className="bg-muted/50 rounded p-3 text-xs text-left max-w-md mx-auto">
              <p className="font-medium mb-1">Expected format:</p>
              <code className="block">PointID, Easting, Northing, Elevation</code>
              <code className="block mt-1">P1, 100.00, 200.00, 45.50</code>
            </div>
          </>
        )}
      </div>

      {parseResult && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Points</p>
            <p className="text-lg font-semibold">{parseResult.analysis.pointCount}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Elevation Range</p>
            <p className="text-lg font-semibold">{parseResult.analysis.elevationRange.toFixed(2)}m</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Avg Elevation</p>
            <p className="text-lg font-semibold">{parseResult.analysis.avgElevation.toFixed(2)}m</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Est. Area</p>
            <p className="text-lg font-semibold">{(parseResult.analysis.estimatedArea / 10000).toFixed(2)} ha</p>
          </div>
        </div>
      )}
    </Card>
  );
};
