

## Replace Feature Images with Premium UI Mockups

### What
Replace the three low-quality AI-generated feature images (`feature-business.jpg`, `feature-market.jpg`, `feature-predict.jpg`) with clean, premium UI mockup screenshots that accurately represent what AYN actually does.

### Approach
Use AI image generation (Gemini 3 Pro Image Preview via Lovable AI Gateway) to create three polished, realistic UI mockups matching AYN's dark monochromatic aesthetic. Each image will be generated via a temporary script, uploaded to `src/assets/`, and replace the existing files.

### Three Images to Generate

**1. Business Intelligence (`feature-business.jpg`)**
Clean dark-themed dashboard mockup showing: competitor analysis cards, a market positioning chart, business performance metrics. Monochrome dark UI with subtle blue accents matching AYN's `#0EA5E9` brand color. Professional, minimal, no fake text or blurry elements.

**2. Market Intelligence (`feature-market.jpg`)**
Dark-themed market monitoring interface showing: real-time price tickers, clean line charts for market trends, sector heat indicators. Same dark aesthetic, blue accent highlights on key data points. Feels like a Bloomberg-level terminal but cleaner and more modern.

**3. World Predictions (`feature-predict.jpg`)**
Dark-themed geopolitical intelligence dashboard showing: a clean world map with highlighted regions, risk assessment indicators, supply chain flow visualization. Amber/red accent colors for alerts alongside the blue brand color. Professional operations-center feel.

### Technical Steps
1. Write a Deno/Node script that calls the Gemini 3 Pro image generation API with carefully crafted prompts for each image
2. Extract the base64 images and save as JPG files
3. Copy the three generated images to `src/assets/` replacing the existing files
4. No code changes needed in `LandingPage.tsx` since the imports and filenames stay the same

### Image Specs
- Resolution: 1024x1024 (will be cropped by `object-cover` in the 16/10 aspect ratio containers)
- Style: Dark UI, clean typography, minimal, premium feel matching AYN's monochrome + blue accent aesthetic
- No fake blurry text or gibberish characters

### QA
- Visually inspect each generated image before replacing
- If quality is insufficient, regenerate with refined prompts
- Check landing page preview after replacement to verify images look correct in context

