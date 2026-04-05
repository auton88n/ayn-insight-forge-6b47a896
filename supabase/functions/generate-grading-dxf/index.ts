import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

interface Point {
  id: string;
  x: number;
  y: number;
  z: number;
  fgl?: number;
  cutFill?: number;
}

function generateDXF(points: Point[], design: any, projectName: string): string {
  const layers = [
    { name: 'NGL_POINTS', color: 3 },      // Green
    { name: 'FGL_POINTS', color: 5 },      // Blue
    { name: 'CUT_AREAS', color: 1 },       // Red
    { name: 'FILL_AREAS', color: 4 },      // Cyan
    { name: 'ANNOTATIONS', color: 7 },     // White
    { name: 'CONTOURS_NGL', color: 3 },    // Green
    { name: 'CONTOURS_FGL', color: 5 },    // Blue
  ];

  let dxf = `0
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
6
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
70
${layers.length}
`;

  // Add layers
  for (const layer of layers) {
    dxf += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
CONTINUOUS
`;
  }

  dxf += `0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Add NGL points
  for (const point of points) {
    // Point marker
    dxf += `0
POINT
8
NGL_POINTS
10
${point.x}
20
${point.y}
30
${point.z}
`;

    // Point ID text
    dxf += `0
TEXT
8
ANNOTATIONS
10
${point.x + 1}
20
${point.y + 1}
30
${point.z}
40
0.5
1
${point.id}
`;

    // Elevation text
    dxf += `0
TEXT
8
NGL_POINTS
10
${point.x + 1}
20
${point.y - 0.5}
30
${point.z}
40
0.4
1
NGL: ${point.z.toFixed(2)}
`;
  }

  // Add FGL points if available
  for (const point of points) {
    if (point.fgl !== undefined) {
      dxf += `0
POINT
8
FGL_POINTS
10
${point.x}
20
${point.y}
30
${point.fgl}
`;

      dxf += `0
TEXT
8
FGL_POINTS
10
${point.x + 1}
20
${point.y - 1}
30
${point.fgl}
40
0.4
1
FGL: ${point.fgl.toFixed(2)}
`;

      // Cut/Fill annotation
      if (point.cutFill !== undefined) {
        const layer = point.cutFill > 0 ? 'CUT_AREAS' : 'FILL_AREAS';
        const label = point.cutFill > 0 ? 'CUT' : 'FILL';
        dxf += `0
TEXT
8
${layer}
10
${point.x + 1}
20
${point.y - 1.5}
30
${point.z}
40
0.35
1
${label}: ${Math.abs(point.cutFill).toFixed(2)}m
`;
      }
    }
  }

  // Add project info box
  const minX = Math.min(...points.map(p => p.x));
  const maxY = Math.max(...points.map(p => p.y));
  
  const infoLines = [
    `PROJECT: ${projectName}`,
    `DATE: ${new Date().toISOString().split('T')[0]}`,
    `POINTS: ${points.length}`,
    `DESIGN ELEV: ${design?.designElevation?.toFixed(2) || 'N/A'}m`,
    `CUT VOL: ${design?.totalCutVolume?.toFixed(0) || 'N/A'} m³`,
    `FILL VOL: ${design?.totalFillVolume?.toFixed(0) || 'N/A'} m³`,
  ];

  infoLines.forEach((line, i) => {
    dxf += `0
TEXT
8
ANNOTATIONS
10
${minX}
20
${maxY + 10 - i * 2}
30
0
40
1.0
1
${line}
`;
  });

  // Add simple contour lines (connect points at similar elevations)
  const sortedByZ = [...points].sort((a, b) => a.z - b.z);
  const contourInterval = 1; // 1m contours
  const minZ = Math.floor(sortedByZ[0].z);
  const maxZ = Math.ceil(sortedByZ[sortedByZ.length - 1].z);

  for (let elev = minZ; elev <= maxZ; elev += contourInterval) {
    const nearbyPoints = points.filter(p => Math.abs(p.z - elev) < contourInterval / 2);
    if (nearbyPoints.length >= 2) {
      // Sort by angle from centroid for proper ordering
      const cx = nearbyPoints.reduce((s, p) => s + p.x, 0) / nearbyPoints.length;
      const cy = nearbyPoints.reduce((s, p) => s + p.y, 0) / nearbyPoints.length;
      nearbyPoints.sort((a, b) => 
        Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
      );

      // Draw polyline for contour
      dxf += `0
LWPOLYLINE
8
CONTOURS_NGL
90
${nearbyPoints.length}
70
1
`;
      for (const p of nearbyPoints) {
        dxf += `10
${p.x}
20
${p.y}
`;
      }

      // Contour label
      if (nearbyPoints.length > 0) {
        dxf += `0
TEXT
8
CONTOURS_NGL
10
${nearbyPoints[0].x}
20
${nearbyPoints[0].y}
30
0
40
0.5
1
${elev.toFixed(1)}
`;
      }
    }
  }

  dxf += `0
ENDSEC
0
EOF`;

  return dxf;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { points, design, projectName } = await req.json();
    
    if (!points || points.length === 0) {
      throw new Error('No points provided');
    }

    console.log(`Generating DXF for ${points.length} points`);

    const dxfContent = generateDXF(points, design, projectName || 'Grading Project');

    return new Response(JSON.stringify({
      success: true,
      dxfContent,
      fileName: `${projectName || 'grading'}_design.dxf`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating DXF:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
