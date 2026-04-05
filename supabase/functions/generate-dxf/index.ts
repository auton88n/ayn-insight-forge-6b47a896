import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

// Layer color codes (AutoCAD ACI colors)
const LAYER_COLORS = {
  OUTLINE: 7,        // White
  DIMENSIONS: 3,     // Green
  REINFORCEMENT: 1,  // Red
  STIRRUPS: 5,       // Blue
  TEXT: 7,           // White
  COLUMN: 4,         // Cyan
  SITE_BOUNDARY: 7,  // White
  PARKING_STALLS: 3, // Green
  PARKING_AISLES: 5, // Blue
  PARKING_ADA: 1,    // Red
  PARKING_EV: 6,     // Magenta
  PARKING_TEXT: 7,   // White
  TITLE_BLOCK: 7,    // White
};

// Generate DXF header with layer definitions
function generateDXFHeader(layers: string[]): string {
  let header = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
`;

  // Add layer definitions
  for (const layer of layers) {
    const color = LAYER_COLORS[layer as keyof typeof LAYER_COLORS] || 7;
    header += `0
LAYER
2
${layer}
70
0
62
${color}
6
CONTINUOUS
`;
  }

  header += `0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  return header;
}

function generateDXFFooter(): string {
  return `0
ENDSEC
0
EOF`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, inputs, outputs } = await req.json();

    let dxfContent = '';

    if (type === 'beam') {
      dxfContent = generateBeamDXF(inputs, outputs);
    } else if (type === 'foundation') {
      dxfContent = generateFoundationDXF(inputs, outputs);
    } else if (type === 'parking') {
      dxfContent = generateParkingDXF(inputs, outputs);
    } else if (type === 'column') {
      dxfContent = generateColumnDXF(inputs, outputs);
    } else if (type === 'slab') {
      dxfContent = generateSlabDXF(inputs, outputs);
    } else if (type === 'retaining_wall') {
      dxfContent = generateRetainingWallDXF(inputs, outputs);
    }

    return new Response(JSON.stringify({ dxfContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('DXF generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateBeamDXF(inputs: any, outputs: any): string {
  const width = outputs.beamWidth || 300;
  const depth = outputs.beamDepth || 500;
  const cover = 40;
  const mainBars = outputs.numberOfBars || 4;
  const barDia = outputs.barDiameter || 20;

  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
BEAM_OUTLINE
10
0
20
0
11
${width}
21
0
0
LINE
8
BEAM_OUTLINE
10
${width}
20
0
11
${width}
21
${depth}
0
LINE
8
BEAM_OUTLINE
10
${width}
20
${depth}
11
0
21
${depth}
0
LINE
8
BEAM_OUTLINE
10
0
20
${depth}
11
0
21
0
0
TEXT
8
DIMENSIONS
10
${width / 2}
20
-20
40
12
1
${width} mm
0
TEXT
8
DIMENSIONS
10
${width + 20}
20
${depth / 2}
40
12
1
${depth} mm
0
TEXT
8
REINFORCEMENT
10
${width / 2}
20
${depth + 30}
40
10
1
Main: ${mainBars}Ø${barDia}
0
ENDSEC
0
EOF`;
}

function generateFoundationDXF(inputs: any, outputs: any): string {
  const length = (outputs.length || 2) * 1000;
  const width = (outputs.width || 2) * 1000;
  const colW = inputs.columnWidth || 400;
  const colD = inputs.columnDepth || 400;

  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
FOUNDATION_OUTLINE
10
0
20
0
11
${length}
21
0
0
LINE
8
FOUNDATION_OUTLINE
10
${length}
20
0
11
${length}
21
${width}
0
LINE
8
FOUNDATION_OUTLINE
10
${length}
20
${width}
11
0
21
${width}
0
LINE
8
FOUNDATION_OUTLINE
10
0
20
${width}
11
0
21
0
0
LINE
8
COLUMN
10
${(length - colW) / 2}
20
${(width - colD) / 2}
11
${(length + colW) / 2}
21
${(width - colD) / 2}
0
LINE
8
COLUMN
10
${(length + colW) / 2}
20
${(width - colD) / 2}
11
${(length + colW) / 2}
21
${(width + colD) / 2}
0
LINE
8
COLUMN
10
${(length + colW) / 2}
20
${(width + colD) / 2}
11
${(length - colW) / 2}
21
${(width + colD) / 2}
0
LINE
8
COLUMN
10
${(length - colW) / 2}
20
${(width + colD) / 2}
11
${(length - colW) / 2}
21
${(width - colD) / 2}
0
TEXT
8
DIMENSIONS
10
${length / 2}
20
-50
40
20
1
${outputs.length}m x ${outputs.width}m
0
ENDSEC
0
EOF`;
}

function generateParkingDXF(inputs: any, outputs: any): string {
  const siteLength = (inputs.siteLength || 100) * 1000; // Convert to mm
  const siteWidth = (inputs.siteWidth || 60) * 1000;
  const layout = outputs.layout || { spaces: [], aisles: [], entries: [], exits: [] };
  
  let entities = '';
  
  // Site boundary
  entities += `0
LINE
8
SITE_BOUNDARY
10
0
20
0
11
${siteLength}
21
0
0
LINE
8
SITE_BOUNDARY
10
${siteLength}
20
0
11
${siteLength}
21
${siteWidth}
0
LINE
8
SITE_BOUNDARY
10
${siteLength}
20
${siteWidth}
11
0
21
${siteWidth}
0
LINE
8
SITE_BOUNDARY
10
0
20
${siteWidth}
11
0
21
0
`;

  // Parking spaces
  if (layout.spaces && Array.isArray(layout.spaces)) {
    layout.spaces.forEach((space: any, i: number) => {
      const x = (space.x || 0) * 1000;
      const y = (space.y || 0) * 1000;
      const w = (space.width || 2.5) * 1000;
      const l = (space.length || 5) * 1000;
      const layer = space.type === 'accessible' ? 'ACCESSIBLE_SPACE' : 
                    space.type === 'ev' ? 'EV_SPACE' : 
                    space.type === 'compact' ? 'COMPACT_SPACE' : 'PARKING_SPACE';
      
      entities += `0
LINE
8
${layer}
10
${x}
20
${y}
11
${x + w}
21
${y}
0
LINE
8
${layer}
10
${x + w}
20
${y}
11
${x + w}
21
${y + l}
0
LINE
8
${layer}
10
${x + w}
20
${y + l}
11
${x}
21
${y + l}
0
LINE
8
${layer}
10
${x}
20
${y + l}
11
${x}
21
${y}
`;
    });
  }

  // Aisles
  if (layout.aisles && Array.isArray(layout.aisles)) {
    layout.aisles.forEach((aisle: any, i: number) => {
      const x = (aisle.x || 0) * 1000;
      const y = (aisle.y || 0) * 1000;
      const w = (aisle.width || 6) * 1000;
      const h = (aisle.height || 6) * 1000;
      
      entities += `0
LINE
8
AISLE
10
${x}
20
${y}
11
${x + w}
21
${y}
0
LINE
8
AISLE
10
${x + w}
20
${y}
11
${x + w}
21
${y + h}
0
LINE
8
AISLE
10
${x + w}
20
${y + h}
11
${x}
21
${y + h}
0
LINE
8
AISLE
10
${x}
20
${y + h}
11
${x}
21
${y}
`;
    });
  }

  // Summary text
  const totalSpaces = layout.spaces?.length || outputs.totalSpaces || 0;
  const accessibleSpaces = outputs.accessibleSpaces || 0;
  const evSpaces = outputs.evSpaces || 0;
  
  entities += `0
TEXT
8
SUMMARY
10
${siteLength / 2}
20
-80
40
30
1
Parking Layout: ${totalSpaces} Total | ${accessibleSpaces} ADA | ${evSpaces} EV
`;

  const layers = ['SITE_BOUNDARY', 'PARKING_SPACE', 'ACCESSIBLE_SPACE', 'EV_SPACE', 'COMPACT_SPACE', 'AISLE', 'SUMMARY'];
  return generateDXFHeader(layers) + entities + generateDXFFooter();
}

function generateColumnDXF(inputs: any, outputs: any): string {
  const width = outputs.width || inputs.width || 400;
  const depth = outputs.depth || inputs.depth || 400;
  const cover = inputs.cover || 40;
  const mainBars = outputs.mainBars || '8Ø20';
  const ties = outputs.ties || 'Ø10@200';

  let entities = '';

  // Column outline (rectangle)
  entities += drawRectangle(0, 0, width, depth, 'OUTLINE');

  // Inner cover line (dashed in actual CAD)
  entities += drawRectangle(cover, cover, width - 2 * cover, depth - 2 * cover, 'REINFORCEMENT');

  // Dimension text
  entities += drawText(width / 2, -30, `${width} mm`, 12, 'DIMENSIONS');
  entities += drawText(width + 30, depth / 2, `${depth} mm`, 12, 'DIMENSIONS');

  // Reinforcement annotation
  entities += drawText(width / 2, depth + 40, `Main: ${mainBars}`, 10, 'REINFORCEMENT');
  entities += drawText(width / 2, depth + 60, `Ties: ${ties}`, 10, 'STIRRUPS');

  // Title
  entities += drawText(width / 2, -60, 'COLUMN CROSS-SECTION', 14, 'TITLE_BLOCK');

  const layers = ['OUTLINE', 'DIMENSIONS', 'REINFORCEMENT', 'STIRRUPS', 'TITLE_BLOCK'];
  return generateDXFHeader(layers) + entities + generateDXFFooter();
}

function generateSlabDXF(inputs: any, outputs: any): string {
  const longSpan = (inputs.longSpan || 6) * 1000;
  const shortSpan = (inputs.shortSpan || 4) * 1000;
  const thickness = outputs.thickness || 200;
  const bottomBarLong = outputs.bottomBarLong || 'Ø12@150';
  const bottomBarShort = outputs.bottomBarShort || 'Ø10@200';

  let entities = '';

  // Slab outline in plan view
  entities += drawRectangle(0, 0, longSpan, shortSpan, 'OUTLINE');

  // Grid lines to represent reinforcement direction
  const spacing = 500; // Symbolic spacing
  for (let x = spacing; x < longSpan; x += spacing) {
    entities += drawLine(x, 0, x, shortSpan, 'REINFORCEMENT');
  }
  for (let y = spacing; y < shortSpan; y += spacing) {
    entities += drawLine(0, y, longSpan, y, 'REINFORCEMENT');
  }

  // Dimension text
  entities += drawText(longSpan / 2, -50, `${longSpan / 1000}m (Long Span)`, 20, 'DIMENSIONS');
  entities += drawText(longSpan + 50, shortSpan / 2, `${shortSpan / 1000}m (Short Span)`, 20, 'DIMENSIONS');

  // Reinforcement annotation
  entities += drawText(longSpan / 2, shortSpan + 80, `Bottom Long: ${bottomBarLong}`, 16, 'TEXT');
  entities += drawText(longSpan / 2, shortSpan + 120, `Bottom Short: ${bottomBarShort}`, 16, 'TEXT');

  // Title
  entities += drawText(longSpan / 2, -120, 'SLAB REINFORCEMENT PLAN', 24, 'TITLE_BLOCK');

  const layers = ['OUTLINE', 'DIMENSIONS', 'REINFORCEMENT', 'TEXT', 'TITLE_BLOCK'];
  return generateDXFHeader(layers) + entities + generateDXFFooter();
}

function generateRetainingWallDXF(inputs: any, outputs: any): string {
  const wallHeight = (inputs.wallHeight || 3) * 1000;
  const stemThicknessTop = outputs.stemThicknessTop || 300;
  const stemThicknessBottom = outputs.stemThicknessBottom || 500;
  const baseWidth = outputs.baseWidth || 2500;
  const baseThickness = outputs.baseThickness || 400;
  const toeWidth = outputs.toeWidth || 600;

  let entities = '';

  // Base (footing)
  entities += drawRectangle(0, 0, baseWidth, baseThickness, 'OUTLINE');

  // Stem (tapered)
  const heelWidth = baseWidth - toeWidth - stemThicknessBottom;
  const stemStartX = toeWidth;
  
  // Stem left edge (vertical from base to top)
  entities += drawLine(stemStartX, baseThickness, stemStartX + (stemThicknessBottom - stemThicknessTop) / 2, baseThickness + wallHeight, 'OUTLINE');
  
  // Stem right edge (vertical from base to top)
  entities += drawLine(stemStartX + stemThicknessBottom, baseThickness, stemStartX + (stemThicknessBottom + stemThicknessTop) / 2, baseThickness + wallHeight, 'OUTLINE');
  
  // Stem top
  entities += drawLine(
    stemStartX + (stemThicknessBottom - stemThicknessTop) / 2, 
    baseThickness + wallHeight, 
    stemStartX + (stemThicknessBottom + stemThicknessTop) / 2, 
    baseThickness + wallHeight, 
    'OUTLINE'
  );

  // Dimension annotations
  entities += drawText(baseWidth / 2, -50, `Base: ${baseWidth}mm`, 16, 'DIMENSIONS');
  entities += drawText(-80, baseThickness + wallHeight / 2, `H: ${wallHeight / 1000}m`, 16, 'DIMENSIONS');
  entities += drawText(baseWidth / 2, baseThickness + wallHeight + 50, `Stem: ${stemThicknessTop}-${stemThicknessBottom}mm`, 14, 'DIMENSIONS');

  // Title
  entities += drawText(baseWidth / 2, -120, 'RETAINING WALL SECTION', 20, 'TITLE_BLOCK');

  const layers = ['OUTLINE', 'DIMENSIONS', 'REINFORCEMENT', 'TITLE_BLOCK'];
  return generateDXFHeader(layers) + entities + generateDXFFooter();
}

// Helper functions for drawing primitives
function drawLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return `0
LINE
8
${layer}
10
${x1}
20
${y1}
11
${x2}
21
${y2}
`;
}

function drawRectangle(x: number, y: number, width: number, height: number, layer: string): string {
  return drawLine(x, y, x + width, y, layer) +
         drawLine(x + width, y, x + width, y + height, layer) +
         drawLine(x + width, y + height, x, y + height, layer) +
         drawLine(x, y + height, x, y, layer);
}

function drawText(x: number, y: number, text: string, height: number, layer: string): string {
  return `0
TEXT
8
${layer}
10
${x}
20
${y}
40
${height}
1
${text}
`;
}
