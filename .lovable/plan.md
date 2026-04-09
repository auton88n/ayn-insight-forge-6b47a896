

## Redesign AYN Portfolio v3

### Issues to Fix

1. **Eye motif doesn't match landing page** — The current PPTX eye uses simple layered circles. The real eye has 5 concentric rings at inset 0%, 8%, 16%, 24%, 32% with progressive gray shading, then a black pupil circle with a Brain icon center. Need to replicate this exact structure with proper proportions and shading.

2. **Remove all dashes (—)** — Replace em dashes and hyphens used as punctuation throughout. Rewrite sentences to flow naturally without them.

3. **Remove "Privacy-First Design"** — User confirms AYN uses third-party LLMs (Gemini), so claiming privacy-first is misleading. Remove from slide 4 (Technology) and slide 9 (Why AYN grid). Also remove "Your Privacy, Protected" from the value props.

4. **Remove "Smart Automation" and "Custom AI Agents"** — These are services, not value props. Remove from the Why AYN grid (slide 9).

5. **Remove almufaijer.com** — Only keep aynn.io on the contact slide.

6. **Natural human writing** — Rewrite all copy to sound conversational and human, not like marketing bullet points.

### Updated "Why AYN" Grid (4 items instead of 6)

Keep only:
- Adaptive Understanding
- Always Available
- Advanced Analytics
- Add a 4th: something like "Global Reach" or "Built for Scale" (non-service, non-privacy)

Use a 2x2 grid layout instead of 2x3.

### Eye Motif Rebuild

Match the Hero exactly:
- Ring 1 (outermost): dark gray ~`#1F1F1F` with inner shadow
- Ring 2 (inset 8%): slightly lighter ~`#242424`
- Ring 3 (inset 16%): ~`#2A2A2A`
- Ring 4 (inset 24%): ~`#1A1A1A` (card-like)
- Ring 5 (inset 32%): ~`#1F1F1F` (muted)
- Center: black circle pupil with white "brain" shape or white dot

Build using pptxgenjs layered OVAL shapes, each progressively smaller and centered, matching the concentric tunnel depth effect from the screenshot.

### Slide Structure (10 slides, same content but rewritten)

1. **Title** — AYN + rebuilt eye motif + tagline (no dashes) + aynn.io
2. **Who We Are** — Rewritten naturally, no dashes
3. **The Problem** — Same stats, human tone
4. **Our Technology** — Remove Privacy-First. Keep: Multi-Agent Architecture, Adaptive Intelligence, Real-Time Processing. Add a 4th like "Bilingual Intelligence" or "Continuous Learning"
5. **Three Pillars Overview** — Same content, no dashes
6. **Pillar 1: Build & Study Business** — No dashes, natural writing
7. **Pillar 2: Market Shifts & Intelligence** — No dashes, natural writing
8. **Pillar 3: World Event Predictions** — No dashes, natural writing
9. **Why AYN** — 2x2 grid: Adaptive Understanding, Always Available, Advanced Analytics, + one more (e.g. "Continuous Learning" or "Global Intelligence")
10. **Let's Talk** — Remove almufaijer.com, keep only info@aynn.io + aynn.io

### Technical

- Regenerate with pptxgenjs
- Rebuild eye as layered OVALs matching Hero proportions
- Remove all `—` and `-` used as punctuation from every string
- Output: `/mnt/documents/AYN_Portfolio_v3.pptx`
- QA: convert to images, inspect every slide

