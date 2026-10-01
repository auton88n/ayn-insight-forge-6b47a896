// Comprehensive multi-language detection utility
// Supports 20+ languages based on script and word pattern detection

export interface DetectedLanguage {
  code: string;      // ISO 639-1 code
  name: string;      // English name
  nativeName: string; // Native name
  flag: string;      // Flag emoji
  confidence: number; // 0-1 confidence score
}

// Language definitions
const LANGUAGES: Record<string, Omit<DetectedLanguage, 'confidence'>> = {
  // Non-Latin scripts
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  ko: { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  uk: { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  he: { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱' },
  th: { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  el: { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷' },
  bn: { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩' },
  ta: { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  te: { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  vi: { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  
  // Latin scripts
  en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  nl: { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  pl: { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  sv: { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  da: { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰' },
  no: { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴' },
  fi: { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮' },
  cs: { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
  ro: { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴' },
  hu: { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺' },
  id: { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  ms: { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
};

// Script detection patterns (Unicode ranges)
const SCRIPT_PATTERNS: { pattern: RegExp; lang: string }[] = [
  { pattern: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, lang: 'ar' }, // Arabic
  { pattern: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, lang: 'zh' }, // Chinese (CJK)
  { pattern: /[\u3040-\u309F\u30A0-\u30FF]/g, lang: 'ja' }, // Japanese (Hiragana + Katakana)
  { pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/g, lang: 'ko' }, // Korean (Hangul)
  { pattern: /[\u0400-\u04FF]/g, lang: 'ru' }, // Cyrillic (Russian/Ukrainian)
  { pattern: /[\u0590-\u05FF]/g, lang: 'he' }, // Hebrew
  { pattern: /[\u0E00-\u0E7F]/g, lang: 'th' }, // Thai
  { pattern: /[\u0900-\u097F]/g, lang: 'hi' }, // Devanagari (Hindi)
  { pattern: /[\u0980-\u09FF]/g, lang: 'bn' }, // Bengali
  { pattern: /[\u0B80-\u0BFF]/g, lang: 'ta' }, // Tamil
  { pattern: /[\u0C00-\u0C7F]/g, lang: 'te' }, // Telugu
  { pattern: /[\u0370-\u03FF]/g, lang: 'el' }, // Greek
];

// Common words for Latin language detection
const LATIN_WORD_PATTERNS: { words: string[]; lang: string }[] = [
  // English - MUST BE FIRST for priority (was missing, causing English to be misdetected as Dutch)
  { words: ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'beneath', 'under', 'above', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'hello', 'hi', 'hey', 'please', 'thanks', 'thank', 'yes', 'okay', 'ok', 'and', 'but', 'or', 'if', 'then', 'because', 'as', 'until', 'while', 'although', 'though', 'even', 'also', 'still', 'already', 'always', 'never', 'sometimes', 'often', 'usually', 'here', 'there', 'now', 'today', 'tomorrow', 'yesterday', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'help', 'want', 'need', 'know', 'think', 'see', 'look', 'find', 'give', 'tell', 'say', 'get', 'make', 'go', 'come', 'take', 'use', 'work', 'try', 'ask', 'seem', 'feel', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'file', 'document', 'image', 'photo', 'picture', 'video', 'upload', 'download', 'search', 'email', 'message', 'chat', 'question', 'answer', 'problem', 'solution', 'issue', 'error', 'fix', 'update', 'new', 'old', 'good', 'bad', 'great', 'best', 'better', 'worse', 'worst', 'first', 'last', 'next', 'previous', 'current', 'different', 'another', 'able', 'available', 'possible', 'important', 'necessary', 'required', 'sure', 'certain', 'clear', 'simple', 'easy', 'hard', 'difficult', 'free', 'full', 'empty', 'closed', 'ready', 'done', 'finished', 'complete', 'incomplete', 'correct', 'wrong', 'right', 'left', 'top', 'bottom', 'front', 'back', 'side', 'inside', 'outside', 'between', 'around', 'through', 'during', 'before', 'again', 'once', 'twice'], lang: 'en' },
  // French
  { words: ['je', 'tu', 'nous', 'vous', 'est', 'sont', 'avec', 'pour', 'dans', 'que', 'qui', 'les', 'des', 'une', 'sur', 'pas', 'plus', 'tout', 'bien', 'très', 'aussi', 'comme', 'mais', 'être', 'avoir', 'faire', 'pouvoir', 'vouloir', 'aller', 'voir', 'savoir', 'falloir', 'devoir', 'croire', 'trouver', 'donner', 'prendre', 'parler', 'aimer', 'passer', 'mettre', 'demander', 'rester', 'répondre', 'entendre', 'penser', 'arriver', 'connaître', 'devenir', 'sentir', 'sembler', 'tenir', 'comprendre', 'rendre', 'attendre', 'sortir', 'partir', 'mourir', 'écrire', 'paraître', 'permettre', 'ouvrir', 'suivre', 'vivre', 'perdre', 'rappeler', 'servir', 'montrer', 'jouer', 'retourner', 'appeler', 'chercher', 'bonjour', 'merci', 'salut', "s'il", 'vous', 'plaît', "c'est", "n'est", "qu'est", "l'on", "d'un", "j'ai", "qu'il", 'votre', 'notre', 'cette'], lang: 'fr' },
  // Spanish
  { words: ['yo', 'tú', 'él', 'ella', 'nosotros', 'ustedes', 'ellos', 'está', 'están', 'con', 'para', 'qué', 'quién', 'cómo', 'dónde', 'cuándo', 'por', 'pero', 'muy', 'también', 'como', 'más', 'todo', 'bien', 'ser', 'haber', 'hacer', 'poder', 'querer', 'decir', 'ir', 'ver', 'dar', 'saber', 'deber', 'creer', 'hola', 'gracias', 'buenos', 'buenas', 'días', 'noches', 'hasta', 'luego', 'señor', 'señora', 'usted'], lang: 'es' },
  // German
  { words: ['ich', 'du', 'er', 'sie', 'wir', 'ihr', 'ist', 'sind', 'mit', 'für', 'auf', 'was', 'wer', 'wie', 'wo', 'wann', 'aber', 'auch', 'sehr', 'und', 'oder', 'nicht', 'sein', 'haben', 'werden', 'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen', 'guten', 'morgen', 'tag', 'abend', 'nacht', 'danke', 'bitte', 'herr', 'frau', 'das', 'ein', 'eine', 'der', 'die', 'dass', 'wenn', 'weil'], lang: 'de' },
  // Italian
  { words: ['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'è', 'sono', 'con', 'per', 'che', 'chi', 'come', 'dove', 'quando', 'perché', 'ma', 'molto', 'anche', 'più', 'tutto', 'bene', 'essere', 'avere', 'fare', 'potere', 'volere', 'dovere', 'sapere', 'vedere', 'andare', 'ciao', 'buongiorno', 'buonasera', 'grazie', 'prego', 'signore', 'signora', 'della', 'delle', 'degli', 'nel', 'nella', 'questo', 'questa'], lang: 'it' },
  // Portuguese
  { words: ['eu', 'tu', 'ele', 'ela', 'nós', 'vocês', 'eles', 'elas', 'está', 'estão', 'com', 'para', 'que', 'quem', 'como', 'onde', 'quando', 'porquê', 'mas', 'muito', 'também', 'mais', 'tudo', 'bem', 'ser', 'ter', 'fazer', 'poder', 'querer', 'dever', 'saber', 'ver', 'ir', 'dar', 'olá', 'obrigado', 'obrigada', 'bom', 'boa', 'dia', 'noite', 'senhor', 'senhora', 'você', 'não', 'sim', 'uma', 'um', 'dos', 'das', 'nos', 'nas'], lang: 'pt' },
  // Dutch
  { words: ['ik', 'jij', 'hij', 'zij', 'wij', 'jullie', 'is', 'zijn', 'met', 'voor', 'wat', 'wie', 'hoe', 'waar', 'wanneer', 'waarom', 'maar', 'ook', 'zeer', 'en', 'of', 'niet', 'wel', 'hebben', 'kunnen', 'moeten', 'willen', 'zullen', 'hallo', 'goedemorgen', 'goedemiddag', 'goedenavond', 'dank', 'bedankt', 'alstublieft', 'meneer', 'mevrouw', 'het', 'een', 'de', 'dit', 'dat', 'deze', 'die', 'van', 'naar'], lang: 'nl' },
  // Polish
  { words: ['ja', 'ty', 'on', 'ona', 'my', 'wy', 'oni', 'one', 'jest', 'są', 'z', 'dla', 'co', 'kto', 'jak', 'gdzie', 'kiedy', 'dlaczego', 'ale', 'też', 'bardzo', 'i', 'lub', 'nie', 'być', 'mieć', 'móc', 'musieć', 'chcieć', 'wiedzieć', 'cześć', 'dzień', 'dobry', 'wieczór', 'dziękuję', 'proszę', 'tak', 'pan', 'pani', 'to', 'ten', 'ta', 'te', 'ci', 'tego', 'tej', 'tych', 'które', 'który', 'która'], lang: 'pl' },
  // Turkish
  { words: ['ben', 'sen', 'biz', 'siz', 'onlar', 'var', 'yok', 'ile', 'için', 'ne', 'kim', 'nasıl', 'nerede', 'neden', 'ama', 'da', 'de', 'çok', 've', 'veya', 'değil', 'olmak', 'yapmak', 'gelmek', 'gitmek', 'demek', 'bilmek', 'merhaba', 'günaydın', 'iyi', 'akşamlar', 'teşekkür', 'ederim', 'lütfen', 'evet', 'hayır', 'bey', 'hanım', 'bu', 'şu', 'bir', 'bir', 'olan', 'gibi', 'daha'], lang: 'tr' },
  // Swedish
  { words: ['jag', 'du', 'han', 'hon', 'vi', 'ni', 'de', 'är', 'med', 'för', 'vad', 'vem', 'hur', 'var', 'när', 'varför', 'men', 'också', 'mycket', 'och', 'eller', 'inte', 'vara', 'ha', 'göra', 'kunna', 'vilja', 'ska', 'måste', 'hej', 'god', 'morgon', 'kväll', 'tack', 'ja', 'nej', 'herr', 'fru', 'det', 'den', 'ett', 'en', 'detta', 'denna', 'dessa', 'som', 'på', 'till', 'från', 'av'], lang: 'sv' },
  // Vietnamese (uses Latin with diacritics)
  { words: ['tôi', 'bạn', 'anh', 'chị', 'em', 'chúng', 'họ', 'là', 'có', 'với', 'cho', 'gì', 'ai', 'thế', 'nào', 'đâu', 'khi', 'sao', 'nhưng', 'cũng', 'rất', 'và', 'hoặc', 'không', 'được', 'làm', 'đến', 'đi', 'nói', 'biết', 'xin', 'chào', 'cảm', 'ơn', 'vâng', 'dạ', 'ông', 'bà', 'này', 'đó', 'một', 'những', 'các'], lang: 'vi' },
  // Indonesian/Malay
  { words: ['saya', 'kamu', 'dia', 'kami', 'kita', 'mereka', 'adalah', 'ada', 'dengan', 'untuk', 'apa', 'siapa', 'bagaimana', 'mana', 'kapan', 'mengapa', 'tetapi', 'juga', 'sangat', 'dan', 'atau', 'tidak', 'bisa', 'harus', 'mau', 'tahu', 'halo', 'selamat', 'pagi', 'siang', 'sore', 'malam', 'terima', 'kasih', 'ya', 'bapak', 'ibu', 'ini', 'itu', 'satu', 'yang', 'ke', 'dari', 'pada'], lang: 'id' },
  // Danish
  { words: ['jeg', 'du', 'han', 'hun', 'vi', 'i', 'de', 'er', 'med', 'til', 'hvad', 'hvem', 'hvordan', 'hvor', 'hvornår', 'hvorfor', 'men', 'også', 'meget', 'og', 'eller', 'ikke', 'være', 'have', 'gøre', 'kunne', 'ville', 'skulle', 'hej', 'god', 'morgen', 'aften', 'tak', 'ja', 'nej', 'hr', 'fru', 'det', 'den', 'et', 'en', 'dette', 'denne', 'disse', 'som', 'på', 'af'], lang: 'da' },
  // Norwegian
  { words: ['jeg', 'du', 'han', 'hun', 'vi', 'dere', 'de', 'er', 'med', 'til', 'hva', 'hvem', 'hvordan', 'hvor', 'når', 'hvorfor', 'men', 'også', 'veldig', 'og', 'eller', 'ikke', 'være', 'ha', 'gjøre', 'kunne', 'ville', 'skulle', 'hei', 'god', 'morgen', 'kveld', 'takk', 'ja', 'nei', 'herr', 'fru', 'det', 'den', 'et', 'en', 'dette', 'denne', 'disse', 'som', 'på', 'av'], lang: 'no' },
  // Finnish
  { words: ['minä', 'sinä', 'hän', 'me', 'te', 'he', 'on', 'ovat', 'kanssa', 'varten', 'mitä', 'kuka', 'miten', 'missä', 'milloin', 'miksi', 'mutta', 'myös', 'hyvin', 'ja', 'tai', 'ei', 'olla', 'tehdä', 'voida', 'haluta', 'tietää', 'hei', 'hyvää', 'huomenta', 'iltaa', 'kiitos', 'kyllä', 'herra', 'rouva', 'tämä', 'tuo', 'se', 'yksi', 'joka', 'jossa', 'kun', 'niin', 'että'], lang: 'fi' },
  // Czech
  { words: ['já', 'ty', 'on', 'ona', 'my', 'vy', 'oni', 'je', 'jsou', 's', 'pro', 'co', 'kdo', 'jak', 'kde', 'kdy', 'proč', 'ale', 'také', 'velmi', 'a', 'nebo', 'ne', 'být', 'mít', 'moci', 'chtít', 'vědět', 'ahoj', 'dobrý', 'den', 'večer', 'děkuji', 'ano', 'pan', 'paní', 'to', 'ten', 'ta', 'jeden', 'jedna', 'který', 'která', 'že', 'na', 'od', 'do'], lang: 'cs' },
  // Romanian
  { words: ['eu', 'tu', 'el', 'ea', 'noi', 'voi', 'ei', 'ele', 'este', 'sunt', 'cu', 'pentru', 'ce', 'cine', 'cum', 'unde', 'când', 'de', 'dar', 'și', 'foarte', 'sau', 'nu', 'fi', 'avea', 'face', 'putea', 'vrea', 'ști', 'bună', 'ziua', 'seara', 'mulțumesc', 'da', 'domnul', 'doamna', 'acest', 'această', 'un', 'o', 'care', 'în', 'la', 'pe', 'din'], lang: 'ro' },
  // Hungarian
  { words: ['én', 'te', 'ő', 'mi', 'ti', 'ők', 'van', 'vannak', 'val', 'vel', 'nak', 'nek', 'mi', 'ki', 'hogyan', 'hol', 'mikor', 'miért', 'de', 'is', 'nagyon', 'és', 'vagy', 'nem', 'lenni', 'csinálni', 'tudni', 'akarni', 'szia', 'jó', 'reggelt', 'estét', 'köszönöm', 'igen', 'úr', 'hölgy', 'ez', 'az', 'egy', 'aki', 'amely', 'hogy', 'ban', 'ben', 'ból', 'ből'], lang: 'hu' },
];

// Accent patterns for Latin languages
const ACCENT_PATTERNS: { pattern: RegExp; lang: string }[] = [
  { pattern: /[àâäéèêëïîôùûüÿœæç]/gi, lang: 'fr' },
  { pattern: /[áéíóúüñ¿¡]/gi, lang: 'es' },
  { pattern: /[äöüß]/gi, lang: 'de' },
  { pattern: /[àèéìíîòóùú]/gi, lang: 'it' },
  { pattern: /[àáâãçéêíóôõú]/gi, lang: 'pt' },
  { pattern: /[ąćęłńóśźż]/gi, lang: 'pl' },
  { pattern: /[çğıöşü]/gi, lang: 'tr' },
  { pattern: /[åäö]/gi, lang: 'sv' },
  { pattern: /[àảãáạăằẳẵắặâầẩẫấậèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵđ]/gi, lang: 'vi' },
  { pattern: /[æøå]/gi, lang: 'da' },
  { pattern: /[äöå]/gi, lang: 'fi' },
  { pattern: /[čďěňřšťůž]/gi, lang: 'cs' },
  { pattern: /[ăâîșț]/gi, lang: 'ro' },
  { pattern: /[áéíóöőúüű]/gi, lang: 'hu' },
];

/**
 * Detect the language of the given text
 * @param text - The text to analyze
 * @returns DetectedLanguage object with code, name, nativeName, flag, and confidence
 */
export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.trim().length < 2) {
    return { ...LANGUAGES.en, confidence: 0 };
  }

  const cleanText = text.trim().toLowerCase();
  
  // 1. Check non-Latin scripts first (most accurate)
  for (const { pattern, lang } of SCRIPT_PATTERNS) {
    const matches = cleanText.match(pattern);
    if (matches && matches.length > 0) {
      // Calculate confidence based on proportion of matching characters
      const scriptCharCount = matches.length;
      const totalCharCount = cleanText.replace(/\s/g, '').length;
      const confidence = Math.min(1, scriptCharCount / totalCharCount);
      
      // If significant portion is this script, return it
      if (confidence > 0.3) {
        // Distinguish Russian from Ukrainian (check for specific letters)
        if (lang === 'ru') {
          const ukrainianPattern = /[іїєґ]/gi;
          const ukrainianMatches = cleanText.match(ukrainianPattern);
          if (ukrainianMatches && ukrainianMatches.length > 0) {
            return { ...LANGUAGES.uk, confidence: Math.min(1, confidence + 0.1) };
          }
        }
        return { ...LANGUAGES[lang], confidence: Math.min(1, confidence + 0.2) };
      }
    }
  }

  // 2. Check for Latin scripts with accents
  const accentScores: Record<string, number> = {};
  for (const { pattern, lang } of ACCENT_PATTERNS) {
    const matches = cleanText.match(pattern);
    if (matches) {
      accentScores[lang] = (accentScores[lang] || 0) + matches.length;
    }
  }

  // 3. Check word patterns
  const wordScores: Record<string, number> = {};
  const words = cleanText.split(/\s+/);
  
  for (const { words: langWords, lang } of LATIN_WORD_PATTERNS) {
    let matchCount = 0;
    for (const word of words) {
      // Clean the word of punctuation
      const cleanWord = word.replace(/[.,!?;:'"()]/g, '');
      if (langWords.includes(cleanWord)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      wordScores[lang] = matchCount;
    }
  }

  // 4. Combine scores
  const combinedScores: Record<string, number> = {};
  
  for (const [lang, score] of Object.entries(accentScores)) {
    combinedScores[lang] = (combinedScores[lang] || 0) + score * 2; // Weight accents higher
  }
  
  for (const [lang, score] of Object.entries(wordScores)) {
    combinedScores[lang] = (combinedScores[lang] || 0) + score * 3; // Weight word matches highest
  }

  // 5. Find the best match
  let bestLang = 'en';
  let bestScore = 0;
  
  for (const [lang, score] of Object.entries(combinedScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  // Calculate confidence
  const maxPossibleScore = words.length * 3 + 10; // Rough estimate
  const confidence = bestScore > 0 ? Math.min(0.95, bestScore / maxPossibleScore + 0.3) : 0.2;

  // If no strong match, default to English for Latin text
  if (bestScore === 0 && /^[a-zA-Z\s.,!?'"()-]+$/.test(cleanText)) {
    return { ...LANGUAGES.en, confidence: 0.5 };
  }

  return {
    ...(LANGUAGES[bestLang] || LANGUAGES.en),
    confidence
  };
}

/**
 * Get styling for language indicator
 */
export function getLanguageStyles(code: string): { bg: string; text: string; border: string } {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    // RTL languages - Green
    ar: { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
    he: { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
    
    // Asian languages - Amber/Orange
    zh: { bg: 'bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
    ja: { bg: 'bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30' },
    ko: { bg: 'bg-sky-500/20', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/30' },
    th: { bg: 'bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
    vi: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    
    // Indian languages - Orange
    hi: { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
    bn: { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
    ta: { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
    te: { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
    
    // Cyrillic - Red
    ru: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    uk: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    
    // Greek - Blue
    el: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    
    // Romance languages
    fr: { bg: 'bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30' },
    es: { bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-500/30' },
    it: { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
    pt: { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
    ro: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    
    // Germanic languages
    de: { bg: 'bg-yellow-500/20', text: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-500/30' },
    nl: { bg: 'bg-orange-500/20', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/30' },
    sv: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    da: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    no: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    
    // Other European
    pl: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    cs: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    hu: { bg: 'bg-green-500/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-500/30' },
    fi: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    tr: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    
    // Southeast Asian
    id: { bg: 'bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' },
    ms: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
    
    // English - Default blue
    en: { bg: 'bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  };
  
  return styles[code] || styles.en;
}
