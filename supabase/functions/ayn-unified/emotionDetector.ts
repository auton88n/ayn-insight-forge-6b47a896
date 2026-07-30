// Emotion detection for AI responses - extracted to reduce bundle size

export function detectResponseEmotion(content: string): string {
  const lower = content.toLowerCase();
  const scores: Record<string, number> = {
    calm: 0, happy: 0, excited: 0, thinking: 0, curious: 0,
    frustrated: 0, supportive: 0, comfort: 0, sad: 0, mad: 0, bored: 0
  };
  
  // Pattern weights
  const patterns: Array<{ emotion: string; weight: number; patterns: RegExp[] }> = [
    {
      emotion: 'excited',
      weight: 4,
      patterns: [
        /amazing/g, /incredible/g, /fantastic/g, /wonderful/g, /excellent/g,
        /brilliant/g, /outstanding/g, /wow/g, /awesome/g, /great news/g,
        /congratulations/g, /well done/g, /great job/g, /perfect/g, /love it/g,
        /exciting/g, /thrilled/g, /superb/g, /phenomenal/g, /fabulous/g,
        /🎉/g, /🎊/g, /✨/g, /🚀/g, /🔥/g, /💪/g, /🤩/g, /😍/g, /🥳/g,
        /مذهل/g, /رائع جداً/g, /متحمس/g, /ممتاز/g, /عظيم/g
      ]
    },
    {
      emotion: 'happy',
      weight: 2,
      patterns: [
        /glad/g, /happy to/g, /happy/g, /pleased/g, /good/g, /nice/g, /great/g,
        /sure thing/g, /of course/g, /absolutely/g, /definitely/g, /yes/g,
        /done/g, /completed/g, /success/g, /worked/g, /fixed/g, /solved/g,
        /here you go/g, /enjoy/g, /hope this helps/g, /you're welcome/g,
        /😊/g, /👍/g, /😄/g, /🙂/g,
        /رائع/g, /تمام/g, /حسناً/g, /جيد/g, /سعيد/g
      ]
    },
    {
      emotion: 'thinking',
      weight: 2,
      patterns: [
        /let me/g, /i'll/g, /checking/g, /looking/g, /analyzing/g,
        /processing/g, /calculating/g, /considering/g, /evaluating/g,
        /finding/g, /searching/g, /hmm/g, /let's see/g, /one moment/g,
        /working on/g, /figuring out/g, /based on/g, /according to/g,
        /formula/g, /equation/g, /compute/g, /step by step/g,
        /أفكر/g, /أحلل/g, /دعني/g, /سأبحث/g, /حساب/g
      ]
    },
    {
      emotion: 'curious',
      weight: 4,
      patterns: [
        /interesting/g, /fascinating/g, /intriguing/g, /curious/g, /wonder/g,
        /tell me more/g, /what about/g, /how about/g, /what if/g,
        /have you tried/g, /have you considered/g, /i'd love to know/g,
        /explore/g, /discover/g, /learn more/g, /investigate/g,
        /🤔/g, /🧐/g, /👀/g,
        /مثير للاهتمام/g, /أتساءل/g, /ما رأيك/g, /فضولي/g
      ]
    },
    {
      emotion: 'supportive',
      weight: 4,
      patterns: [
        /here to help/g, /i'm here/g, /i understand/g, /i get it/g,
        /you're not alone/g, /we can/g, /let's work/g, /together/g,
        /i can help/g, /happy to help/g, /glad to help/g, /count on me/g,
        /keep going/g, /believe in you/g, /you've got/g, /proud of/g,
        /أنا هنا/g, /أفهمك/g, /معك/g, /سأساعدك/g
      ]
    },
    {
      emotion: 'comfort',
      weight: 4,
      patterns: [
        /don't worry/g, /no worries/g, /it's okay/g, /it's fine/g, /no problem/g,
        /take your time/g, /no rush/g, /you've got this/g, /you can do/g,
        /everything will/g, /it's normal/g, /totally fine/g, /relax/g,
        /understandable/g, /natural to/g, /common/g, /don't stress/g,
        /💚/g, /🤗/g, /💙/g,
        /لا تقلق/g, /لا مشكلة/g, /خذ وقتك/g, /استرخ/g
      ]
    },
    {
      emotion: 'frustrated',
      weight: 3,
      patterns: [
        /unfortunately/g, /however/g, /issue/g, /problem/g,
        /difficult/g, /challenging/g, /tricky/g, /complex/g, /complicated/g,
        /error/g, /failed/g, /unable/g, /can't seem/g, /cannot/g,
        /doesn't work/g, /not working/g, /broken/g, /stuck/g,
        /😤/g, /😓/g,
        /للأسف/g, /لا أستطيع/g, /مشكلة/g, /صعب/g
      ]
    },
    {
      emotion: 'sad',
      weight: 3,
      patterns: [
        /sorry to hear/g, /i'm sorry/g, /so sorry/g, /apologize/g, /apologies/g,
        /regret/g, /sad to/g, /bad news/g, /i'm afraid/g, /disappointed/g,
        /condolences/g, /sympathy/g, /tough time/g, /feel for you/g,
        /😢/g, /😔/g, /💔/g,
        /آسف/g, /حزين/g, /أعتذر/g, /مؤسف/g
      ]
    },
    {
      emotion: 'mad',
      weight: 4,
      patterns: [
        /angry/g, /furious/g, /outrageous/g, /unacceptable/g, /ridiculous/g,
        /terrible/g, /awful/g, /worst/g, /hate/g, /absurd/g,
        /infuriating/g, /annoying/g, /irritating/g, /disgraceful/g,
        /😡/g, /🤬/g, /💢/g,
        /غاضب/g, /مستفز/g, /سخيف/g
      ]
    },
    {
      emotion: 'bored',
      weight: 3,
      patterns: [
        /whatever/g, /i guess/g, /if you say/g, /meh/g, /boring/g,
        /dull/g, /same old/g, /nothing new/g, /routine/g, /mundane/g,
        /not exciting/g, /yawn/g, /blah/g,
        /😑/g, /😴/g, /🥱/g,
        /ممل/g, /عادي/g, /روتيني/g
      ]
    },
    {
      emotion: 'calm',
      weight: 1,
      patterns: [
        /^hello$/g, /^hi$/g, /^hey$/g, /greetings/g,
        /how can i/g, /how may i/g, /what can i/g
      ]
    }
  ];
  
  for (const { emotion, weight, patterns: patternList } of patterns) {
    for (const p of patternList) {
      const m = lower.match(p);
      if (m) scores[emotion] += m.length * weight;
    }
  }
  
  let maxEmotion = 'calm';
  let maxScore = 0;
  
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxEmotion = emotion;
    }
  }
  
  return maxScore >= 1 ? maxEmotion : 'calm';
}

