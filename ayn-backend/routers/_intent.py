"""Port of intentDetector.ts"""
import re


def detect_intent(message: str, has_image_file: bool = False) -> str:
    lower = message.lower()

    image_patterns = [
        r'generate\s+(an?\s+)?image', r'create\s+(an?\s+)?image', r'make\s+(an?\s+)?image',
        r'make\s+me\s+(an?\s+)?(picture|photo|image)', r'draw\s', r'picture\s+of',
        r'image\s+of', r'photo\s+of', r'illustration\s+of', r'visualize',
        r'صورة', r'ارسم', r'اعطني صورة', r'ابي\s*صورة', r'سوي\s*صورة',
        r'another\s+image', r'new\s+image',
    ]
    if any(re.search(p, lower) for p in image_patterns):
        return 'image'

    document_patterns = [
        r'create\s+(an?\s+)?pdf', r'make\s+(an?\s+)?pdf', r'generate\s+(an?\s+)?pdf',
        r'give\s+me\s+(an?\s+)?pdf', r'pdf\s+(report|document|about|for|of)',
        r'create\s+(an?\s+)?(excel|exel|excell)', r'make\s+(an?\s+)?(excel|exel|excell)',
        r'(excel|exel|excell)\s+(sheet|about|for|of)', r'spreadsheet', r'xlsx',
        r'create\s+(an?\s+)?report', r'make\s+(an?\s+)?report',
        r'اعمل\s*pdf', r'ملف\s*pdf', r'تقرير\s*pdf',
        r'اعمل\s*(اكسل|لي)', r'جدول\s*عن', r'اكسل\s*عن',
        r'(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:pdf|excel|xlsx)',
    ]
    if any(re.search(p, lower) for p in document_patterns):
        return 'document'

    file_keywords = ['uploaded', 'analyze this', 'summarize this', 'this file', 'this document']
    if any(kw in lower for kw in file_keywords):
        return 'files'
    if has_image_file:
        return 'chat'

    business_patterns = [
        r'i have (a |an )?business idea', r'start(ing)? a business',
        r'launch(ing)? a (business|startup|company|brand|product|service)',
        r'my business (is|has|isn\'t|struggling|failing|losing|growing)',
        r'business (problem|issue|challenge|plan|model|strategy)',
        r'grow(ing)? my business', r'scale (my |the )?business',
        r'get (more )?(customers|clients|sales|revenue)', r'find (customers|clients)',
        r'marketing (plan|strategy|help)', r'how (do i |to )?(market|sell|promote)',
        r'raise (money|capital|funding|investment)', r'investor(s)?',
        r'pitch (deck|to investors)', r'funding (round|stage)', r'valuation',
        r'عندي فكرة|مشروع|تجارة|أعمال|بزنس|شركة|أبدأ|عندي مشروع',
        r'help (me )?(with )?(my )?(business|startup|company|idea|plan)',
        r'should i (start|launch|open|build)',
    ]
    if any(re.search(p, lower) for p in business_patterns):
        return 'business-intelligence'

    return 'chat'
