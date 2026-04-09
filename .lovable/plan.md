

## Redesign AYN Portfolio — Website-Accurate Branding

### The Problem
The v1 slides used navy blue (#0A0E1A) backgrounds and blue (#2563EB) accents. The actual AYN website uses a **monochromatic black & white** palette — pure black backgrounds, white text, gray accents, no color. The content was also inaccurate.

### Brand Identity (from CSS + Landing Page)

**Colors — Pure B&W, no blue:**
- Background: `#0A0A0A` (near black, `0 0% 4%`)
- Card: `#0F0F0F` (dark card, `0 0% 6%`)
- Muted: `#1F1F1F` (`0 0% 12%`)
- Foreground: `#FAFAFA` (off-white, `0 0% 98%`)
- Muted foreground: `#999999` (`0 0% 60%`)
- Border: `#262626` (`0 0% 15%`)
- Accent dots/shapes: white or light gray — **no color at all**

**Typography:**
- Display/Headers: **Syne** (font-display / font-serif in config)
- Body: **Inter** (font-sans)
- Mono accents: **JetBrains Mono** (used for labels like "About AYN", "AYN Capabilities")

**Visual motifs:**
- Concentric ring "eye" tunnel (five layers)
- Rounded 2xl icon containers with `bg-muted/50`
- Minimal, spacious layouts with lots of breathing room
- No accent lines under titles
- Small dots (`w-1.5 h-1.5 rounded-full`) as bullet markers

### Accurate Content (from LandingPage.tsx)

- **Tagline**: "Real business intelligence — markets, risks, and decisions that matter."
- **About**: "Business Intelligence That Never Sleeps" — monitors markets, analyzes risks, gives instant answers
- **6 Value Props**: Adaptive Understanding, Always Available, Privacy Protected, Smart Automation, Custom AI Agents, Advanced Analytics
- **3 Pillars**: Build & Study Business, Market Shifts & Intelligence, World Event Predictions
- **Company**: Canadian-based, global reach, no Arabic text per user request

### Slide Structure (10 slides, full dark B&W theme)

1. **Title** — Large "AYN" in Syne-like bold, concentric eye circles in grays/whites, tagline below, aynn.io
2. **Who We Are** — "Business Intelligence That Never Sleeps", Canadian AI company, global, team of engineers & AI specialists
3. **The Problem** — Three pain points with large stat callouts: 60%+ wasted time, cold leads overnight, missed market shifts
4. **Our Technology** — Proprietary multi-agent architecture, adaptive learning, real-time processing, bilingual, privacy-first (no secrets revealed)
5. **Three Pillars Overview** — Build & Study Business / Market Shifts / World Predictions — icon + title + brief text in 3-column layout
6. **Build & Study Business** — Deep dive: competitor analysis, data-driven strategies, performance reports
7. **Market Shifts & Intelligence** — Deep dive: real-time tracking, sector analysis, investment alerts
8. **World Event Predictions** — Deep dive: geopolitical risks, supply chain alerts, business impact scenarios
9. **Why AYN** — 2x3 grid of value props with icon circles: Adaptive Understanding, Always Available, Privacy Protected, Smart Automation, Custom AI Agents, Advanced Analytics
10. **Let's Talk** — "Ready to Transform Your Business?" + info@aynn.io + aynn.io

### Design Approach

- **All slides**: `#0A0A0A` background, `#FAFAFA` white text, `#999999` secondary text
- **Cards/containers**: `#0F0F0F` or `#1F1F1F` rounded rectangles
- **Icon circles**: `#1F1F1F` fill with white icons inside
- **Bullet dots**: small white circles, matching landing page style
- **Headers**: Georgia or Arial Black (closest to Syne available in PPTX), large 40-44pt
- **Body**: Calibri 14-16pt
- **Mono labels**: Consolas 10-12pt for section labels (e.g., "ABOUT AYN", "CAPABILITIES")
- **No blue, no color accents** — purely monochromatic
- **Concentric eye on title slide**: 5 layered circles from dark gray to light gray, matching the tunnel effect
- **Varied layouts**: hero text, two-column, 3-column grid, stat callouts, 2x3 grid

### Technical
- Generate with `pptxgenjs` in Node.js
- Build concentric eye as layered circles on title slide
- Convert to PDF then images for QA inspection
- Output: `/mnt/documents/AYN_Portfolio_v2.pptx`