export function detectUserEmotion(message: string): string {
  const lower = message.toLowerCase();
  const scores: Record<string, number> = {
    neutral: 0, angry: 0, frustrated: 0, happy: 0, sad: 0, excited: 0, curious: 0
  };

  const patterns: Array<{ emotion: string; weight: number; patterns: RegExp[] }> = [
    {
      emotion: 'angry',
      weight: 5,
      patterns: [
        /stupid/g, /idiot/g, /dumb/g, /shit/g, /fuck/g, /suck/g, /trash/g,
        /useless/g, /worst/g, /hate you/g, /piece of/g, /shut up/g, /go away/g,
        /غبي/g, /حمار/g, /تافه/g, /اسكت/g, /كرهتك/g,
        /😡/g, /🤬/g, /💢/g, /🖕/g
      ]
    },
    {
      emotion: 'frustrated',
      weight: 4,
      patterns: [
        /doesn'?t work/g, /not working/g, /broken/g, /wrong/g, /bad/g,
        /can'?t believe/g, /annoying/g, /irritating/g, /ugh/g, /come on/g,
        /again\?/g, /still not/g, /why can'?t/g, /what the/g,
        /مايشتغل/g, /ما يشتغل/g, /غلط/g, /خربان/g,
        /😤/g, /😓/g, /🙄/g
      ]
    },
    {
      emotion: 'happy',
      weight: 3,
      patterns: [
        /thank/g, /thanks/g, /love it/g, /perfect/g, /great/g, /awesome/g,
        /amazing/g, /good job/g, /well done/g, /nice/g, /cool/g,
        /شكرا/g, /ممتاز/g, /رائع/g, /حلو/g,
        /😊/g, /😄/g, /👍/g, /❤️/g, /🙏/g
      ]
    },
    {
      emotion: 'sad',
      weight: 3,
      patterns: [
        /sad/g, /depressed/g, /lonely/g, /crying/g, /hurt/g, /lost/g,
        /miss/g, /grief/g, /heartbroken/g, /give up/g, /hopeless/g,
        /حزين/g, /زعلان/g, /مكتئب/g, /ضايق/g,
        /😢/g, /😭/g, /💔/g, /😞/g
      ]
    },
    {
      emotion: 'excited',
      weight: 3,
      patterns: [
        /wow/g, /omg/g, /can'?t wait/g, /so excited/g, /yay/g, /woah/g,
        /!!+/g, /let'?s go/g,
        /🎉/g, /🚀/g, /🔥/g, /🤩/g
      ]
    },
    {
      emotion: 'curious',
      weight: 2,
      patterns: [
        /how do/g, /what is/g, /can you explain/g, /tell me about/g,
        /i wonder/g, /curious/g, /what if/g,
        /كيف/g, /ايش/g, /وش/g, /ليش/g,
        /🤔/g, /🧐/g
      ]
    }
  ];

  for (const { emotion, weight, patterns: patternList } of patterns) {
    for (const p of patternList) {
      const m = lower.match(p);
      if (m) scores[emotion] += m.length * weight;
    }
  }

  let maxEmotion = 'neutral';
  let maxScore = 0;
  for (const [emotion, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxEmotion = emotion;
    }
  }

  return maxScore >= 2 ? maxEmotion : 'neutral';
}

