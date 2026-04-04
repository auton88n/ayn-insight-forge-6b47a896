import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { uploadDocumentToStorage } from "../_shared/storageUpload.ts";
import { sanitizeUserPrompt } from "../_shared/sanitizePrompt.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Noto Sans Arabic font as base64 (subset for common Arabic characters)
// This is a minimal subset - for production, consider using a CDN
const ARABIC_FONT_URL = 'https://fonts.gstatic.com/s/notosansarabic/v18/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyGyvvnCBFQLaig.ttf';

// Content limits (safety caps)
const CONTENT_LIMITS = {
  maxSections: 12,
  maxTableRows: 50
};

interface DocumentSection {
  heading: string;
  content?: string;
  table?: {
    headers: string[];
    rows: string[][];
  };
}

interface DocumentRequest {
  type: 'pdf' | 'excel';
  language: 'en' | 'ar' | 'fr';
  title: string;
  sections: DocumentSection[];
  userId?: string;
}

// Apply content limits to prevent abuse
function applyContentLimits(sections: DocumentSection[]): DocumentSection[] {
  // Limit number of sections
  const limitedSections = sections.slice(0, CONTENT_LIMITS.maxSections);
  
  // Limit table rows in each section
  return limitedSections.map(section => {
    if (section.table?.rows) {
      return {
        ...section,
        table: {
          headers: section.table.headers,
          rows: section.table.rows.slice(0, CONTENT_LIMITS.maxTableRows)
        }
      };
    }
    return section;
  });
}

// Detect language from content if not specified
function detectLanguage(content: string): 'en' | 'ar' | 'fr' {
  // Arabic detection
  if (/[\u0600-\u06FF]/.test(content)) return 'ar';
  // French detection (common French words/accents)
  if (/[àâäéèêëïîôùûüÿœæç]/i.test(content) || 
      /\b(le|la|les|un|une|des|et|ou|mais|donc|car|ni|or|que|qui|quoi)\b/i.test(content)) return 'fr';
  return 'en';
}

// Format date based on language
function formatDate(date: Date, language: string): string {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  
  const locales: Record<string, string> = {
    ar: 'ar-SA',
    fr: 'fr-FR',
    en: 'en-US'
  };
  
  return date.toLocaleDateString(locales[language] || 'en-US', options);
}

// Get page number label (no branding)
function getPageLabel(language: string): string {
  const labels: Record<string, string> = {
    ar: 'صفحة',
    fr: 'Page',
    en: 'Page'
  };
  return labels[language] || labels.en;
}

