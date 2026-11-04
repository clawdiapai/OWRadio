/**
 * @file languageDetector.ts
 * @description Fast, offline, heuristic language classification for tracks.
 * Identifies whether a track belongs to a foreign language (French, Spanish, German, Italian, Portuguese, Slavic, East Asian)
 * to enforce autonomous foreign language discovery cooldowns (e.g. no 2 French songs within 120 minutes).
 */

export type TrackLanguage = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'other_foreign';

export const LANGUAGE_METADATA: Record<TrackLanguage, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇬🇧' },
  fr: { name: 'French', flag: '🇫🇷' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  de: { name: 'German', flag: '🇩🇪' },
  it: { name: 'Italian', flag: '🇮🇹' },
  pt: { name: 'Portuguese', flag: '🇵🇹' },
  ru: { name: 'Russian', flag: '🇷🇺' },
  ja: { name: 'Japanese', flag: '🇯🇵' },
  ko: { name: 'Korean', flag: '🇰🇷' },
  other_foreign: { name: 'Foreign / International', flag: '🌍' },
};

// Prominent Francophone artists whose tracks are predominantly in French
const FRENCH_ARTISTS = new Set([
  'aya nakamura', 'dadju', 'gims', 'maître gims', 'stromae', 'indila', 'vianney',
  'jul', 'ninho', 'booba', 'orelsan', 'angèle', 'kendji girac', 'claudio capéo',
  'mhd', 'tayc', 'tiakola', 'zaz', 'louane', 'slimane', 'vitaa', 'fréro delavega',
  'soolking', 'sch', 'damso', 'hamza', 'kaaris', 'gradur', 'pnl', 'soprano',
  'black m', 'sexion d\'assaut', 'christophe', 'edith piaf', 'charles aznavour',
  'jacques brel', 'georges brassens', 'serge gainsbourg', 'france gall', 'claude françois',
  'johnny hallyday', 'jean-jacques goldman', 'mylène farmer', 'francis cabrel',
  'renaud', 'alain souchon', 'mc solaar', 'kery james', 'disiz', 'vald', 'lomepal',
  'roméo elvis', 'therapie taxi', 'la femme', 'clara luciani', 'pomme', 'yelle',
  'leto', 'gazo', 'heuss l\'enfoiré', 'plk', 'dinos', 'rk', 'koba lad', 'maes',
  'amir', 'hervé', 'ben mazué', 'grand corps malade', 'gaël faye', 'feu! chatterton',
]);

// Prominent Spanish/Latin artists
const SPANISH_ARTISTS = new Set([
  'bad bunny', 'j balvin', 'rosalía', 'maluma', 'daddy yankee', 'ozuna',
  'enrique iglesias', 'rauw alejandro', 'peso pluma', 'bizarrap', 'karol g',
  'feid', 'c. tangana', 'luis fonsi', 'ricky martin', 'anuel aa', 'nicky jam',
  'becky g', 'farruko', 'sebastian yatra', 'manuel turizo', 'quevedo', 'duki',
  'calle 13', 'residente', 'alvaro soler', 'morat', 'chayanne', 'juanes',
  'alejandro sanz', 'camilo', 'romeo santos', 'prince royce', 'gente de zona',
]);

// Prominent German artists
const GERMAN_ARTISTS = new Set([
  'rammstein', 'peter fox', 'seeed', 'cro', 'herbert grönemeyer', 'alligatoah',
  'sido', 'bonez mc', 'raf camora', 'apache 207', 'kraftklub', 'annenmaykantereit',
  'casper', 'marteria', 'kontra k', 'capital bra', 'samra', 'helene fischer',
]);

// Prominent Italian artists
const ITALIAN_ARTISTS = new Set([
  'eros ramazzotti', 'laura pausini', 'andrea bocelli', 'tiziano ferro',
  'mahmood', 'fedez', 'blanco', 'sfera ebbasta', 'ultimo', 'annalisa',
  'madame', 'geolier', 'lazza', 'zucchero', 'lucio dalla', 'adriano celentano',
  'toto cutugno', 'nek', 'giorgia', 'salmo', 'ghali', 'rkomi', 'irama', 'tedua',
  'måneskin', 'maneskin',
]);

