import type { MapPoint } from '@/components/dashboard/HeatMap2D';

/**
 * AYN GLOBAL INTELLIGENCE SEEDS — Updated March 29, 2026
 * Always-on baseline intelligence layer. Live OSINT augments at runtime.
 */
export const INTELLIGENCE_SEEDS: MapPoint[] = [

  // ─── ACTIVE CONFLICT ZONES ────────────────────────────────────────────────
  { id:'ukr',  coordinates:[32.0,49.0],  label:'UKRAINE', risk:'critical', category:'Conflict',
    detail:'Active war — Year 4. Russian forces pressing Donetsk axis. Drone exchanges daily. Trump-mediated ceasefire negotiations ongoing. Front line: ~1,000km.' },
  { id:'gza',  coordinates:[34.3,31.4],  label:'GAZA', risk:'critical', category:'Conflict',
    detail:'Active conflict — IDF ground operations in Rafah. Hostage negotiations via Qatar. 2.1M displaced. Humanitarian corridors intermittently open.' },
  { id:'yem',  coordinates:[44.2,15.4],  label:'YEMEN / RED SEA', risk:'critical', category:'Conflict',
    detail:'Houthi maritime attacks on Red Sea shipping continue. US/UK airstrikes on Hodeidah. Iran-supplied drone/missile supply chain intact.' },
  { id:'sdn',  coordinates:[30.2,15.5],  label:'SUDAN', risk:'critical', category:'Conflict',
    detail:'SAF vs RSF civil war — 18 months active. RSF controls Darfur/Khartoum outskirts. 10M+ displaced. Famine conditions expanding.' },
  { id:'drc',  coordinates:[29.2,1.5],   label:'EASTERN DRC', risk:'high', category:'Conflict',
    detail:'M23/Rwanda-backed advance — Goma fell Jan 2025. MONUSCO withdrawing. SADC forces engaged. Mineral-rich Kivu region contested.' },
  { id:'myn',  coordinates:[96.1,21.9],  label:'MYANMAR', risk:'high', category:'Conflict',
    detail:'CRPH resistance forces holding 65%+ territory. Junta retreating from Shan/Rakhine. China brokering. Currency collapse accelerating.' },
  { id:'hti',  coordinates:[-72.3,18.9], label:'HAITI', risk:'critical', category:'Conflict',
    detail:'Gang confederation controls ~85% Port-au-Prince. Kenya-led MSS mission struggling. State fragility: extreme.' },
  { id:'isr',  coordinates:[35.2,32.1],  label:'ISRAEL/IRAN', risk:'high', category:'Conflict',
    detail:'Iran nuclear program: 60% enrichment. Israel red-line pressure. US-Israel strike planning coordination. Hezbollah ceasefire fragile.' },
  { id:'twn',  coordinates:[121.0,23.7], label:'TAIWAN STRAIT', risk:'alert', category:'Conflict',
    detail:'PLA ADIZ incursions: avg 25/month. USS Theodore Roosevelt in Western Pacific. China-Taiwan economic ties strained.' },
  { id:'ksp',  coordinates:[27.5,42.9],  label:'BLACK SEA', risk:'high', category:'Conflict',
    detail:'Ukraine drone boats neutralized 30%+ Russian Black Sea Fleet. Grain corridor contested. Crimea bridge damaged Q1 2026.' },
  { id:'mli',  coordinates:[-2.0,17.6],  label:'SAHEL', risk:'high', category:'Conflict',
    detail:'Wagner/Africa Corps: Mali, Niger, Burkina Faso AOR. JNIM jihadist offensive. France expelled. Governance vacuum.' },
  { id:'som',  coordinates:[45.3,5.1],   label:'SOMALIA', risk:'high', category:'Conflict',
    detail:'Al-Shabaab controls ~40% territory. ATMIS withdrawal creating security vacuum. Drought compounding crisis.' },

  // ─── MARITIME CHOKEPOINTS ─────────────────────────────────────────────────
  { id:'suez', coordinates:[32.5,30.0],  label:'SUEZ CANAL', risk:'maritime' as any, category:'Maritime',
    detail:'Red Sea crisis: transits down 60%. Cape rerouting adds 14 days + $1M/voyage. Insurance surcharges 0.7-1% vessel value.' },
  { id:'horm', coordinates:[56.5,26.5],  label:'HORMUZ', risk:'maritime' as any, category:'Maritime',
    detail:'21M bbl/day oil transit — 20% global supply. Iran seizure operations active. US 5th Fleet: 2 carrier groups nearby.' },
  { id:'bbmd', coordinates:[43.4,12.5],  label:'BAB-EL-MANDEB', risk:'maritime' as any, category:'Maritime',
    detail:'Houthi anti-ship ballistic missiles active. EUNAVFOR ASPIDES escort: 28 vessels protected. 40% Red Sea traffic rerouted.' },
  { id:'malac',coordinates:[100.3,2.5],  label:'MALACCA STR.', risk:'maritime' as any, category:'Maritime',
    detail:'90,000+ vessels/year. 80% Asian energy imports. Piracy incidents up 18% YoY. Singapore-Malaysia coordination active.' },
  { id:'scs',  coordinates:[114.0,14.0], label:'S. CHINA SEA', risk:'maritime' as any, category:'Maritime',
    detail:'PRC coast guard water cannon vs Philippines resupply. Scarborough Shoal confrontations weekly. US-Philippines Balikatan active.' },
  { id:'capg', coordinates:[18.4,-34.4], label:'CAPE GOOD HOPE', risk:'maritime' as any, category:'Maritime',
    detail:'Record traffic — 1,200+ vessels/month rerouting from Red Sea. Congestion at Durban/Cape Town. Fuel costs inflated.' },
  { id:'pana', coordinates:[-79.9,9.1],  label:'PANAMA CANAL', risk:'maritime' as any, category:'Maritime',
    detail:'Capacity restored to 28 transits/day. Trump pressure on canal fees — Panama refuses renegotiation. Strategic review ongoing.' },
  { id:'balt', coordinates:[18.0,56.0],  label:'BALTIC SEA', risk:'maritime' as any, category:'Maritime',
    detail:'Undersea cable sabotage: 4 incidents 2025. Russia shadow fleet active. NATO Joint Baltic Maritime Activities running.' },

  // ─── CYBER THREATS ────────────────────────────────────────────────────────
  { id:'apt41',coordinates:[116.4,39.9], label:'APT-41 [CN]', risk:'cyber' as any, category:'Cyber',
    detail:'China MSS Unit 61398+. Active campaigns: US defense contractors, semiconductor IP, pharmaceutical research. CISA advisory Feb 2026.' },
  { id:'apt28',coordinates:[37.6,55.7],  label:'FANCY BEAR [RU]', risk:'cyber' as any, category:'Cyber',
    detail:'GRU Unit 26165. Current ops: NATO election interference, energy grid reconnaissance.' },
  { id:'sand', coordinates:[30.5,59.9],  label:'SANDWORM [RU]', risk:'cyber' as any, category:'Cyber',
    detail:'GRU Unit 74455. Ukraine critical infrastructure: 3 power grid attacks 2025. FrostyGoop ICS malware deployed.' },
  { id:'laz',  coordinates:[125.7,39.0], label:'LAZARUS [NK]', risk:'cyber' as any, category:'Cyber',
    detail:'DPRK RGB. Bybit exchange: $1.5B Feb 2025 — largest crypto heist ever. Funds sanctions evasion program.' },
  { id:'apt33',coordinates:[51.4,35.6],  label:'APT-33 [IR]', risk:'cyber' as any, category:'Cyber',
    detail:'IRGC-linked. OilRig campaigns: Middle East energy sector. Israel financial sector targeted.' },
  { id:'volt', coordinates:[121.5,31.2], label:'VOLT TYPHOON [CN]', risk:'cyber' as any, category:'Cyber',
    detail:'PLA pre-positioning US critical infrastructure: water, power, comms. Guam military networks primary target.' },
  { id:'cl0p', coordinates:[30.5,50.4],  label:'CLOP/RaaS', risk:'cyber' as any, category:'Cyber',
    detail:'MOVEit breach fallout — 2,700+ orgs. 2025 campaigns: healthcare, finance. $400M+ ransoms Q1 2026.' },

  // ─── AVIATION / AIRSPACE ──────────────────────────────────────────────────
  { id:'av-ukr',coordinates:[32.0,50.5], label:'UKRAINE AIRSPACE', risk:'aviation' as any, category:'Aviation',
    detail:'CLOSED since Feb 24 2022. S-300/S-400 active. MANPADS proliferation. No commercial access.' },
  { id:'av-ru', coordinates:[60.0,58.0], label:'RUSSIA AIRSPACE', risk:'aviation' as any, category:'Aviation',
    detail:'CLOSED to 36 nations. Adds 3-5hrs to Asian routes. Aeroflot isolated. Shadow registrations active.' },
  { id:'av-ir', coordinates:[53.0,32.0], label:'IRAN AIRSPACE', risk:'aviation' as any, category:'Aviation',
    detail:'Periodic closures during escalation cycles. AA systems: S-300, Bavar-373. SIGMET active.' },
  { id:'av-tw', coordinates:[119.5,25.0],label:'TAIWAN STRAIT AIR', risk:'aviation' as any, category:'Aviation',
    detail:'PLA ADIZ violations: 25+/month. Airlines self-routing around strait. CAL/EVA adjusted.' },
  { id:'av-me', coordinates:[55.0,25.0], label:'GULF AIR HUB', risk:'aviation' as any, category:'Aviation',
    detail:'Dubai/Doha — busiest long-haul hubs globally. EK/QR record traffic. Iran overflight risk.' },

  // ─── NATURAL DISASTERS ────────────────────────────────────────────────────
  { id:'dis-tr',coordinates:[37.0,38.5],  label:'TURKEY FAULT ZONE', risk:'disaster' as any, category:'Disaster',
    detail:'North Anatolian Fault. 2023 M7.8 killed 59K. Istanbul M7.5+ probability 62% in 30yrs. AFAD elevated alert.' },
  { id:'dis-jp',coordinates:[140.0,38.0], label:'JAPAN SEISMIC', risk:'disaster' as any, category:'Disaster',
    detail:'Noto M7.5 Jan 2024: 240+ dead. Mar 2026 Hokkaido M6.2 — infrastructure damage. Nankai Trough: M8-9 expected.' },
  { id:'dis-id',coordinates:[110.0,-7.0], label:'INDONESIA VOLCANIC', risk:'disaster' as any, category:'Disaster',
    detail:'Merapi Level 3 alert. Semeru eruptions ongoing. 127 active volcanoes. Aviation SIGMET: multiple active.' },
  { id:'dis-ca',coordinates:[-119.0,34.0],label:'CALIFORNIA', risk:'disaster' as any, category:'Disaster',
    detail:'Jan 2025 LA wildfires: $135B losses — costliest US disaster. Palisades/Eaton: 16,000 structures. San Andreas monitoring.' },
  { id:'dis-ph',coordinates:[124.0,12.0], label:'PHILIPPINES TYPHOON', risk:'disaster' as any, category:'Disaster',
    detail:'2025 season: 7 typhoons made landfall. Mayon Volcano: Level 3 alert Feb 2026. Highest global disaster risk.' },

  // ─── NUCLEAR FACILITIES — sourced from globalthreatmap OSINT ─────────────
  // Iran
  { id:'nuc-natanz',  coordinates:[51.7264,33.7225], label:'NATANZ [IR]', risk:'critical', category:'Nuclear',
    detail:'🔴 PRIMARY ENRICHMENT — Underground centrifuge halls. 60% U-235 enrichment active. IAEA access restricted. Israeli strike target.' },
  { id:'nuc-fordow',  coordinates:[51.235,34.708],  label:'FORDOW [IR]', risk:'critical', category:'Nuclear',
    detail:'🔴 UNDERGROUND ENRICHMENT — Built into mountain, hardened against airstrikes. Advanced centrifuges. Near weapons-grade capability.' },
  { id:'nuc-isfahan', coordinates:[51.668,32.6546], label:'ISFAHAN [IR]', risk:'high', category:'Nuclear',
    detail:'🟠 CONVERSION FACILITY — Produces UF6 feedstock for enrichment. JCPOA monitoring ended. Active production.' },
  { id:'nuc-bushehr', coordinates:[50.8842,28.8313],label:'BUSHEHR [IR]', risk:'alert', category:'Nuclear',
    detail:'🟡 POWER REACTOR — Russian-built 1GW PWR on Persian Gulf coast. Operational. Civilian use but strategic sensitivity.' },
  { id:'nuc-arak',    coordinates:[49.2432,34.3714],label:'ARAK [IR]', risk:'alert', category:'Nuclear',
    detail:'🟡 HEAVY WATER REACTOR — Redesigned under JCPOA. Reduced plutonium production. IAEA monitoring intermittent.' },
  { id:'nuc-parchin', coordinates:[51.77,35.515],   label:'PARCHIN [IR]', risk:'high', category:'Nuclear',
    detail:'🟠 SUSPECTED MILITARY — Explosive testing site. Past weapons-related experiments suspected by IAEA. Access denied.' },
  // North Korea
  { id:'nuc-yongbyon',coordinates:[125.7553,39.7953],label:'YONGBYON [KP]', risk:'critical', category:'Nuclear',
    detail:'🔴 WEAPONS COMPLEX — Primary DPRK nuclear facility. 5MW reactor + reprocessing plant. Plutonium + enriched uranium. ~80 warheads est.' },
  // Israel
  { id:'nuc-dimona',  coordinates:[35.1445,31.0014],label:'DIMONA [IL]', risk:'alert', category:'Nuclear',
    detail:'🟡 UNDECLARED WEAPONS — Negev Nuclear Research Center. Est. 80-400 warheads. Never acknowledged. No IAEA access.' },
  // Pakistan
  { id:'nuc-kahuta',  coordinates:[73.3856,33.5917],label:'KAHUTA [PK]', risk:'alert', category:'Nuclear',
    detail:'🟡 ENRICHMENT — Khan Research Laboratories. Centrifuge-based HEU. Est. 160 warheads. Proliferation history (A.Q. Khan network).' },
  { id:'nuc-khushab', coordinates:[72.2167,32.0333],label:'KHUSHAB [PK]', risk:'alert', category:'Nuclear',
    detail:'🟡 PLUTONIUM PRODUCTION — 4 heavy water reactors operational. Rapid warhead production capability. Growing arsenal.' },
  // Russia
  { id:'nuc-sarov',   coordinates:[43.3167,54.9333],label:'SAROV [RU]', risk:'alert', category:'Nuclear',
    detail:'🟡 WEAPONS DESIGN LAB — RFNC-VNIIEF. Russia\'s primary nuclear weapons design facility. 6,000+ warheads active/reserve.' },
  // China
  { id:'nuc-lop-nur', coordinates:[88.3703,41.5722],label:'LOP NUR [CN]', risk:'stable', category:'Nuclear',
    detail:'● FORMER TEST SITE — 45 nuclear tests conducted. Decommissioned 1996. CTBTO monitoring. PLA modernization nearby.' },
  // USA
  { id:'nuc-losalamos',coordinates:[-106.2992,35.8819],label:'LOS ALAMOS [US]', risk:'stable', category:'Nuclear',
    detail:'● WEAPONS LAB — Los Alamos National Laboratory. Nuclear weapons design and stewardship. W87 warhead modernization.' },

  // ─── ECONOMIC / INFRASTRUCTURE ────────────────────────────────────────────
  { id:'nyse', coordinates:[-74.0,40.7],  label:'NYSE / FED', risk:'stable', category:'S.I.C.',
    detail:'S&P 500: all-time highs. Fed rate: 3.75% (paused). Fear & Greed: 12 — Extreme Fear. 10Y yield: 4.42%.' },
  { id:'ldon', coordinates:[-0.1,51.5],   label:'LONDON MARKETS', risk:'stable', category:'S.I.C.',
    detail:'FTSE 100 outperforming. Sterling resilient. Post-Brexit clearing disputes resolved. BoE rate: 4.25%.' },
  { id:'cable',coordinates:[25.5,30.0],   label:'RED SEA CABLES', risk:'high', category:'Conflict',
    detail:'4 undersea cables damaged 2024-25. Houthi/anchor drag. 25% global internet traffic affected. Repair vessel active.' },
];