// Generate PDF using jsPDF
async function generatePDF(data: DocumentRequest): Promise<Uint8Array> {
  // Dynamic import of jsPDF
  const { jsPDF } = await import("https://esm.sh/jspdf@2.5.1");
  
  const isRTL = data.language === 'ar';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (2 * margin);
  let y = 0;
  
  // Load Arabic font if needed
  if (isRTL) {
    try {
      const fontResponse = await fetch(ARABIC_FONT_URL);
      if (fontResponse.ok) {
        const fontBuffer = await fontResponse.arrayBuffer();
        const fontBase64 = btoa(String.fromCharCode(...new Uint8Array(fontBuffer)));
        doc.addFileToVFS('NotoSansArabic.ttf', fontBase64);
        doc.addFont('NotoSansArabic.ttf', 'NotoSansArabic', 'normal');
        doc.setFont('NotoSansArabic');
      }
    } catch (e) {
      console.warn('[generate-document] Failed to load Arabic font, using default:', e);
    }
  }
  
  // ===== HEADER SECTION (No branding) =====
  // Dark gradient header background
  doc.setFillColor(26, 26, 46); // #1a1a2e
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Lighter accent line at bottom of header
  doc.setFillColor(22, 33, 62); // #16213e
  doc.rect(0, 35, pageWidth, 5, 'F');
  
  // Title (main element, no logo)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  const titleMaxWidth = pageWidth - 80;
  const titleLines = doc.splitTextToSize(data.title, titleMaxWidth);
  if (isRTL) {
    doc.text(titleLines[0] || data.title, pageWidth - margin, 22, { align: 'right' });
  } else {
    doc.text(titleLines[0] || data.title, margin, 22);
  }
  
  // Date
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 200);
  const dateStr = formatDate(new Date(), data.language);
  if (isRTL) {
    doc.text(dateStr, margin, 22, { align: 'left' });
  } else {
    doc.text(dateStr, pageWidth - margin, 22, { align: 'right' });
  }
  
  y = 55; // Start content after header
  
  // ===== CONTENT SECTIONS =====
  doc.setTextColor(33, 33, 33);
  
  for (const section of data.sections) {
    // Calculate needed space for heading + content/table to keep them together
    const headingHeight = 18; // heading + spacing
    let sectionContentHeight = 0;
    if (section.content) {
      const preLines = doc.splitTextToSize(section.content, contentWidth - 10);
      sectionContentHeight = preLines.length * 6 + 5;
    }
    if (section.table && section.table.headers && section.table.rows) {
      const tableH = 14 + (Math.min(section.table.rows.length, 5) * 12) + 10;
      sectionContentHeight = Math.max(sectionContentHeight, tableH);
    }
    // If heading + first part of content won't fit, move everything to next page
    const neededSpace = headingHeight + Math.min(sectionContentHeight, 60);
    if (y + neededSpace > pageHeight - 40) {
      addFooter(doc, pageWidth, pageHeight, margin, data.language, isRTL);
      doc.addPage();
      y = 30;
    }
    
    // Section heading with accent bar
    doc.setFillColor(78, 78, 120); // Purple accent
    if (isRTL) {
      doc.rect(pageWidth - margin - 3, y - 4, 3, 10, 'F');
    } else {
      doc.rect(margin, y - 4, 3, 10, 'F');
    }
    
    doc.setFontSize(14);
    doc.setTextColor(26, 26, 46);
    doc.setFont(isRTL ? 'NotoSansArabic' : 'helvetica', 'bold');
    
    if (isRTL) {
      doc.text(section.heading, pageWidth - margin - 8, y, { align: 'right' });
    } else {
      doc.text(section.heading, margin + 8, y);
    }
    
    y += 10;
    
    // Section content
    if (section.content) {
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.setFont(isRTL ? 'NotoSansArabic' : 'helvetica', 'normal');
      
      const lines = doc.splitTextToSize(section.content, contentWidth - 10);
      for (const line of lines) {
        if (y > pageHeight - 40) {
          addFooter(doc, pageWidth, pageHeight, margin, data.language, isRTL);
          doc.addPage();
          y = 30;
        }
        if (isRTL) {
          doc.text(line, pageWidth - margin - 5, y, { align: 'right' });
        } else {
          doc.text(line, margin + 5, y);
        }
        y += 6;
      }
      y += 5;
    }
    
    // Section table - with improved padding and page-break prevention
    if (section.table && section.table.headers && section.table.rows) {
      const table = section.table;
      const colCount = table.headers.length;
      const colWidth = (contentWidth - 10) / colCount;
      const startX = margin + 5;
      const cellPadding = 3; // Horizontal padding in mm
      const headerHeight = 14; // Increased from 10
      const rowHeight = 12; // Increased from 8
      
      // For RTL, reverse columns
      const headers = isRTL ? [...table.headers].reverse() : table.headers;
      const rows = isRTL ? table.rows.map(row => [...row].reverse()) : table.rows;
      
      // Calculate total table height to prevent page breaks
      const tableHeight = headerHeight + (rows.length * rowHeight) + 10; // +10 for padding
      const remainingSpace = pageHeight - y - 40; // 40 for footer margin
      
      // If table doesn't fit on current page, start a new page
      if (tableHeight > remainingSpace && y > 80) {
        addFooter(doc, pageWidth, pageHeight, margin, data.language, isRTL);
        doc.addPage();
        y = 30;
      }
      
      // Table header with better padding
      doc.setFillColor(240, 240, 245);
      doc.rect(startX, y - 5, contentWidth - 10, headerHeight, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(33, 33, 33);
      doc.setFont(isRTL ? 'NotoSansArabic' : 'helvetica', 'bold');
      
      headers.forEach((header, i) => {
        const x = startX + (i * colWidth) + (colWidth / 2);
        doc.text(header, x, y + 4, { align: 'center' }); // Better vertical centering
      });
      
      y += headerHeight;
      
      // Table rows with improved spacing
      doc.setFont(isRTL ? 'NotoSansArabic' : 'helvetica', 'normal');
      rows.forEach((row, rowIndex) => {
        // Alternating row colors
        if (rowIndex % 2 === 1) {
          doc.setFillColor(248, 248, 252);
          doc.rect(startX, y - 5, contentWidth - 10, rowHeight, 'F');
        }
        
        doc.setTextColor(60, 60, 60);
        row.forEach((cell, i) => {
          const x = startX + (i * colWidth) + (colWidth / 2);
          // Truncate long text to fit cell with padding
          const maxWidth = colWidth - (cellPadding * 2);
          const cellText = String(cell || '');
          const truncatedText = doc.splitTextToSize(cellText, maxWidth)[0] || cellText;
          doc.text(truncatedText, x, y + 3, { align: 'center' }); // Better vertical centering
        });
        
        y += rowHeight;
      });
      
      // Table border
      doc.setDrawColor(200, 200, 210);
      const tableTop = y - (rows.length * rowHeight) - headerHeight;
      doc.rect(startX, tableTop - 5, contentWidth - 10, (rows.length * rowHeight) + headerHeight + 5);
      
      y += 10;
    }
    
    y += 8; // Space between sections
  }
  
  // Add final footer
  addFooter(doc, pageWidth, pageHeight, margin, data.language, isRTL);
  
  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

function addFooter(
  doc: any, 
  pageWidth: number, 
  pageHeight: number, 
  margin: number, 
  language: string,
  isRTL: boolean
): void {
  const footerY = pageHeight - 15;
  
  // Footer line
  doc.setDrawColor(200, 200, 210);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
  
  // Footer - just page number, no branding
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 140);
  
  const pageLabel = getPageLabel(language);
  const pageNum = doc.getCurrentPageInfo().pageNumber;
  const pageText = `${pageLabel} ${pageNum}`;
  
  // Center the page number
  doc.text(pageText, pageWidth / 2, footerY, { align: 'center' });
}

