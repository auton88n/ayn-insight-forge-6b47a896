"""
intent_detector.py — exact port of supabase/functions/ayn-unified/intentDetector.ts
"""
import re


def detect_intent(message: str, has_image_file: bool = False) -> str:
    lower = message.lower()

    # IMAGE
    image_patterns = [
        r'generate\s+(an?\s+)?image', r'create\s+(an?\s+)?image', r'make\s+(an?\s+)?image',
        r'make\s+me\s+(an?\s+)?(picture|photo|image)', r'generate\s+(an?\s+)?picture',
        r'create\s+(an?\s+)?picture', r'show\s+me\s+(an?\s+)?(image|picture|photo)',
        r'give\s+me\s+(an?\s+)?(image|picture|photo)', r'draw\s', r'picture\s+of',
        r'image\s+of', r'photo\s+of', r'illustration\s+of', r'visualize',
        r'render\s+(an?\s+)?', r'صورة', r'ارسم', r'اعطني صورة', r'ابي\s*صورة',
        r'سوي\s*صورة', r'image\s+de', r'dessine', r'genere\s+une\s+image',
        r'another\s+image', r'new\s+image', r'new\s+picture',
    ]
    if any(re.search(p, lower) for p in image_patterns):
        return 'image'

    # DOCUMENT
    document_patterns = [
        r'create\s+(an?\s+)?pdf', r'make\s+(an?\s+)?pdf', r'generate\s+(an?\s+)?pdf',
        r'give\s+me\s+(an?\s+)?pdf', r'export\s+as\s+pdf', r'pdf\s+(report|document|about|for|of)',
        r'(?:i\s+(?:want|need)\s+(?:an?\s+)?)?pdf\s+(?:about|for|on)',
        r'(?:can\s+you\s+)?(?:make|create|get)\s+(?:me\s+)?(?:an?\s+)?pdf',
        r'create\s+(an?\s+)?(excel|exel|excell)', r'make\s+(an?\s+)?(excel|exel|excell)',
        r'give\s+me\s+(an?\s+)?(excel|exel|excell)',
        r'(excel|exel|excell)\s+(sheet|about|for|of)', r'spreadsheet', r'xlsx',
        r'create\s+(an?\s+)?report', r'make\s+(an?\s+)?report', r'generate\s+(an?\s+)?report',
        r'اعمل\s*pdf', r'انشئ\s*pdf', r'ملف\s*pdf', r'تقرير\s*pdf',
        r'اعمل\s*(اكسل|لي)', r'جدول\s*عن', r'بيانات\s*عن', r'اكسل\s*عن',
        r'ابي\s*(?:pdf|اكسل|ملف)', r'اعطني\s*(?:تقرير|ملف|جدول)', r'سوي\s*(?:pdf|اكسل|ملف)',
        r'créer\s+(un\s+)?pdf', r'faire\s+(un\s+)?pdf', r'rapport\s+pdf',
        r'créer\s+(un\s+)?excel', r'tableur',
        r'(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:pdf|excel|exel|excell|xlsx)',
        r'^(?:in\s+)?(?:excel|exel|excell|pdf|xlsx)\s*$',
    ]
    if any(re.search(p, lower) for p in document_patterns):
        return 'document'

    # FILES
    file_keywords = ['uploaded', 'analyze this', 'summarize this', 'this file', 'this document']
    if any(kw in lower for kw in file_keywords):
        return 'files'
    if has_image_file:
        return 'chat'

    # BUSINESS INTELLIGENCE
    business_patterns = [
        r'i have (a |an )?business idea', r'start(ing)? a business',
        r'launch(ing)? a (business|startup|company|brand|product|service)',
        r'open(ing)? a (business|shop|store|restaurant|company)',
        r'new (business|startup|venture|idea)', r'my (business )?idea is',
        r'want to (start|build|create|launch) (a |my )?(business|startup|company)',
        r'thinking (about|of) (starting|launching|building)',
        r'my business (is|has|isn\'t|doesn\'t|struggling|failing|losing|growing)',
        r'business (problem|issue|challenge|struggle|crisis)', r'business (is )?slow',
        r'not (making|getting) (enough )?(money|revenue|sales|customers)',
        r'losing (money|customers|clients)',
        r'business (plan|model|strategy)', r'grow(ing)? my business',
        r'scale (my |the )?business', r'improve (my |the )?business',
        r'fix (my |the )?business', r'save (my |the )?business',
        r'get (more )?(customers|clients|sales|revenue)', r'find (customers|clients)',
        r'marketing (plan|strategy|help)',
        r'how (do i |to )?(market|sell|promote|advertise)',
        r'no (customers|clients|sales)', r'first (customers|clients|sales)',
        r'how (should i |to )?pric(e|ing)', r'what (should i |to )?charg(e|ing)',
        r'revenue model', r'monetiz', r'business model', r'unit economics',
        r'market (entry|analysis|research|opportunity)', r'enter (the |a )?market',
        r'competitor(s)? analysis', r'is there (a )?market', r'market size',
        r'industry (analysis|trends|outlook)',
        r'raise (money|capital|funding|investment)', r'investor(s)?',
        r'pitch (deck|to investors)', r'funding (round|stage)', r'valuation',
        r'عندي فكرة|مشروع|تجارة|أعمال|بزنس|شركة|أبدأ|أبغى أبدأ|عندي مشروع',
        r'مشكلة في|خسارة|مبيعات|زبائن|تسويق|خطة عمل|نمو',
        r'help (me )?(with )?(my )?(business|startup|company|idea|plan)',
        r'business (advice|help|guidance|tips)',
        r'what (business|industry) should', r'which (business|market|industry)',
        r'should i (start|launch|open|build)',
        r'is (it|this) (a )?(good|bad) (business|idea|time)',
    ]
    if any(re.search(p, lower) for p in business_patterns):
        return 'business-intelligence'

    return 'chat'