/** Live threat ticker — March 2026 */
export const THREAT_TICKER = [
  '🔴 UKRAINE: Russian glide bomb campaign — Kharkiv infrastructure targeted',
  '🚢 RED SEA: Houthi anti-ship missile — merchant vessel struck near Bab-el-Mandeb',
  '💻 LAZARUS [DPRK]: $1.5B Bybit crypto heist — funds tracing active across 12 exchanges',
  '☢️ IRAN: Natanz enrichment continues at 60% — IAEA access restricted since Feb 2026',
  '✈️ TAIWAN: 18 PLA aircraft ADIZ incursion — USS Theodore Roosevelt monitors',
  '🌋 JAPAN: M6.2 Hokkaido — bullet train suspended, tsunami warning cancelled',
  '💻 VOLT TYPHOON: CISA warns US water infrastructure pre-positioned by PLA',
  '🚢 HORMUZ: USS Gravely intercepts Iranian weapons shipment bound for Yemen',
  '🔴 IRAN: Fordow underground enrichment at near-capacity — satellite imagery confirms',
  '🟠 DRC: M23 forces advance on Bukavu — SADC troops reinforcing',
  '☢️ DPRK: Yongbyon reactor thermal signature elevated — 5MW restart suspected',
  '💻 APT-41: Chinese hackers breach 3 US defense contractors — F-35 data targeted',
  '🔴 SUDAN: RSF attacks civilian convoy in North Darfur — UN condemns',
  '🚢 PANAMA: US pressure on canal fees — Panama refuses renegotiation',
];
