"""
smart_sampler.py — Selects the right agents for a simulation.

Given an event + report_type + user_target, returns a sampled
set of 30-60 agents across tiers and layers.

Cost model:
  quick    → 30 agents, ~42 LLM calls, ~90s
  standard → 50 agents, ~70 calls, ~3min
  deep     → 80 agents, ~112 calls, ~6min
"""

from agents.agent_configs import (
    AGENT_CONFIGS, get_agents_by_tier, get_agents_by_category,
    get_agents_by_region, get_personas_by_filter
)

# ── Report type → which tiers/categories to emphasize ─────────────────────

REPORT_TYPE_WEIGHTS = {
    "government": {
        "tier1_categories": ["government","central_bank"],
        "tier2_categories": ["religion","media","social_class"],
        "persona_focus": ["political_lean"],
        "layer_emphasis": [1,2,5,6],
        "description": "Government & geopolitical intelligence report"
    },
    "marketing": {
        "tier1_categories": ["company","stock_market"],
        "tier2_categories": ["media","social_class"],
        "persona_focus": ["income_level","age","region"],
        "layer_emphasis": [3,4,6,7],
        "description": "Marketing & consumer behavior report"
    },
    "investment": {
        "tier1_categories": ["stock_market","central_bank","bank"],
        "tier2_categories": ["media"],
        "persona_focus": ["income_level"],
        "layer_emphasis": [1,2,3,7],
        "description": "Investment & financial analysis report"
    },
    "social": {
        "tier1_categories": ["government"],
        "tier2_categories": ["religion","social_class","media"],
        "persona_focus": ["ethnicity","religion","region"],
        "layer_emphasis": [4,5,6,7],
        "description": "Social impact & community reaction report"
    },
    "full": {
        "tier1_categories": ["government","central_bank","stock_market","bank","company","media"],
        "tier2_categories": ["religion","social_class","media"],
        "persona_focus": ["region","income_level"],
        "layer_emphasis": [1,2,3,4,5,6,7],
        "description": "Full world simulation report"
    }
}

# ── Event type → which agents are most relevant ────────────────────────────

EVENT_AGENT_RELEVANCE = {
    "gold_surge":    {"tier1_priority":["gold_market","fed","ecb","jpmorgan","blackrock","goldman","hedge_funds","saudi_cb"],"tier2_priority":["global_upper_class","us_working_class","chinese_urban_middle"]},
    "oil_shock":     {"tier1_priority":["oil_market","saudi","russia","iran","aramco_energy","fed","nigeria"],"tier2_priority":["arab_street","gulf_expat_workers","se_asian_factory","european_working_class"]},
    "rate_hike":     {"tier1_priority":["fed","ecb","pboc","boj","sp500","jpmorgan","blackrock","goldman","hedge_funds"],"tier2_priority":["us_working_class","european_working_class","global_upper_class","chinese_urban_middle"]},
    "geopolitical":  {"tier1_priority":["usa","china","russia","eu","israel","iran","saudi","defense_sector","cnn_western_media","aljazeera_media"],"tier2_priority":["arab_street","sunni_islam","evangelical_christian","russian_working_class"]},
    "trade_war":     {"tier1_priority":["usa","china","eu","japan","india","sp500","big_tech","aramco_energy","shipping_market"],"tier2_priority":["se_asian_factory","chinese_urban_middle","us_working_class","indian_tech_class"]},
    "ai_disruption": {"tier1_priority":["big_tech","sp500","fed","usa","china","eu"],"tier2_priority":["indian_tech_class","us_working_class","influencer_economy","global_upper_class"]},
    "food_crisis":   {"tier1_priority":["wheat_market","usa","russia","eu","india","nigeria","brazil"],"tier2_priority":["latin_american_poor","african_youth","arab_street","se_asian_factory","gulf_expat_workers"]},
    "climate":       {"tier1_priority":["eu","usa","india","china","big_tech","aramco_energy"],"tier2_priority":["african_youth","latin_american_poor","se_asian_factory","secular_movement"]},
    "crypto":        {"tier1_priority":["crypto_mkt","fed","ecb","sp500","big_tech","hedge_funds"],"tier2_priority":["global_upper_class","us_working_class","african_youth","indian_tech_class"]},
    "general":       {"tier1_priority":list(get_agents_by_tier(1))[:12],"tier2_priority":list(get_agents_by_tier(2))[:8]},
}


