/**
 * AYN Prediction Graph Engine — v1
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspired by graphify's pipeline:
 *   extract() → build_graph() → cluster() → analyze() → report()
 *
 * Applied to AYN world predictions:
 *
 *  1. EXTRACT — Load all world predictions, extract nodes (predictions)
 *     and edges (shared tags, drivers, regions, conflicting signals)
 *
 *  2. BUILD GRAPH — Connect predictions that share drivers/tags/regions.
 *     Label each edge with EXTRACTED / INFERRED / AMBIGUOUS confidence
 *     (graphify's confidence system):
 *       EXTRACTED  = explicit shared tag or region match
 *       INFERRED   = same domain + overlapping key_drivers keywords
 *       AMBIGUOUS  = conflict_signals overlap (contradictory predictions)
 *
 *  3. CLUSTER — Leiden-style community detection via greedy modularity.
 *     Groups predictions into coherent topic communities.
 *     Assigns a canonical domain from the taxonomy table.
 *     Computes cohesion score (graphify metric: internal/total edges).
 *
 *  4. ANALYZE — Find:
 *     - God nodes (highest degree = most connected predictions)
 *     - Bridge nodes (predictions that cross community boundaries)
 *     - Surprising connections (cross-domain, high surprise_score)
 *     - Confidence label per prediction (EXTRACTED/INFERRED/AMBIGUOUS)
 *
 *  5. UPDATE — Write clusters, edges, memberships back to DB.
 *     Update signal_quality on ayn_world_predictions from hardcoded 50
 *     to a real computed score based on centrality + confidence.
 *
 * Triggered by: POST /ayn-prediction-graph (from cron or admin panel)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders as getCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── DOMAIN NORMALIZER ────────────────────────────────────────────────────────
// Maps the 64 chaotic domain strings → 10 canonical domains (graphify taxonomy)
const DOMAIN_MAP: Record<string, string> = {
  // Geopolitics
  'geopolitics': 'geopolitics', 'geopolitical': 'geopolitics',
  'geopolitical flashpoint': 'geopolitics', 'fragile institution': 'geopolitics',
  'foreign policy': 'geopolitics', 'diplomacy': 'geopolitics',
  'political risk': 'geopolitics', 'quiet social/political shift': 'society',

  // Conflicts
  'conflicts': 'conflicts', 'conflict': 'conflicts', 'war': 'conflicts',
  'security': 'conflicts', 'military': 'conflicts',

  // Economy
  'economy': 'economy', 'Economy': 'economy', 'macro': 'economy',
  'financial risk': 'economy', 'fiscal': 'economy', 'monetary': 'economy',
  'trade': 'economy', 'inflation': 'economy', 'debt': 'economy',
  'business': 'economy', 'Business model import threat to MENA': 'economy',
  'Underserved market gap': 'opportunities', 'Underrated market': 'opportunities',
  'Gulf as business hub': 'opportunities', 'Supply chain reshaping': 'economy',

  // Markets
  'markets': 'markets', 'finance': 'markets', 'investment': 'markets',
  'commodities': 'markets', 'currency': 'markets', 'stocks': 'markets',

  // Technology
  'technology': 'technology', 'tech': 'technology', 'ai': 'technology',
  'digital': 'technology', 'cyber': 'technology', 'innovation': 'technology',
  'technology risk': 'technology', 'AI-restructured industry': 'technology',

  // Energy
  'energy': 'energy', 'oil': 'energy', 'gas': 'energy',
  'climate': 'energy', 'resources': 'energy',

  // Society
  'society': 'society', 'social': 'society', 'culture': 'society',
  'demographic time bomb': 'demographics', 'demographics': 'demographics',
  'labor': 'society', 'health': 'society', 'education': 'society',

  // Warnings
  'warnings': 'warnings', 'warning': 'warnings', 'risk': 'warnings',
  'crisis': 'warnings', 'collapse': 'warnings', 'alert': 'warnings',

  // Regions (catch-all for region-focused predictions)
  'regions': 'geopolitics',

  // Opportunities
  'opportunities': 'opportunities', 'opportunity': 'opportunities',
  'the \'obvious\' in 10 years': 'opportunities',
};

function normalizeDomain(raw: string): string {
  if (!raw) return 'geopolitics';
  const lower = raw.toLowerCase().trim();
  return DOMAIN_MAP[raw] || DOMAIN_MAP[lower] || 'geopolitics';
}

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Prediction {
  id: string;
  domain: string;
  region: string;
  title: string;
  confidence: number;
  key_drivers: string[];
  tags: string[];
  conflict_signals: string[];
  horizon: string;
  created_at: string;
}

interface GraphNode {
  id: string;
  prediction: Prediction;
  canonicalDomain: string;
  degree: number;
  community: number;
  confidenceLabel: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  centralityScore: number;
}

interface GraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
  confidenceLabel: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  surpriseScore: number;
  why: string;
  sharedSignals: string[];
}

// ─── STEP 1: EXTRACT ─────────────────────────────────────────────────────────
// Build normalized node list from predictions
function extractNodes(predictions: Prediction[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  for (const p of predictions) {
    nodes.set(p.id, {
      id: p.id,
      prediction: p,
      canonicalDomain: normalizeDomain(p.domain),
      degree: 0,
      community: -1,
      confidenceLabel: 'INFERRED', // default, refined in analyze step
      centralityScore: 0,
    });
  }
  return nodes;
}

// ─── STEP 2: BUILD GRAPH ─────────────────────────────────────────────────────
// Connect predictions that share tags, drivers, or regions
// Label edges with EXTRACTED / INFERRED / AMBIGUOUS (graphify confidence system)
function buildEdges(nodes: Map<string, GraphNode>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const nodeList = Array.from(nodes.values());
  const edgeSet = new Set<string>(); // prevent duplicates

  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      const a = nodeList[i];
      const b = nodeList[j];
      const key = [a.id, b.id].sort().join('|');
      if (edgeSet.has(key)) continue;

      const pa = a.prediction;
      const pb = b.prediction;

      const tagsA = new Set((pa.tags || []).map((t: string) => t.toLowerCase()));
      const tagsB = new Set((pb.tags || []).map((t: string) => t.toLowerCase()));
      const driversA = (pa.key_drivers || []).join(' ').toLowerCase();
      const driversB = (pb.key_drivers || []).join(' ').toLowerCase();
      const conflictsA = new Set((pa.conflict_signals || []).map((s: string) => s.toLowerCase()));
      const conflictsB = new Set((pb.conflict_signals || []).map((s: string) => s.toLowerCase()));

      // Shared tags — EXTRACTED (explicit)
      const sharedTags = [...tagsA].filter(t => tagsB.has(t));
      if (sharedTags.length >= 2) {
        edgeSet.add(key);
        const surprise = computeSurpriseScore(a, b, 'EXTRACTED', sharedTags.length);
        edges.push({
          sourceId: a.id, targetId: b.id,
          relation: 'shares_driver',
          confidenceLabel: 'EXTRACTED',
          surpriseScore: surprise.score,
          why: surprise.why,
          sharedSignals: sharedTags,
        });
        continue;
      }

      // Conflicting signals — AMBIGUOUS (contradictory)
      const sharedConflicts = [...conflictsA].filter(s => conflictsB.has(s));
      if (sharedConflicts.length >= 1) {
        edgeSet.add(key);
        edges.push({
          sourceId: a.id, targetId: b.id,
          relation: 'conflicts_with',
          confidenceLabel: 'AMBIGUOUS',
          surpriseScore: 7 + Math.min(sharedConflicts.length, 3),
          why: `Both predictions have conflicting signals: ${sharedConflicts.slice(0, 2).join(', ')}`,
          sharedSignals: sharedConflicts,
        });
        continue;
      }

      // Same region — EXTRACTED
      if (pa.region && pb.region &&
          pa.region.toLowerCase() === pb.region.toLowerCase() &&
          pa.region.toLowerCase() !== 'global') {
        edgeSet.add(key);
        const crossDomain = a.canonicalDomain !== b.canonicalDomain;
        const surprise = crossDomain ? 6 : 2;
        edges.push({
          sourceId: a.id, targetId: b.id,
          relation: 'shares_region',
          confidenceLabel: 'EXTRACTED',
          surpriseScore: surprise,
          why: crossDomain
            ? `Same region (${pa.region}) but different domains: ${a.canonicalDomain} ↔ ${b.canonicalDomain} — cross-domain connection`
            : `Both predict outcomes in ${pa.region}`,
          sharedSignals: [pa.region],
        });
        continue;
      }

      // Same canonical domain + overlapping driver keywords — INFERRED
      if (a.canonicalDomain === b.canonicalDomain) {
        const keywords = ['oil', 'gold', 'copper', 'usd', 'fed', 'inflation',
                          'china', 'usa', 'russia', 'iran', 'tariff', 'ai', 'bitcoin'];
        const shared = keywords.filter(k => driversA.includes(k) && driversB.includes(k));
        if (shared.length >= 2) {
          edgeSet.add(key);
          edges.push({
            sourceId: a.id, targetId: b.id,
            relation: 'shares_driver',
            confidenceLabel: 'INFERRED',
            surpriseScore: 3,
            why: `Both reference macro drivers: ${shared.slice(0, 3).join(', ')}`,
            sharedSignals: shared,
          });
        }
      }

      // Cross-domain same shared tag (1 tag) — surprising INFERRED
      if (a.canonicalDomain !== b.canonicalDomain && sharedTags.length === 1) {
        edgeSet.add(key);
        edges.push({
          sourceId: a.id, targetId: b.id,
          relation: 'semantically_similar',
          confidenceLabel: 'INFERRED',
          surpriseScore: 6,
          why: `Cross-domain connection via shared tag "${sharedTags[0]}" — ${a.canonicalDomain} ↔ ${b.canonicalDomain}`,
          sharedSignals: sharedTags,
        });
      }
    }
  }

  return edges;
}

// ─── SURPRISE SCORING ─────────────────────────────────────────────────────────
// Adapted from graphify's _surprise_score() function
function computeSurpriseScore(
  a: GraphNode, b: GraphNode,
  confidence: string,
  sharedCount: number
): { score: number; why: string } {
  let score = 0;
  const reasons: string[] = [];

  // Confidence weight (graphify: AMBIGUOUS > INFERRED > EXTRACTED)
  const confBonus: Record<string, number> = { AMBIGUOUS: 3, INFERRED: 2, EXTRACTED: 1 };
  score += confBonus[confidence] || 1;

  // Cross-domain bonus (graphify: cross file-type = +2)
  if (a.canonicalDomain !== b.canonicalDomain) {
    score += 2;
    reasons.push(`crosses domains (${a.canonicalDomain} ↔ ${b.canonicalDomain})`);
  }

  // Cross-region bonus
  const regionA = a.prediction.region?.toLowerCase();
  const regionB = b.prediction.region?.toLowerCase();
  if (regionA && regionB && regionA !== regionB &&
      regionA !== 'global' && regionB !== 'global') {
    score += 1;
    reasons.push(`different regions (${regionA} ↔ ${regionB})`);
  }

  // Shared signal multiplier (more shared = more connected = less surprising)
  score = Math.max(1, score - Math.floor(sharedCount / 3));

  return {
    score: Math.min(10, score),
    why: reasons.length > 0
      ? `Shared signals (${sharedCount}); ${reasons.join('; ')}`
      : `${sharedCount} explicit shared signal${sharedCount > 1 ? 's' : ''}`,
  };
}

// ─── STEP 3: CLUSTER ─────────────────────────────────────────────────────────
// Greedy modularity clustering (Louvain-inspired, no external lib needed in Deno)
// Groups predictions into communities by canonical domain + connectivity
function clusterNodes(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[]
): Map<string, GraphNode> {
  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const node of nodes.keys()) adj.set(node, new Set());
  for (const e of edges) {
    adj.get(e.sourceId)?.add(e.targetId);
    adj.get(e.targetId)?.add(e.sourceId);
    // Update degree
    const src = nodes.get(e.sourceId);
    const tgt = nodes.get(e.targetId);
    if (src) src.degree++;
    if (tgt) tgt.degree++;
  }

  // Phase 1: seed communities by canonical domain
  const domainCommunities = new Map<string, number>();
  let nextCommunity = 0;
  for (const node of nodes.values()) {
    if (!domainCommunities.has(node.canonicalDomain)) {
      domainCommunities.set(node.canonicalDomain, nextCommunity++);
    }
    node.community = domainCommunities.get(node.canonicalDomain)!;
  }

  // Phase 2: refine — if a node has more edges to a neighbor community, move it
  // (single pass of Louvain-style local moving)
  let changed = true;
  let passes = 0;
  while (changed && passes < 5) {
    changed = false;
    passes++;
    for (const [nodeId, node] of nodes) {
      const neighbors = adj.get(nodeId) || new Set();
      if (neighbors.size === 0) continue;

      // Count edges to each community
      const communityEdges = new Map<number, number>();
      for (const neighborId of neighbors) {
        const neighborComm = nodes.get(neighborId)?.community ?? -1;
        communityEdges.set(neighborComm, (communityEdges.get(neighborComm) || 0) + 1);
      }

      // Find best community
      let bestComm = node.community;
      let bestCount = communityEdges.get(node.community) || 0;
      for (const [comm, count] of communityEdges) {
        if (count > bestCount) {
          bestCount = count;
          bestComm = comm;
        }
      }

      if (bestComm !== node.community) {
        node.community = bestComm;
        changed = true;
      }
    }
  }

  // Phase 3: Assign confidence labels (graphify-style)
  // EXTRACTED = well-connected within community (degree >= 3)
  // INFERRED  = moderately connected (degree 1-2)
  // AMBIGUOUS = isolated or conflicts with community (degree 0, or cross-community edges)
  for (const [nodeId, node] of nodes) {
    const neighbors = adj.get(nodeId) || new Set();
    const internalEdges = [...neighbors].filter(
      nId => nodes.get(nId)?.community === node.community
    ).length;

    const hasConflictEdge = edges.some(e =>
      (e.sourceId === nodeId || e.targetId === nodeId) &&
      e.relation === 'conflicts_with'
    );

    if (hasConflictEdge) {
      node.confidenceLabel = 'AMBIGUOUS';
    } else if (internalEdges >= 3) {
      node.confidenceLabel = 'EXTRACTED';
    } else if (internalEdges >= 1) {
      node.confidenceLabel = 'INFERRED';
    } else {
      node.confidenceLabel = 'AMBIGUOUS';
    }
  }

  return nodes;
}

// ─── STEP 4: ANALYZE ─────────────────────────────────────────────────────────
// Compute centrality, find bridge nodes, build cluster summaries
function analyzeGraph(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[]
): {
  communities: Map<number, GraphNode[]>;
  bridgeNodes: Set<string>;
  topSurprises: GraphEdge[];
} {
  // Group by community
  const communities = new Map<number, GraphNode[]>();
  for (const node of nodes.values()) {
    if (!communities.has(node.community)) communities.set(node.community, []);
    communities.get(node.community)!.push(node);
  }

  // Find bridge nodes (graphify: high betweenness = connects multiple communities)
  const bridgeNodes = new Set<string>();
  const nodeCommunities = new Map<string, number>();
  for (const [id, node] of nodes) nodeCommunities.set(id, node.community);

  for (const edge of edges) {
    const srcComm = nodeCommunities.get(edge.sourceId);
    const tgtComm = nodeCommunities.get(edge.targetId);
    if (srcComm !== undefined && tgtComm !== undefined && srcComm !== tgtComm) {
      bridgeNodes.add(edge.sourceId);
      bridgeNodes.add(edge.targetId);
      // Mark as bridge
      const srcNode = nodes.get(edge.sourceId);
      const tgtNode = nodes.get(edge.targetId);
      // centrality boost for bridge nodes
      if (srcNode) srcNode.centralityScore += 0.3;
      if (tgtNode) tgtNode.centralityScore += 0.3;
    }
  }

  // Centrality: normalize by degree within community
  for (const [commId, members] of communities) {
    const maxDegree = Math.max(...members.map(n => n.degree), 1);
    for (const node of members) {
      node.centralityScore += node.degree / maxDegree;
      node.centralityScore = Math.min(1, node.centralityScore);
    }
  }

  // Top surprising cross-domain edges (graphify: surprising_connections)
  const topSurprises = edges
    .filter(e => e.surpriseScore >= 5)
    .sort((a, b) => b.surpriseScore - a.surpriseScore)
    .slice(0, 50);

  return { communities, bridgeNodes, topSurprises };
}

// ─── COMPUTE SIGNAL QUALITY ───────────────────────────────────────────────────
// Replaces the hardcoded signal_quality = 50
// Based on: centrality + confidence label + prediction confidence + surprise score
function computeSignalQuality(
  node: GraphNode,
  isBridge: boolean,
  maxEdgeSurprise: number,
): number {
  const confidenceBonus: Record<string, number> = {
    EXTRACTED: 20, INFERRED: 10, AMBIGUOUS: -5
  };
  const base = node.prediction.confidence || 50;
  const centralityBonus = Math.round(node.centralityScore * 15);
  const confBonus = confidenceBonus[node.confidenceLabel] || 0;
  const bridgeBonus = isBridge ? 10 : 0;
  const surpriseBonus = Math.round(maxEdgeSurprise * 2);

  return Math.min(100, Math.max(10, base + centralityBonus + confBonus + bridgeBonus + surpriseBonus));
}

// ─── CLUSTER LABEL GENERATOR ──────────────────────────────────────────────────
function generateClusterLabel(domain: string, topTags: string[], topRegions: string[]): string {
  const domainLabel: Record<string, string> = {
    geopolitics: 'Geopolitical', conflicts: 'Conflict', economy: 'Economic',
    technology: 'Technology', markets: 'Market', energy: 'Energy',
    society: 'Social', demographics: 'Demographic',
    warnings: 'Risk Alert', opportunities: 'Opportunity',
  };
  const prefix = domainLabel[domain] || 'Intelligence';
  const focus = topRegions[0] || topTags[0] || 'Global';
  return `${prefix} — ${focus}`;
}

// ─── COHESION SCORE ───────────────────────────────────────────────────────────
// graphify: internal_edges / total_possible_edges for the community
function computeCohesion(members: GraphNode[], edges: GraphEdge[]): number {
  if (members.length < 2) return 1;
  const memberIds = new Set(members.map(m => m.id));
  const internalEdges = edges.filter(
    e => memberIds.has(e.sourceId) && memberIds.has(e.targetId)
  ).length;
  const maxPossible = (members.length * (members.length - 1)) / 2;
  return Math.round((internalEdges / maxPossible) * 1000) / 1000;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const runId = `run_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15)}`;
  const startTime = Date.now();

  // Log run start
  await supabase.from('ayn_graph_runs').insert({
    id: runId, status: 'running', predictions_in: 0
  });

  try {
    // ── LOAD PREDICTIONS ────────────────────────────────────────────────────
    const { data: predictions, error: loadError } = await supabase
      .from('ayn_world_predictions')
      .select('id, domain, region, title, confidence, key_drivers, tags, conflict_signals, horizon, created_at')
      .order('created_at', { ascending: false })
      .limit(500); // process most recent 500

    if (loadError) throw loadError;
    if (!predictions || predictions.length === 0) {
      return new Response(JSON.stringify({ error: 'No predictions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404
      });
    }

    console.log(`[${runId}] Loaded ${predictions.length} predictions`);

    // ── STEP 1: EXTRACT ─────────────────────────────────────────────────────
    const nodes = extractNodes(predictions as Prediction[]);

    // ── STEP 2: BUILD GRAPH ─────────────────────────────────────────────────
    const edges = buildEdges(nodes);
    console.log(`[${runId}] Built ${edges.length} edges`);

    // ── STEP 3: CLUSTER ─────────────────────────────────────────────────────
    clusterNodes(nodes, edges);

    // ── STEP 4: ANALYZE ─────────────────────────────────────────────────────
    const { communities, bridgeNodes, topSurprises } = analyzeGraph(nodes, edges);
    console.log(`[${runId}] Found ${communities.size} communities, ${bridgeNodes.size} bridge nodes`);

    // ── STEP 5: WRITE TO DB ─────────────────────────────────────────────────

    // Clear old run data
    await supabase.from('ayn_prediction_graph_edges').delete().eq('run_id', runId);
    await supabase.from('ayn_prediction_cluster_members').delete()
      .in('cluster_id',
        (await supabase.from('ayn_prediction_clusters').select('id').eq('run_id', runId))
          .data?.map((r: {id: string}) => r.id) || []
      );
    await supabase.from('ayn_prediction_clusters').delete().eq('run_id', runId);

    const clusterDbIds = new Map<number, string>(); // community_id → db uuid

    // Write clusters
    for (const [commId, members] of communities) {
      if (members.length === 0) continue;

      const domainCounts = new Map<string, number>();
      const tagCounts = new Map<string, number>();
      const regionCounts = new Map<string, number>();
      const driverKeywords: string[] = [];

      for (const m of members) {
        const d = m.canonicalDomain;
        domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
        for (const tag of (m.prediction.tags || [])) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
        if (m.prediction.region) {
          regionCounts.set(m.prediction.region, (regionCounts.get(m.prediction.region) || 0) + 1);
        }
        driverKeywords.push(...(m.prediction.key_drivers || []));
      }

      const topDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'geopolitics';
      const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
      const topRegions = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

      // Find shared drivers (appear in 30%+ of predictions in cluster)
      const driverFreq = new Map<string, number>();
      for (const kw of driverKeywords) {
        const k = kw.toLowerCase();
        driverFreq.set(k, (driverFreq.get(k) || 0) + 1);
      }
      const sharedDrivers = [...driverFreq.entries()]
        .filter(([, count]) => count >= Math.max(2, members.length * 0.3))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0]);

      const cohesion = computeCohesion(members, edges);
      const bridgeCount = members.filter(m => bridgeNodes.has(m.id)).length;
      const bridgeFactor = bridgeCount / Math.max(members.length, 1);

      const clusterLabel = generateClusterLabel(topDomain, topTags, topRegions);

      const { data: clusterRow } = await supabase
        .from('ayn_prediction_clusters')
        .insert({
          label: clusterLabel,
          canonical_domain: topDomain,
          prediction_count: members.length,
          cohesion_score: cohesion,
          bridge_factor: Math.round(bridgeFactor * 1000) / 1000,
          top_tags: topTags,
          top_regions: topRegions,
          shared_drivers: sharedDrivers,
          run_id: runId,
        })
        .select('id')
        .single();

      if (clusterRow?.id) {
        clusterDbIds.set(commId, clusterRow.id);
      }
    }

    // Write memberships + update signal_quality
    const membershipInserts = [];
    const signalQualityUpdates: { id: string; signal_quality: number }[] = [];

    for (const [nodeId, node] of nodes) {
      const clusterDbId = clusterDbIds.get(node.community);
      if (!clusterDbId) continue;

      const isBridge = bridgeNodes.has(nodeId);
      const maxSurprise = Math.max(0, ...edges
        .filter(e => e.sourceId === nodeId || e.targetId === nodeId)
        .map(e => e.surpriseScore));

      const signalQuality = computeSignalQuality(node, isBridge, maxSurprise);

      membershipInserts.push({
        prediction_id: nodeId,
        cluster_id: clusterDbId,
        confidence_label: node.confidenceLabel,
        centrality_score: Math.round(node.centralityScore * 10000) / 10000,
        is_bridge: isBridge,
      });

      signalQualityUpdates.push({ id: nodeId, signal_quality: signalQuality });
    }

    // Batch insert memberships
    if (membershipInserts.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < membershipInserts.length; i += BATCH) {
        await supabase.from('ayn_prediction_cluster_members')
          .upsert(membershipInserts.slice(i, i + BATCH));
      }
    }

    // Batch update signal_quality (replace hardcoded 50s with real scores)
    for (const update of signalQualityUpdates) {
      await supabase.from('ayn_world_predictions')
        .update({ signal_quality: update.signal_quality })
        .eq('id', update.id);
    }

    // Write surprising edges
    if (topSurprises.length > 0) {
      const edgeInserts = topSurprises.map(e => ({
        source_id: e.sourceId,
        target_id: e.targetId,
        relation: e.relation,
        confidence_label: e.confidenceLabel,
        surprise_score: e.surpriseScore,
        why: e.why,
        shared_signals: e.sharedSignals,
        run_id: runId,
      }));
      await supabase.from('ayn_prediction_graph_edges').insert(edgeInserts);
    }

    // Update run log
    const duration = Date.now() - startTime;
    await supabase.from('ayn_graph_runs').update({
      status: 'complete',
      predictions_in: predictions.length,
      clusters_out: communities.size,
      edges_out: edges.length,
      bridge_nodes: bridgeNodes.size,
      duration_ms: duration,
      notes: `Signal quality updated for ${signalQualityUpdates.length} predictions. Top surprise score: ${topSurprises[0]?.surpriseScore ?? 0}`
    }).eq('id', runId);

    // ── SUMMARY RESPONSE ────────────────────────────────────────────────────
    const clusterSummary = [];
    for (const [commId, members] of communities) {
      const topDomain = members[0]?.canonicalDomain;
      const extracted = members.filter(m => m.confidenceLabel === 'EXTRACTED').length;
      const inferred = members.filter(m => m.confidenceLabel === 'INFERRED').length;
      const ambiguous = members.filter(m => m.confidenceLabel === 'AMBIGUOUS').length;
      clusterSummary.push({
        community: commId,
        domain: topDomain,
        members: members.length,
        extracted, inferred, ambiguous,
        cohesion: computeCohesion(members, edges),
        bridges: members.filter(m => bridgeNodes.has(m.id)).length,
      });
    }

    return new Response(JSON.stringify({
      runId,
      status: 'complete',
      durationMs: duration,
      summary: {
        predictionsProcessed: predictions.length,
        clustersFound: communities.size,
        edgesBuilt: edges.length,
        bridgeNodes: bridgeNodes.size,
        surprisingConnections: topSurprises.length,
        signalQualitiesUpdated: signalQualityUpdates.length,
      },
      clusters: clusterSummary.sort((a, b) => b.members - a.members),
      topSurprises: topSurprises.slice(0, 5).map(e => ({
        relation: e.relation,
        confidence: e.confidenceLabel,
        score: e.surpriseScore,
        why: e.why,
        sharedSignals: e.sharedSignals.slice(0, 3),
      })),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error(`[${runId}] Error:`, err);
    await supabase.from('ayn_graph_runs').update({
      status: 'failed',
      notes: String(err),
      duration_ms: Date.now() - startTime,
    }).eq('id', runId);

    return new Response(JSON.stringify({ error: String(err), runId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