// Generate styled Excel file using HTML table (opens natively in Excel/Sheets/LibreOffice)
function generateExcel(data: DocumentRequest): Uint8Array {
  const isRTL = data.language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const fontFamily = isRTL ? "'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif" : "'Segoe UI', Calibri, Arial, sans-serif";
  const dateStr = formatDate(new Date(), data.language);

  const esc = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let tableRows = '';

  for (const section of data.sections) {
    // Section heading row (merged across max columns)
    const maxCols = section.table?.headers?.length || 1;
    tableRows += `<tr><td colspan="${maxCols}" class="section-heading">${esc(section.heading)}</td></tr>\n`;

    if (section.content) {
      tableRows += `<tr><td colspan="${maxCols}" class="content-cell">${esc(section.content)}</td></tr>\n`;
    }

    if (section.table && section.table.headers) {
      const headers = isRTL ? [...section.table.headers].reverse() : section.table.headers;
      tableRows += '<tr>' + headers.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>\n';

      for (const row of section.table.rows || []) {
        const cells = isRTL ? [...row].reverse() : row;
        tableRows += '<tr>' + cells.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>\n';
      }
    }

    // Spacer row
    tableRows += '<tr><td style="height:12px;border:none;"></td></tr>\n';
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Sheet1</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body { direction: ${dir}; }
  table { border-collapse: collapse; width: 100%; font-family: ${fontFamily}; font-size: 11pt; }
  th {
    background: #1a1a2e;
    color: #ffffff;
    font-weight: bold;
    padding: 10px 14px;
    border: 1px solid #16213e;
    text-align: ${isRTL ? 'right' : 'left'};
    mso-number-format: '\\@';
  }
  td {
    padding: 8px 14px;
    border: 1px solid #d0d0da;
    vertical-align: top;
    mso-number-format: '\\@';
  }
  tr:nth-child(even) td { background: #f8f8fc; }
  .section-heading {
    font-size: 13pt;
    font-weight: bold;
    color: #1a1a2e;
    background: #eeeef5;
    padding: 10px 14px;
    border: none;
    border-bottom: 2px solid #4e4e78;
  }
  .content-cell {
    color: #3c3c3c;
    font-size: 10.5pt;
    border: none;
    padding: 6px 14px 10px;
  }
  .title-row td {
    font-size: 16pt;
    font-weight: bold;
    color: #1a1a2e;
    padding: 14px;
    border: none;
  }
  .date-row td {
    font-size: 9pt;
    color: #828290;
    padding: 2px 14px 14px;
    border: none;
  }
</style>
</head>
<body>
<table>
  <tr class="title-row"><td colspan="10">${esc(data.title)}</td></tr>
  <tr class="date-row"><td colspan="10">${esc(dateStr)}</td></tr>
  <tr><td colspan="10" style="height:8px;border:none;"></td></tr>
  ${tableRows}
</table>
</body>
</html>`;

  return new TextEncoder().encode('\uFEFF' + html);
}

// toDataUrl removed - files are now uploaded to Supabase Storage

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.json();
    // Sanitize user-provided text fields
    const body: DocumentRequest = {
      ...rawBody,
      title: sanitizeUserPrompt(rawBody.title || ''),
      sections: (rawBody.sections || []).map((s: any) => ({
        ...s,
        heading: sanitizeUserPrompt(s.heading || ''),
        content: s.content ? sanitizeUserPrompt(s.content) : undefined,
      })),
    };
    
    // Validate request
    if (!body.type || !body.title || !body.sections) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: type, title, sections' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Auto-detect language if not specified
    const language = body.language || detectLanguage(body.title + ' ' + 
      body.sections.map(s => s.heading + (s.content || '')).join(' '));
    
    // Apply content limits (safety caps)
    const limitedSections = applyContentLimits(body.sections);
    console.log(`[generate-document] Applied limits: ${body.sections.length} → ${limitedSections.length} sections`);
    
    console.log(`[generate-document] Creating ${body.type.toUpperCase()} in ${language}: ${body.title}`);
    
    let fileData: Uint8Array;
    let filename: string;
    let contentType: string;
    
    const timestamp = Date.now();
    const safeTitle = body.title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').substring(0, 50);
    
    if (body.type === 'pdf') {
      fileData = await generatePDF({ ...body, language, sections: limitedSections });
      filename = `${safeTitle}_${timestamp}.pdf`;
      contentType = 'application/pdf';
    } else if (body.type === 'excel') {
      fileData = generateExcel({ ...body, language, sections: limitedSections });
      filename = `${safeTitle}_${timestamp}.xls`;
      contentType = 'application/vnd.ms-excel';
    } else {
      return new Response(JSON.stringify({ 
        error: 'Invalid type. Must be "pdf" or "excel"' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Upload to Supabase Storage for permanent URL
    const userId = body.userId || 'anonymous';
    const downloadUrl = await uploadDocumentToStorage(fileData, userId, filename, contentType);
    
    console.log(`[generate-document] Document uploaded to storage: ${filename}`);
    
    return new Response(JSON.stringify({
      success: true,
      downloadUrl,
      filename,
      type: body.type,
      language
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[generate-document] Error:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Document generation failed',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