// Distinct French patterns: contractions (d'or, j'pense, l'amour), enclitics (oublie-le, dis-moi), diacritics, stopwords
const FRENCH_CONTRACTIONS = /\b([cdjlnmstqu]'\w+)\b/i;
const FRENCH_ENCLITICS = /\b\w+-(le|la|les|moi|toi|lui|nous|vous|leur|en|y)\b/i;
const FRENCH_WORDS = /\b(le|la|les|une|des|dans|pour|avec|sans|sur|sous|chez|vers|mais|donc|alors|toujours|jamais|rien|tous|toute|toutes|mon|ton|son|notre|votre|leur|leurs|moi|toi|lui|elle|nous|vous|eux|elles|cet|cette|ces|quoi|dont|quand|comment|pourquoi|combien|beau|belle|beaux|belles|grand|grande|petit|petite|bonne|cœur|coeur|amour|monde|nuit|jour|yeux|chanson|soleil|femme|homme|fille|garçon|parole|paroles|papaoutai|comportement|compliqué|dernière|danse|voilà|merci|souvenirs|matin|soir|demain|hier|pluie|vent|terre|ciel|étoile|étoiles|corps|âme|regard|bras|mains|voix|mots|silence|secret|promesse|chemin|route|ville|paris|arbre|fleur|fleurs|oiseau|oiseaux|rêve|rêves|peur|joie|peine|larme|larmes|adieu|pardon|aubaine|d'étain|j'pense|zoblazo)\b/i;

// Spanish patterns: inverted punctuation, ñ, distinctive words
const SPANISH_CHARS = /[ñ¿¡]/i;
const SPANISH_WORDS = /\b(unos|unas|del|nuestro|nuestra|nuestros|nuestras|mío|tuyo|suyo|usted|nosotros|vosotros|ustedes|pero|sino|porque|para ti|sobre|entre|hacia|hasta|desde|como|más|muy|todos|toda|todas|nada|nadie|nunca|jamás|siempre|también|tampoco|qué|quién|quien|dónde|donde|cuándo|cuando|cómo|corazón|noche|vida|días|mujer|hombre|beso|besos|quiero|te amo|tengo|estoy|eres|somos|canción|cielo|ojos|baila|bailando|despacito|música|amigo|amiga|adiós|gracias|señorita|playa|verano|loco|loca|mami|papi|dembow|perreo|hermosa|sueño|sueños)\b/i;

// German patterns: ß, distinctive words
const GERMAN_CHARS = /[ß]/i;
const GERMAN_WORDS = /\b(der|das|den|dem|des|ein|eine|einen|einem|einer|eines|und|oder|aber|mit|ohne|für|von|zu|aus|bei|nach|auf|unter|über|vor|hinter|zwischen|durch|gegen|nicht|nichts|nie|immer|auch|sehr|ganz|alle|alles|ich|du|wir|ihr|mich|dich|uns|euch|ihm|ihnen|mein|dein|sein|unser|euer|sind|waren|wird|werden|haben|hatte|hast|liebe|herz|nacht|welt|zeit|leben|traum|augen|wunderbar|schön|danke|bitte|sterne|himmel|sonne|mond|sommer|winter|meer|wasser|feuer|mensch|menschen|straße|stadt|sehnsucht)\b/i;

// Italian patterns
const ITALIAN_WORDS = /\b(dello|della|dei|degli|delle|allo|alla|agli|alle|nello|nella|nei|negli|nelle|senza|tra|fra|sul|sulla|dal|dalla|anche|più|molto|tutti|tutta|tutte|lui|lei|noi|voi|loro|nostro|vostro|amore|cuore|notte|vida|tempo|giorno|occhi|sole|stella|stelle|canzone|bello|bella|bellissimo|buonanotte|buongiorno|grazie|ciao|arrivederci|senza te|ti amo|felicità|mare|ragazza|ragazzo|bacio|baci|cielo|fuoco|anima|torna|casa)\b/i;

// Portuguese patterns
const PORTUGUESE_CHARS = /[ãõ]/i;
const PORTUGUESE_WORDS = /\b(uns|umas|dos|das|aos|às|pelo|pela|pelos|pelas|sobre|entre|não|mais|muito|tudo|todos|toda|todas|nada|ele|ela|nós|eles|elas|meu|minha|teu|tua|seu|sua|nosso|nossa|coração|tempo|olhos|saudade|saudades|você|vocês|obrigado|obrigada|valeu|menina|garota|praia|carnaval|favela|samba|beijo|beijos|sonho|sonhos)\b/i;

// Distinctive English markers
const ENGLISH_MARKERS = /\b(the|and|you|your|don't|can't|won't|i'm|it's|we're|they're|meet|love|night|day|heart|time|live|remaster|version|album|edition)\b/i;

// Script Regexes
const CYRILLIC_REGEX = /[\u0400-\u04FF]/;
const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF]/;
const KANA_REGEX = /[\u3040-\u30FF]/;
const ARABIC_REGEX = /[\u0600-\u06FF]/;
const GREEK_REGEX = /[\u0370-\u03FF]/;

/**
 * Normalizes string for linguistic token matching.
 */
function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[()[\]{}"'.,!?;:/\\~`@#$%^&*+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies track language based on Title, Artist, and Album metadata.
 * Returns 'en' for English or universal tracks, or specific code ('fr', 'es', etc.) for foreign languages.
 */
export function detectTrackLanguage(title: string, artist: string, album?: string): TrackLanguage {
  const rawCombined = `${title} ${artist} ${album || ''}`;
  const lowerArtist = artist.toLowerCase().trim();
  const lowerTitle = title.toLowerCase().trim();

  // 1. Check Non-Latin Alphabets first
  if (CYRILLIC_REGEX.test(rawCombined)) return 'ru';
  if (HANGUL_REGEX.test(rawCombined)) return 'ko';
  if (KANA_REGEX.test(rawCombined)) return 'ja';
  if (ARABIC_REGEX.test(rawCombined)) return 'other_foreign';
  if (GREEK_REGEX.test(rawCombined)) return 'other_foreign';

  // 2. Check Known Artists FIRST
  if (GERMAN_ARTISTS.has(lowerArtist)) return 'de';
  if (ITALIAN_ARTISTS.has(lowerArtist)) return 'it';
  if (FRENCH_ARTISTS.has(lowerArtist)) return 'fr';
  if (SPANISH_ARTISTS.has(lowerArtist)) return 'es';

  // 2b. Strong English Marker Guard:
  // If title has prominent English keywords and no foreign characters/contractions, avoid false positives
  const hasEnglishMarkers = ENGLISH_MARKERS.test(lowerTitle);
  const minMatchesRequired = hasEnglishMarkers ? 2 : 1;

  // 3. Check German (distinct characters & vocabulary)
  if (GERMAN_CHARS.test(title) || GERMAN_WORDS.test(lowerTitle)) {
    const cleaned = cleanText(title);
    const tokens = cleaned.split(' ');
    let matches = 0;
    for (const t of tokens) {
      if (GERMAN_WORDS.test(` ${t} `)) matches++;
    }
    if (GERMAN_CHARS.test(title) || matches >= minMatchesRequired) {
      return 'de';
    }
  }

  // 4. Check Italian
  if (ITALIAN_WORDS.test(lowerTitle)) {
    const cleaned = cleanText(title);
    const tokens = cleaned.split(' ');
    let matches = 0;
    for (const t of tokens) {
      if (ITALIAN_WORDS.test(` ${t} `)) matches++;
    }
    if (matches >= minMatchesRequired) {
      return 'it';
    }
  }

  // 5. Check French (contractions, enclitics, vocabulary)
  if (FRENCH_CONTRACTIONS.test(title) || FRENCH_ENCLITICS.test(title)) {
    return 'fr';
  }
  if (FRENCH_WORDS.test(lowerTitle)) {
    const cleaned = cleanText(title);
    const tokens = cleaned.split(' ');
    let matches = 0;
    for (const t of tokens) {
      if (FRENCH_WORDS.test(` ${t} `)) matches++;
    }
    if (matches >= minMatchesRequired) {
      return 'fr';
    }
  }

  // 6. Check Spanish
  if (SPANISH_CHARS.test(title) || SPANISH_WORDS.test(lowerTitle)) {
    const cleaned = cleanText(title);
    const tokens = cleaned.split(' ');
    let matches = 0;
    for (const t of tokens) {
      if (SPANISH_WORDS.test(` ${t} `)) matches++;
    }
    if (SPANISH_CHARS.test(title) || matches >= minMatchesRequired) {
      return 'es';
    }
  }

  // 7. Check Portuguese
  if (PORTUGUESE_CHARS.test(title) || PORTUGUESE_WORDS.test(lowerTitle)) {
    const cleaned = cleanText(title);
    const tokens = cleaned.split(' ');
    let matches = 0;
    for (const t of tokens) {
      if (PORTUGUESE_WORDS.test(` ${t} `)) matches++;
    }
    if (PORTUGUESE_CHARS.test(title) || matches >= minMatchesRequired) {
      return 'pt';
    }
  }

  return 'en';
}

export default {
  detectTrackLanguage,
};