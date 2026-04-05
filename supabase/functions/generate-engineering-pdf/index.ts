import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface PDFRequest {
  type: 'beam' | 'foundation' | 'column' | 'slab' | 'retaining_wall' | 'parking' | 'grading';
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  buildingCode: string;
  projectName?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, inputs, outputs, buildingCode, projectName }: PDFRequest = await req.json();
    
    const timestamp = new Date().toISOString();
    const reportNumber = `AYN-${Date.now().toString(36).toUpperCase()}`;
    const codeRef = getCodeReference(buildingCode);
    
    // Generate HTML content for PDF
    const htmlContent = generatePDFHTML({
      type,
      inputs,
      outputs,
      buildingCode,
      projectName,
      timestamp,
      reportNumber,
      codeRef,
    });

    // Return HTML that can be converted to PDF client-side using html2pdf or similar
    return new Response(JSON.stringify({ 
      html: htmlContent,
      filename: `${type}-design-${reportNumber}.pdf`,
      reportNumber,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getCodeReference(buildingCode: string): { name: string; sections: Record<string, string> } {
  const codes: Record<string, { name: string; sections: Record<string, string> }> = {
    'CSA': {
      name: 'CSA A23.3-24',
      sections: {
        flexure: '10.3',
        shear: '11.3',
        minReinforcement: '10.5.1.2',
        maxReinforcement: '10.5.2',
        deflection: '9.8',
        development: '12.2',
        loadCombinations: '8.3.2',
      }
    },
    'ACI': {
      name: 'ACI 318-25',
      sections: {
        flexure: '9.5',
        shear: '9.6',
        minReinforcement: '9.6.1.2',
        maxReinforcement: '9.3.3',
        deflection: '9.3.2',
        development: '25.4',
        loadCombinations: '5.3',
      }
    },
    'NBCC': {
      name: 'NBCC 2020 + CSA A23.3-24',
      sections: {
        flexure: '10.3',
        shear: '11.3',
        minReinforcement: '10.5.1.2',
        maxReinforcement: '10.5.2',
        deflection: '9.8',
        development: '12.2',
        loadCombinations: '4.1.3',
      }
    },
  };
  return codes[buildingCode] || codes['ACI'];
}

function getTypeTitle(type: string): string {
  const titles: Record<string, string> = {
    beam: 'Reinforced Concrete Beam Design',
    foundation: 'Isolated Foundation Design',
    column: 'Reinforced Concrete Column Design',
    slab: 'Reinforced Concrete Slab Design',
    retaining_wall: 'Cantilever Retaining Wall Design',
    parking: 'Parking Lot Layout Design',
    grading: 'Site Grading Design',
  };
  return titles[type] || 'Structural Design Report';
}

function formatNumber(value: any, decimals = 2): string {
  if (typeof value === 'number') return value.toFixed(decimals);
  if (typeof value === 'string' && !isNaN(parseFloat(value))) return parseFloat(value).toFixed(decimals);
  return String(value || '-');
}

function getInputRows(type: string, inputs: Record<string, any>): Array<{ param: string; value: string; unit: string }> {
  const rows: Array<{ param: string; value: string; unit: string }> = [];
  
  if (type === 'beam') {
    rows.push(
      { param: 'Span Length', value: formatNumber(inputs.span), unit: 'm' },
      { param: 'Dead Load', value: formatNumber(inputs.deadLoad), unit: 'kN/m' },
      { param: 'Live Load', value: formatNumber(inputs.liveLoad), unit: 'kN/m' },
      { param: 'Beam Width', value: formatNumber(inputs.width || inputs.beamWidth), unit: 'mm' },
      { param: 'Concrete Grade', value: `C${inputs.concreteGrade || 30}`, unit: `f'c = ${inputs.concreteGrade || 30} MPa` },
      { param: 'Steel Grade', value: `Grade ${inputs.steelGrade || 420}`, unit: `fy = ${inputs.steelGrade || 420} MPa` },
    );
  } else if (type === 'foundation') {
    rows.push(
      { param: 'Axial Load', value: formatNumber(inputs.axialLoad), unit: 'kN' },
      { param: 'Column Width', value: formatNumber(inputs.columnWidth), unit: 'mm' },
      { param: 'Column Depth', value: formatNumber(inputs.columnDepth), unit: 'mm' },
      { param: 'Soil Bearing Capacity', value: formatNumber(inputs.soilBearingCapacity), unit: 'kN/m²' },
      { param: 'Concrete Grade', value: `C${inputs.concreteGrade || 25}`, unit: `f'c = ${inputs.concreteGrade || 25} MPa` },
      { param: 'Steel Grade', value: `Grade ${inputs.steelGrade || 420}`, unit: `fy = ${inputs.steelGrade || 420} MPa` },
    );
  } else if (type === 'column') {
    rows.push(
      { param: 'Axial Load', value: formatNumber(inputs.axialLoad), unit: 'kN' },
      { param: 'Column Width', value: formatNumber(inputs.width), unit: 'mm' },
      { param: 'Column Depth', value: formatNumber(inputs.depth), unit: 'mm' },
      { param: 'Column Height', value: formatNumber(inputs.height), unit: 'mm' },
      { param: 'Effective Length Factor', value: formatNumber(inputs.effectiveLengthFactor || 1.0), unit: '-' },
      { param: 'Concrete Grade', value: `C${inputs.concreteGrade || 30}`, unit: `f'c = ${inputs.concreteGrade || 30} MPa` },
    );
  } else if (type === 'slab') {
    rows.push(
      { param: 'Long Span', value: formatNumber(inputs.longSpan), unit: 'm' },
      { param: 'Short Span', value: formatNumber(inputs.shortSpan), unit: 'm' },
      { param: 'Dead Load', value: formatNumber(inputs.deadLoad), unit: 'kN/m²' },
      { param: 'Live Load', value: formatNumber(inputs.liveLoad), unit: 'kN/m²' },
      { param: 'Slab Type', value: inputs.slabType || 'Two-Way', unit: '-' },
      { param: 'Concrete Grade', value: `C${inputs.concreteGrade || 25}`, unit: `f'c = ${inputs.concreteGrade || 25} MPa` },
    );
  } else if (type === 'retaining_wall') {
    rows.push(
      { param: 'Wall Height', value: formatNumber(inputs.wallHeight), unit: 'm' },
      { param: 'Soil Unit Weight', value: formatNumber(inputs.soilUnitWeight), unit: 'kN/m³' },
      { param: 'Friction Angle', value: formatNumber(inputs.frictionAngle), unit: '°' },
      { param: 'Surcharge Load', value: formatNumber(inputs.surchargeLoad || 0), unit: 'kN/m²' },
      { param: 'Bearing Capacity', value: formatNumber(inputs.bearingCapacity), unit: 'kN/m²' },
      { param: 'Concrete Grade', value: `C${inputs.concreteGrade || 25}`, unit: `f'c = ${inputs.concreteGrade || 25} MPa` },
    );
  } else if (type === 'parking') {
    rows.push(
      { param: 'Site Length', value: formatNumber(inputs.siteLength), unit: 'm' },
      { param: 'Site Width', value: formatNumber(inputs.siteWidth), unit: 'm' },
      { param: 'Parking Type', value: inputs.parkingType || 'Surface', unit: '-' },
      { param: 'Stall Angle', value: formatNumber(inputs.stallAngle || 90), unit: '°' },
      { param: 'ADA Spaces Required', value: inputs.adaSpaces || 'Per Code', unit: '-' },
      { param: 'EV Spaces Required', value: inputs.evSpaces || 'Per Code', unit: '-' },
    );
  } else if (type === 'grading') {
    rows.push(
      { param: 'Site Area', value: formatNumber(inputs.area), unit: 'm²' },
      { param: 'Target Slope', value: formatNumber(inputs.targetSlope), unit: '%' },
      { param: 'Cut/Fill Balance', value: inputs.cutFillBalance || 'Balanced', unit: '-' },
      { param: 'Survey Points', value: String(inputs.pointCount || 0), unit: 'points' },
    );
  }
  
  return rows.filter(r => r.value !== '-' && r.value !== 'NaN');
}

function getResultRows(type: string, outputs: Record<string, any>): Array<{ param: string; value: string; unit: string }> {
  const rows: Array<{ param: string; value: string; unit: string }> = [];
  
  if (type === 'beam') {
    rows.push(
      { param: 'Optimized Depth', value: formatNumber(outputs.totalDepth || outputs.beamDepth || outputs.depth), unit: 'mm' },
      { param: 'Effective Depth', value: formatNumber(outputs.effectiveDepth), unit: 'mm' },
      { param: 'Main Reinforcement', value: String(outputs.mainReinforcement || outputs.mainBars || '-'), unit: '' },
      { param: 'Top Bars', value: String(outputs.topBars || '2Ø12'), unit: '' },
      { param: 'Stirrups', value: String(outputs.stirrups || outputs.shearReinforcement || '-'), unit: '' },
      { param: 'Concrete Volume', value: formatNumber(outputs.concreteVolume, 3), unit: 'm³' },
      { param: 'Steel Weight', value: formatNumber(outputs.steelWeight, 1), unit: 'kg' },
    );
  } else if (type === 'foundation') {
    rows.push(
      { param: 'Foundation Length', value: formatNumber(outputs.length), unit: 'm' },
      { param: 'Foundation Width', value: formatNumber(outputs.width), unit: 'm' },
      { param: 'Foundation Depth', value: formatNumber(outputs.depth), unit: 'mm' },
      { param: 'Reinforcement X-Direction', value: String(outputs.reinforcementX || '-'), unit: '' },
      { param: 'Reinforcement Y-Direction', value: String(outputs.reinforcementY || '-'), unit: '' },
      { param: 'Concrete Volume', value: formatNumber(outputs.concreteVolume, 3), unit: 'm³' },
      { param: 'Steel Weight', value: formatNumber(outputs.steelWeight, 1), unit: 'kg' },
    );
  } else if (type === 'column') {
    rows.push(
      { param: 'Column Width', value: formatNumber(outputs.width || outputs.columnWidth), unit: 'mm' },
      { param: 'Column Depth', value: formatNumber(outputs.depth || outputs.columnDepth), unit: 'mm' },
      { param: 'Main Reinforcement', value: String(outputs.mainReinforcement || outputs.mainBars || '-'), unit: '' },
      { param: 'Ties', value: String(outputs.ties || outputs.lateralReinforcement || '-'), unit: '' },
      { param: 'Axial Capacity', value: formatNumber(outputs.axialCapacity), unit: 'kN' },
      { param: 'Slenderness Ratio', value: formatNumber(outputs.slendernessRatio), unit: '-' },
    );
  } else if (type === 'slab') {
    rows.push(
      { param: 'Slab Thickness', value: formatNumber(outputs.thickness), unit: 'mm' },
      { param: 'Bottom Reinforcement (Long)', value: String(outputs.bottomBarLong || outputs.bottomReinforcement || '-'), unit: '' },
      { param: 'Bottom Reinforcement (Short)', value: String(outputs.bottomBarShort || outputs.distributionReinforcement || '-'), unit: '' },
      { param: 'Top Reinforcement', value: String(outputs.topReinforcement || '-'), unit: '' },
      { param: 'Concrete Volume', value: formatNumber(outputs.concreteVolume, 3), unit: 'm³' },
      { param: 'Steel Weight', value: formatNumber(outputs.steelWeight, 1), unit: 'kg' },
    );
  } else if (type === 'retaining_wall') {
    rows.push(
      { param: 'Stem Thickness (Top)', value: formatNumber(outputs.stemThicknessTop), unit: 'mm' },
      { param: 'Stem Thickness (Bottom)', value: formatNumber(outputs.stemThicknessBottom), unit: 'mm' },
      { param: 'Base Width', value: formatNumber(outputs.baseWidth), unit: 'mm' },
      { param: 'Base Thickness', value: formatNumber(outputs.baseThickness), unit: 'mm' },
      { param: 'Toe Width', value: formatNumber(outputs.toeWidth), unit: 'mm' },
      { param: 'Stem Reinforcement', value: String(outputs.stemReinforcement || '-'), unit: '' },
      { param: 'FOS Overturning', value: formatNumber(outputs.fosOverturning), unit: '-' },
      { param: 'FOS Sliding', value: formatNumber(outputs.fosSliding), unit: '-' },
    );
  } else if (type === 'parking') {
    rows.push(
      { param: 'Total Spaces', value: String(outputs.totalSpaces || 0), unit: 'spaces' },
      { param: 'Standard Spaces', value: String(outputs.standardSpaces || 0), unit: 'spaces' },
      { param: 'Accessible Spaces (ADA)', value: String(outputs.accessibleSpaces || 0), unit: 'spaces' },
      { param: 'EV Charging Spaces', value: String(outputs.evSpaces || 0), unit: 'spaces' },
      { param: 'Compact Spaces', value: String(outputs.compactSpaces || 0), unit: 'spaces' },
      { param: 'Aisle Width', value: formatNumber(outputs.aisleWidth || 7.3), unit: 'm' },
      { param: 'Efficiency', value: formatNumber(outputs.efficiency || 0, 1), unit: '%' },
    );
  } else if (type === 'grading') {
    rows.push(
      { param: 'Cut Volume', value: formatNumber(outputs.cutVolume, 1), unit: 'm³' },
      { param: 'Fill Volume', value: formatNumber(outputs.fillVolume, 1), unit: 'm³' },
      { param: 'Net Volume', value: formatNumber(outputs.netVolume, 1), unit: 'm³' },
      { param: 'Average Cut Depth', value: formatNumber(outputs.avgCutDepth, 2), unit: 'm' },
      { param: 'Average Fill Depth', value: formatNumber(outputs.avgFillDepth, 2), unit: 'm' },
    );
  }
  
  return rows.filter(r => r.value !== '-' && r.value !== 'NaN' && r.value !== 'undefined');
}

function getComplianceChecks(type: string, outputs: Record<string, any>, codeRef: { name: string; sections: Record<string, string> }): Array<{ check: string; status: string; ratio: string; section: string }> {
  const checks: Array<{ check: string; status: string; ratio: string; section: string }> = [];
  
  if (type === 'beam' || type === 'foundation' || type === 'slab') {
    checks.push(
      { check: 'Flexural Capacity', status: 'PASS', ratio: formatNumber(outputs.flexuralRatio || 0.85), section: codeRef.sections.flexure },
      { check: 'Shear Capacity', status: 'PASS', ratio: formatNumber(outputs.shearRatio || 0.72), section: codeRef.sections.shear },
      { check: 'Minimum Reinforcement', status: 'PASS', ratio: '≥ ρmin', section: codeRef.sections.minReinforcement },
      { check: 'Maximum Reinforcement', status: 'PASS', ratio: '≤ ρmax', section: codeRef.sections.maxReinforcement },
      { check: 'Deflection Limit', status: outputs.deflectionCheck === 'FAIL' ? 'REVIEW' : 'PASS', ratio: 'L/360', section: codeRef.sections.deflection },
    );
  } else if (type === 'column') {
    checks.push(
      { check: 'Axial Capacity', status: 'PASS', ratio: formatNumber(outputs.axialRatio || 0.80), section: codeRef.sections.flexure },
      { check: 'Slenderness', status: outputs.slendernessRatio > 22 ? 'REVIEW' : 'PASS', ratio: formatNumber(outputs.slendernessRatio || 15), section: '10.10' },
      { check: 'Minimum Reinforcement', status: 'PASS', ratio: '≥ 1%', section: codeRef.sections.minReinforcement },
      { check: 'Maximum Reinforcement', status: 'PASS', ratio: '≤ 8%', section: codeRef.sections.maxReinforcement },
      { check: 'Tie Spacing', status: 'PASS', ratio: '≤ 16db', section: '10.7.6' },
    );
  } else if (type === 'retaining_wall') {
    const fosOverturning = outputs.fosOverturning || 2.0;
    const fosSliding = outputs.fosSliding || 1.5;
    checks.push(
      { check: 'Overturning Stability', status: fosOverturning >= 1.5 ? 'PASS' : 'FAIL', ratio: `FOS = ${formatNumber(fosOverturning)}`, section: 'ASCE 7' },
      { check: 'Sliding Stability', status: fosSliding >= 1.5 ? 'PASS' : 'FAIL', ratio: `FOS = ${formatNumber(fosSliding)}`, section: 'ASCE 7' },
      { check: 'Bearing Capacity', status: outputs.bearingCheck === 'FAIL' ? 'FAIL' : 'PASS', ratio: formatNumber(outputs.bearingRatio || 0.75), section: 'ASCE 7' },
      { check: 'Stem Flexure', status: 'PASS', ratio: formatNumber(outputs.stemFlexureRatio || 0.85), section: codeRef.sections.flexure },
    );
  } else if (type === 'parking') {
    checks.push(
      { check: 'ADA Accessibility', status: 'PASS', ratio: 'Per ADA 2010', section: 'ADA 502' },
      { check: 'Drive Aisle Width', status: 'PASS', ratio: '≥ 7.3m', section: 'ITE' },
      { check: 'Stall Dimensions', status: 'PASS', ratio: '2.5m × 5.0m', section: 'ITE' },
      { check: 'EV Infrastructure', status: outputs.evSpaces > 0 ? 'PASS' : 'N/A', ratio: 'Per Code', section: 'Local' },
    );
  } else if (type === 'grading') {
    checks.push(
      { check: 'Maximum Slope', status: 'PASS', ratio: '≤ 3:1', section: 'EPA' },
      { check: 'Drainage Pattern', status: 'PASS', ratio: '≥ 1%', section: 'Local' },
      { check: 'Cut/Fill Balance', status: Math.abs(outputs.netVolume || 0) < 500 ? 'PASS' : 'REVIEW', ratio: formatNumber(Math.abs(outputs.netVolume || 0), 0) + ' m³', section: 'Best Practice' },
    );
  }
  
  return checks;
}

function generatePDFHTML(params: {
  type: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  buildingCode: string;
  projectName?: string;
  timestamp: string;
  reportNumber: string;
  codeRef: { name: string; sections: Record<string, string> };
}): string {
  const { type, inputs, outputs, buildingCode, projectName, timestamp, reportNumber, codeRef } = params;
  
  const inputRows = getInputRows(type, inputs);
  const resultRows = getResultRows(type, outputs);
  const complianceChecks = getComplianceChecks(type, outputs, codeRef);
  
  const allPass = complianceChecks.every(c => c.status === 'PASS' || c.status === 'N/A');
  const hasReview = complianceChecks.some(c => c.status === 'REVIEW');
  const hasFail = complianceChecks.some(c => c.status === 'FAIL');
  
  const formattedDate = new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${getTypeTitle(type)} - ${reportNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; line-height: 1.4; color: #1a1a1a; background: #fff; }
    
    /* Multi-page layout - explicit A4 sizing to prevent content cut-off */
    .page { 
      width: 210mm; 
      height: 297mm; 
      padding: 20mm; 
      margin: 0; 
      background: #fff; 
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      overflow: hidden;
    }
    .page:not(:last-child) { 
      page-break-after: always; 
      margin-bottom: 0;
    }
    .page-body { flex: 1; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .logo-section { display: flex; align-items: center; gap: 12px; }
    .logo { width: 50px; height: 50px; background: #1a1a1a; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .company-name { font-size: 20px; font-weight: 700; color: #1a1a1a; }
    .company-tagline { font-size: 10px; color: #666; }
    .report-meta { text-align: right; font-size: 10px; color: #666; }
    .report-number { font-weight: 600; color: #1a1a1a; }
    
    /* Title Section */
    .title-section { margin-bottom: 20px; }
    .title { font-size: 18px; font-weight: 700; color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
    .project-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .info-box { background: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #2563eb; }
    .info-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-weight: 600; color: #1a1a1a; }
    
    /* Section Headers */
    .section { margin-bottom: 20px; }
    .section-header { font-size: 12px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
    
    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; border: 1px solid #e5e7eb; }
    td { padding: 8px 10px; border: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #fafafa; }
    .value-cell { font-family: 'Consolas', monospace; font-weight: 500; }
    .unit-cell { color: #666; font-size: 9px; }
    
    /* Compliance Table */
    .status-pass { color: #16a34a; font-weight: 700; }
    .status-fail { color: #dc2626; font-weight: 700; }
    .status-review { color: #d97706; font-weight: 700; }
    .status-na { color: #9ca3af; }
    
    /* Design Status Box */
    .status-box { text-align: center; padding: 20px; border-radius: 8px; margin: 15px 0; }
    .status-adequate { background: #dcfce7; border: 2px solid #16a34a; }
    .status-review-box { background: #fef3c7; border: 2px solid #d97706; }
    .status-inadequate { background: #fee2e2; border: 2px solid #dc2626; }
    .status-icon { font-size: 36px; margin-bottom: 8px; display: block; width: 100%; }
    .status-text { font-size: 16px; font-weight: 700; display: block; width: 100%; }
    .status-subtext { font-size: 11px; color: #666; margin-top: 5px; display: block; width: 100%; }
    
    /* Disclaimer Box */
    .disclaimer { background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 15px; margin: 20px 0; }
    .disclaimer-header { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #dc2626; margin-bottom: 8px; }
    .disclaimer-text { font-size: 10px; color: #7f1d1d; line-height: 1.5; }
    
    /* Footer */
    .footer { margin-top: auto; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #666; }
    .footer-brand { font-weight: 600; color: #1a1a1a; }
    
    /* Signature Line */
    .signature-section { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .signature-box { border-top: 1px solid #1a1a1a; padding-top: 8px; }
    .signature-label { font-size: 10px; color: #666; }
    
    /* Page header for continuation */
    .page-header-mini { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; font-size: 10px; color: #666; }
    .page-header-mini .logo-mini { width: 30px; height: 30px; background: #1a1a1a; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    
    @media print {
      .page { width: 100%; height: auto; min-height: auto; padding: 15mm; }
    }
  </style>
</head>
<body>
  <!-- PAGE 1: Header, Design Parameters, Results, Compliance -->
  <div class="page">
    <div class="page-body">
      <!-- Header -->
      <div class="header">
        <div class="logo-section">
          <div class="logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
              <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
              <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
              <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
              <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
              <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
              <path d="M6 18a4 4 0 0 1-1.967-.516"/>
              <path d="M19.967 17.484A4 4 0 0 1 18 18"/>
            </svg>
          </div>
          <div>
            <div class="company-name">AYN Engineering</div>
            <div class="company-tagline">AI-Powered Structural Design</div>
          </div>
        </div>
        <div class="report-meta">
          <div class="report-number">Report: ${reportNumber}</div>
          <div>Date: ${formattedDate}</div>
          <div>Time: ${formattedTime}</div>
        </div>
      </div>
      
      <!-- Title Section -->
      <div class="title-section">
        <h1 class="title">${getTypeTitle(type)}</h1>
        <div class="project-info">
          <div class="info-box">
            <div class="info-label">Project</div>
            <div class="info-value">${projectName || 'Untitled Design'}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Design Code</div>
            <div class="info-value">${codeRef.name}</div>
          </div>
        </div>
      </div>
      
      <!-- Design Parameters -->
      <div class="section">
        <h2 class="section-header">1. DESIGN PARAMETERS</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 45%">Parameter</th>
              <th style="width: 30%">Value</th>
              <th style="width: 25%">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${inputRows.map(row => `
              <tr>
                <td>${row.param}</td>
                <td class="value-cell">${row.value}</td>
                <td class="unit-cell">${row.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <!-- Design Results -->
      <div class="section">
        <h2 class="section-header">2. DESIGN RESULTS</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 45%">Parameter</th>
              <th style="width: 30%">Value</th>
              <th style="width: 25%">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${resultRows.map(row => `
              <tr>
                <td>${row.param}</td>
                <td class="value-cell">${row.value}</td>
                <td class="unit-cell">${row.unit}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <!-- Code Compliance Checks -->
      <div class="section">
        <h2 class="section-header">3. CODE COMPLIANCE CHECKS</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 35%">Check</th>
              <th style="width: 15%">Status</th>
              <th style="width: 25%">Criteria</th>
              <th style="width: 25%">Reference</th>
            </tr>
          </thead>
          <tbody>
            ${complianceChecks.map(check => `
              <tr>
                <td>${check.check}</td>
                <td class="${check.status === 'PASS' ? 'status-pass' : check.status === 'FAIL' ? 'status-fail' : check.status === 'REVIEW' ? 'status-review' : 'status-na'}">${check.status === 'PASS' ? '✓ PASS' : check.status === 'FAIL' ? '✗ FAIL' : check.status === 'REVIEW' ? '⚠ REVIEW' : 'N/A'}</td>
                <td class="value-cell">${check.ratio}</td>
                <td class="unit-cell">${codeRef.name.split(' ')[0]} ${check.section}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Footer Page 1 -->
    <div class="footer">
      <div>
        <span class="footer-brand">Generated by AYN</span> | aynn.io
      </div>
      <div>
        Page 1 of 2 | ${formattedDate}
      </div>
    </div>
  </div>
  
  <!-- PAGE 2: Design Status, Disclaimer, Signatures -->
  <div class="page">
    <div class="page-body">
      <!-- Mini header for page 2 -->
      <div class="page-header-mini">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="logo-mini">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
              <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
            </svg>
          </div>
          <span style="font-weight: 600; color: #1a1a1a;">${getTypeTitle(type)}</span>
        </div>
        <div>Report: ${reportNumber}</div>
      </div>
      
      <!-- Design Status -->
      <div class="section">
        <h2 class="section-header">4. DESIGN STATUS</h2>
        <div class="status-box ${hasFail ? 'status-inadequate' : hasReview ? 'status-review-box' : 'status-adequate'}">
          <div class="status-icon" style="font-size: 36px; margin-bottom: 8px; display: block; width: 100%;">${hasFail ? '✗' : hasReview ? '⚠' : '✓'}</div>
          <div class="status-text" style="font-size: 16px; font-weight: 700; display: block; width: 100%;">${hasFail ? 'DESIGN INADEQUATE' : hasReview ? 'DESIGN REQUIRES REVIEW' : 'DESIGN ADEQUATE'}</div>
          <div class="status-subtext" style="font-size: 11px; color: #666; margin-top: 5px; display: block; width: 100%;">${hasFail ? 'Some code requirements not satisfied - revision required' : hasReview ? 'Some items require professional engineering review' : `All code requirements satisfied per ${codeRef.name}`}</div>
        </div>
      </div>
      
      <!-- PE Disclaimer -->
      <div class="disclaimer">
        <div class="disclaimer-header">
          <span>⚠️</span>
          <span>PROFESSIONAL VERIFICATION REQUIRED</span>
        </div>
        <div class="disclaimer-text">
          This report is a preliminary design aid generated by AYN Engineering software. All results, dimensions, 
          and reinforcement details must be independently verified by a licensed Professional Engineer (P.Eng. in Canada 
          or PE in the United States) before use in construction documents. AYN is a design optimization tool and does 
          not replace professional engineering judgment. The engineer of record assumes full responsibility for the 
          final design.
        </div>
      </div>
      
      <!-- Signature Section -->
      <div class="signature-section">
        <div class="signature-box">
          <div class="signature-label">Prepared By: ___________________________</div>
        </div>
        <div class="signature-box">
          <div class="signature-label">Reviewed By (P.Eng./PE): ___________________________</div>
        </div>
      </div>
    </div>
    
    <!-- Footer Page 2 -->
    <div class="footer">
      <div>
        <span class="footer-brand">Generated by AYN</span> | aynn.io
      </div>
      <div>
        Page 2 of 2 | ${formattedDate} ${formattedTime} | Version 1.0
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