export function detectLanguage(message: string): string {
  if (!message || message.trim().length < 2) return 'en';
  const t = message.trim();
  // Non-Latin scripts — high confidence from character presence
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(t)) return 'ar';   // Arabic
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(t)) return 'zh';   // Chinese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';   // Japanese
  if (/[\uAC00-\uD7AF]/.test(t))                return 'ko';   // Korean
  if (/[\u0590-\u05FF]/.test(t))                return 'he';   // Hebrew
  if (/[\u0E00-\u0E7F]/.test(t))                return 'th';   // Thai
  if (/[\u0900-\u097F]/.test(t))                return 'hi';   // Hindi
  // Cyrillic — check Ukrainian first
  if (/[\u0400-\u04FF]/.test(t)) {
    if (/[іїєґ]/i.test(t)) return 'uk';
    return 'ru';
  }
  // Latin language detection via common words
  const l = t.toLowerCase();
  const words = new Set(l.match(/\b[a-z]{2,}\b/g) || []);
  const score = (list: string[]) => list.filter(w => words.has(w)).length;
  const scores: Record<string,number> = {
    ar: 0, // already handled above
    fr: score(['je','tu','nous','vous','est','sont','avec','pour','dans','que','les','des','une','sur','pas','plus','très','aussi','comme','mais','bonjour','merci']),
    es: score(['yo','está','con','para','qué','cómo','pero','muy','también','más','todo','hola','gracias','buenos','días','usted','una','los','las','por']),
    de: score(['ich','du','er','sie','wir','ist','sind','mit','für','auf','was','aber','auch','sehr','und','oder','nicht','guten','morgen','danke','bitte','das','ein','der','die']),
    it: score(['io','tu','lui','lei','noi','con','per','che','chi','come','dove','perché','ma','molto','anche','più','tutto','bene','ciao','grazie','della','questo']),
    pt: score(['eu','está','com','para','que','quem','como','onde','mas','muito','também','mais','tudo','bem','olá','obrigado','não','sim','uma','dos','você']),
    tr: score(['ben','sen','biz','var','yok','ile','için','ne','ama','çok','ve','veya','değil','merhaba','evet','hayır','bu','bir','olan','gibi','daha']),
    nl: score(['ik','jij','hij','zij','wij','met','voor','wat','wie','hoe','maar','ook','zeer','en','of','niet','hallo','dank','bedankt','het','een','de']),
    pl: score(['ja','ty','on','ona','my','wy','jest','są','dla','co','kto','jak','gdzie','ale','też','bardzo','nie','być','mieć','cześć','dziękuję','tak']),
    ru: 0, // handled by Cyrillic above
    en: score(['the','a','an','is','are','was','were','have','has','will','would','could','should','this','that','with','from','they','what','which','who','when','where','how','but','and','for','not','you','we','it','be','do','did','can','may','just','ok','okay','yes','no','hi','hello','hey','thanks','please','help','want','need','know','think','see','get','make','go','come','tell','say']),
  };
  let best = 'en'; let bestScore = scores.en;
  for (const [lang, s] of Object.entries(scores)) {
    if (s > bestScore) { best = lang; bestScore = s; }
  }
  // If no word matched at all but text is clearly Latin → English
  return bestScore > 0 ? best : 'en';
}
