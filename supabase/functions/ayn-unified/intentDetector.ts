// Intent detection — minimal, only for things the AI cannot decide itself
// The model handles everything that requires judgment (search, analysis, etc.)

export function detectIntent(message: string, hasImageFile = false): string {
  const lower = message.toLowerCase();

  // IMAGE — explicit requests only, model cannot generate images itself
  const imagePatterns = [
    /generate\s+(an?\s+)?image/,
    /create\s+(an?\s+)?image/,
    /make\s+(an?\s+)?image/,
    /make\s+me\s+(an?\s+)?(picture|photo|image)/,
    /generate\s+(an?\s+)?picture/,
    /create\s+(an?\s+)?picture/,
    /show\s+me\s+(an?\s+)?(image|picture|photo)/,
    /give\s+me\s+(an?\s+)?(image|picture|photo)/,
    /draw\s/,
    /picture\s+of/,
    /image\s+of/,
    /photo\s+of/,
    /illustration\s+of/,
    /visualize/,
    /render\s+(an?\s+)?/,
    /صورة/, /ارسم/, /اعطني صورة/, /ابي\s*صورة/, /سوي\s*صورة/,
    /image\s+de/, /dessine/, /genere\s+une\s+image/,
    /another\s+image/, /new\s+image/, /new\s+picture/,
  ];
  if (imagePatterns.some(rx => rx.test(lower))) return 'image';

  // DOCUMENT — explicit PDF/Excel requests only
  const documentPatterns = [
    /create\s+(an?\s+)?pdf/, /make\s+(an?\s+)?pdf/, /generate\s+(an?\s+)?pdf/,
    /give\s+me\s+(an?\s+)?pdf/, /export\s+as\s+pdf/, /pdf\s+(report|document|about|for|of)/,
    /(?:i\s+(?:want|need)\s+(?:an?\s+)?)?pdf\s+(?:about|for|on)/,
    /(?:can\s+you\s+)?(?:make|create|get)\s+(?:me\s+)?(?:an?\s+)?pdf/,
    /create\s+(an?\s+)?(excel|exel|excell)/, /make\s+(an?\s+)?(excel|exel|excell)/,
    /give\s+me\s+(an?\s+)?(excel|exel|excell)/,
    /(excel|exel|excell)\s+(sheet|about|for|of)/, /spreadsheet/, /xlsx/,
    /create\s+(an?\s+)?report/, /make\s+(an?\s+)?report/, /generate\s+(an?\s+)?report/,
    /اعمل\s*pdf/, /انشئ\s*pdf/, /ملف\s*pdf/, /تقرير\s*pdf/,
    /اعمل\s*(اكسل|لي)/, /جدول\s*عن/, /بيانات\s*عن/, /اكسل\s*عن/,
    /ابي\s*(?:pdf|اكسل|ملف)/, /اعطني\s*(?:تقرير|ملف|جدول)/, /سوي\s*(?:pdf|اكسل|ملف)/,
    /créer\s+(un\s+)?pdf/, /faire\s+(un\s+)?pdf/, /rapport\s+pdf/,
    /créer\s+(un\s+)?excel/, /tableur/,
    /(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:pdf|excel|exel|excell|xlsx)/,
    /^(?:in\s+)?(?:excel|exel|excell|pdf|xlsx)\s*$/,
  ];
  if (documentPatterns.some(rx => rx.test(lower))) return 'document';

  // FILES — when a file has been uploaded and user wants analysis
  const fileKeywords = ['uploaded', 'analyze this', 'summarize this', 'this file', 'this document'];
  if (fileKeywords.some(kw => lower.includes(kw))) return 'files';
  if (hasImageFile) return 'chat'; // attached image handled as chat, model sees it

  // BUSINESS INTELLIGENCE MODE — structured business analysis and advisory
  const businessPatterns = [
    // Starting / idea
    /i have (a |an )?business idea/,
    /start(ing)? a business/,
    /launch(ing)? a (business|startup|company|brand|product|service)/,
    /open(ing)? a (business|shop|store|restaurant|company)/,
    /new (business|startup|venture|idea)/,
    /my (business )?idea is/,
    /want to (start|build|create|launch) (a |my )?(business|startup|company)/,
    /thinking (about|of) (starting|launching|building)/,
    // Existing business problems
    /my business (is|has|isn't|doesn't|struggling|failing|losing|growing)/,
    /business (problem|issue|challenge|struggle|crisis)/,
    /business (is )?slow/,
    /not (making|getting) (enough )?(money|revenue|sales|customers)/,
    /losing (money|customers|clients)/,
    /business (plan|model|strategy)/,
    /grow(ing)? my business/,
    /scale (my |the )?business/,
    /improve (my |the )?business/,
    /fix (my |the )?business/,
    /save (my |the )?business/,
    // Marketing / customers
    /get (more )?(customers|clients|sales|revenue)/,
    /find (customers|clients)/,
    /marketing (plan|strategy|help)/,
    /how (do i |to )?(market|sell|promote|advertise)/,
    /no (customers|clients|sales)/,
    /first (customers|clients|sales)/,
    // Pricing / revenue
    /how (should i |to )?pric(e|ing)/,
    /what (should i |to )?charg(e|ing)/,
    /revenue model/,
    /monetiz/,
    /business model/,
    /unit economics/,
    // Market / competition
    /market (entry|analysis|research|opportunity)/,
    /enter (the |a )?market/,
    /competitor(s)? analysis/,
    /is there (a )?market/,
    /market size/,
    /industry (analysis|trends|outlook)/,
    // Investment / funding
    /raise (money|capital|funding|investment)/,
    /investor(s)?/,
    /pitch (deck|to investors)/,
    /funding (round|stage)/,
    /valuation/,
    // Arabic patterns
    /عندي فكرة|مشروع|تجارة|أعمال|بزنس|شركة|أبدأ|أبغى أبدأ|عندي مشروع/,
    /مشكلة في|خسارة|مبيعات|زبائن|تسويق|خطة عمل|نمو/,
    // Generic business help
    /help (me )?(with )?(my )?(business|startup|company|idea|plan)/,
    /business (advice|help|guidance|tips)/,
    /what (business|industry) should/,
    /which (business|market|industry)/,
    /should i (start|launch|open|build)/,
    /is (it|this) (a )?(good|bad) (business|idea|time)/,
  ];
  if (businessPatterns.some(rx => rx.test(lower))) return 'business-intelligence';

  // Everything else — let the model decide naturally
  return 'chat';
}