def sample_agents(
    event: str,
    signal_type: str,
    report_type: str = "full",
    depth: str = "standard",
    user_target: dict = None,
) -> dict:
    """
    Returns layered agent lists for simulation.

    Args:
        event: The event text
        signal_type: From classify_event()
        report_type: government|marketing|investment|social|full
        depth: quick(30)|standard(50)|deep(80)
        user_target: {
            region: str,
            religion: str,
            ethnicity: str,
            income_level: str,
            age_min: int,
            age_max: int,
            gender: str,
            specific_agents: [str]  # manual picks
        }

    Returns:
        {
            layer1_economic: [...],
            layer2_institutional: [...],
            layer3_elite: [...],
            layer4_narrative: [...],
            layer5_community: [...],
            layer6_human: [...],
            layer7_synthesis: [...],
            total_agents: int,
            report_type_description: str,
        }
    """
    depth_limits = {"quick": 30, "standard": 50, "deep": 80}
    total_limit = depth_limits.get(depth, 50)

    rt = REPORT_TYPE_WEIGHTS.get(report_type, REPORT_TYPE_WEIGHTS["full"])
    er = EVENT_AGENT_RELEVANCE.get(signal_type, EVENT_AGENT_RELEVANCE["general"])

    # ── Build prioritized Tier 1 agents ────────────────────────────────────
    t1_priority = er["tier1_priority"]
    t1_report_cats = rt["tier1_categories"]

    # Start with event-relevant T1 agents
    tier1_pool = list(t1_priority)

    # Add T1 agents matching report type categories
    for cat in t1_report_cats:
        for aid in get_agents_by_category(cat):
            if aid not in tier1_pool:
                tier1_pool.append(aid)

    # Fill remaining T1 slots
    for aid in get_agents_by_tier(1):
        if aid not in tier1_pool:
            tier1_pool.append(aid)

    # ── Build Tier 2 community agents ───────────────────────────────────────
    t2_priority = er["tier2_priority"]
    t2_report_cats = rt["tier2_categories"]

    tier2_pool = list(t2_priority)
    for cat in t2_report_cats:
        for aid in get_agents_by_category(cat):
            if aid not in tier2_pool:
                tier2_pool.append(aid)
    for aid in get_agents_by_tier(2):
        if aid not in tier2_pool:
            tier2_pool.append(aid)

    # ── Build Tier 3 persona agents based on user target ────────────────────
    tier3_pool = []

    # If user specified targets, filter personas
    if user_target:
        specific = user_target.get("specific_agents", [])
        if specific:
            tier3_pool.extend([a for a in specific if a in AGENT_CONFIGS])

        # Filter by demographics
        filter_kwargs = {}
        for key in ["religion","ethnicity","income_level","region","age_min","age_max","gender"]:
            if user_target.get(key):
                filter_kwargs[key] = user_target[key]

        if filter_kwargs:
            filtered = get_personas_by_filter(**filter_kwargs)
            for aid in filtered:
                if aid not in tier3_pool:
                    tier3_pool.append(aid)

    # If no specific target, use region/event-relevant personas
    if not tier3_pool:
        # Get personas from event-relevant regions
        event_regions = _infer_regions_from_signal(signal_type)
        for region in event_regions:
            for aid in get_agents_by_region(region):
                cfg = AGENT_CONFIGS.get(aid, {})
                if cfg.get("tier") == 3 and aid not in tier3_pool:
                    tier3_pool.append(aid)

    # Fill remaining T3 slots from all personas
    for aid in get_agents_by_tier(3):
        if aid not in tier3_pool:
            tier3_pool.append(aid)

    # ── Allocate agents to layers within budget ─────────────────────────────
    layer_budgets = _get_layer_budgets(total_limit, rt["layer_emphasis"])

    layers = {
        "layer1_economic":      tier1_pool[:layer_budgets[1]],
        "layer2_institutional": tier1_pool[layer_budgets[1]:layer_budgets[1]+layer_budgets[2]],
        "layer3_elite":         (tier1_pool + tier2_pool)[:layer_budgets[3]],
        "layer4_narrative":     tier2_pool[:layer_budgets[4]],
        "layer5_community":     tier2_pool[:layer_budgets[5]],
        "layer6_human":         tier3_pool[:layer_budgets[6]],
        "layer7_synthesis":     (tier1_pool[:3] + tier2_pool[:2] + tier3_pool[:2])[:layer_budgets[7]],
    }

    # Deduplicate within each layer
    seen = set()
    for layer_key in layers:
        unique = []
        for aid in layers[layer_key]:
            if aid not in seen:
                unique.append(aid)
                seen.add(aid)
        layers[layer_key] = unique

    total = sum(len(v) for v in layers.values())
    layers["total_agents"] = total
    layers["report_type_description"] = rt["description"]
    layers["depth"] = depth

    print(f"  👥 Agent sample: {total} agents | {depth} depth | {report_type} report")
    for k,v in layers.items():
        if isinstance(v, list):
            print(f"     {k}: {len(v)} agents")

    return layers


def _infer_regions_from_signal(signal_type: str) -> list[str]:
    """Map signal type to most relevant regions for persona selection."""
    mapping = {
        "geopolitical": ["middle_east","eurasia","europe","north_america"],
        "oil_shock":    ["middle_east","sub_saharan_africa","southeast_asia","latin_america"],
        "gold_surge":   ["north_america","europe","east_asia","middle_east"],
        "trade_war":    ["east_asia","north_america","southeast_asia","south_asia"],
        "food_crisis":  ["sub_saharan_africa","south_asia","latin_america","middle_east"],
        "ai_disruption":["north_america","south_asia","east_asia","europe"],
        "crypto":       ["north_america","sub_saharan_africa","east_asia","south_asia"],
        "climate":      ["sub_saharan_africa","south_asia","latin_america","southeast_asia"],
        "rate_hike":    ["north_america","europe","east_asia","south_asia"],
    }
    return mapping.get(signal_type, ["north_america","europe","middle_east","east_asia"])


def _get_layer_budgets(total: int, emphasized_layers: list) -> dict:
    """Distribute agent budget across 7 layers."""
    # Base weights
    weights = {1:2, 2:2, 3:1.5, 4:1.5, 5:2, 6:3, 7:1}

    # Boost emphasized layers
    for layer in emphasized_layers:
        if layer in weights:
            weights[layer] *= 1.5

    total_weight = sum(weights.values())
    budgets = {}
    remaining = total
    for i in range(1, 8):
        if i == 7:
            budgets[i] = max(3, remaining)
        else:
            budgets[i] = max(2, int((weights[i] / total_weight) * total))
            remaining -= budgets[i]

    return budgets
