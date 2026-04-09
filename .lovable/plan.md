

## Fix AYN Portfolio v3: Layout + Eye + Content

### Problem
V3 has correct content (no dashes, no privacy claims, no almufaijer.com) but broken layout with misaligned elements, cut-off text, and a poor eye motif. V2 had clean layout but wrong content.

### Approach
Rebuild the generation script using V2's proven layout structure as the base, but with V3's corrected content. Fix the eye to properly match the landing page's concentric tunnel.

### Changes

**1. Eye Motif (Title + CTA slides)**
Use the Hero.tsx exact structure: 5 concentric rings at inset 0%, 8%, 16%, 24%, 32%. Make rings large enough to be visually impactful (4" diameter outer). Use proper grayscale progression matching dark theme:
- Ring 1: `#1A1A1A` (outermost, with shadow effect via slightly darker border)
- Ring 2: `#222222`  
- Ring 3: `#2D2D2D`
- Ring 4: `#1A1A1A`
- Ring 5: `#222222`
- Pupil: `#000000` with white dot center

**2. Layout fixes (use V2 spacing patterns)**
- All text boxes: proper margins (0.7" left, 0.5" right minimum)
- Stat callouts on slide 3: evenly spaced 3-column with adequate width
- Technology slide 4: 2x2 grid cards with consistent sizing and padding
- Pillar slides 6-8: two-column layout (text left, bullet list right) with proper spacing
- Why AYN slide 9: 2x2 grid (not 2x3), removing Privacy/Smart Automation/Custom Agents
- All text left-aligned (not centered) for body copy

**3. Content (keep V3 corrections)**
- No dashes anywhere
- No "Privacy-First Design"
- No "Smart Automation" or "Custom AI Agents" in value props
- No almufaijer.com
- 2x2 Why AYN grid: Adaptive Understanding, Always Available, Advanced Analytics, Global Intelligence
- Natural human writing throughout

**4. Technical**
- Regenerate with pptxgenjs
- Output: `/mnt/documents/AYN_Portfolio_v3.pptx` (overwrite)
- QA: convert to images, inspect all 10 slides, fix issues, re-verify

