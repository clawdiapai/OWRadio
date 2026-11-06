/**
 * @file tasteRadarChart.ts
 * @description Multi-Axis Collective Voice Channel Taste Fingerprint (Radar / Spider Chart).
 * Analyzes active listeners' preferences and currently playing track, projecting them onto 8 acoustic dimensions:
 * Electronic, Rock/Post-Punk, Synth/Retro, Funk/Soul, Hip-Hop, Indie/Alt, Chill/Ambient, and Energy/BPM.
 * Enriched with Last.fm & Deezer collaborative tags and acoustic heuristics.
 */

import config from '../config.js';
import { sqlite } from '../db/index.js';
import featureFlags from './featureFlags.js';
export interface TasteDimension {
  axis: string;
  label: string;
  value: number; // 0 to 100
  dominantTag: string;
}

export interface TrackTasteDimension {
  axis: string;
  label: string;
  value: number; // 0 to 100
  delta: number; // track.value - room.value
  roomValue: number;
  dominantTag: string;
}

export interface TrackTasteFingerprint {
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  bpm?: number;
  dimensions: TrackTasteDimension[];
  dominantGenre: string;
  alignmentScore: number; // 0 to 100 (% vibe match to room)
  energyIndex: number;
}

export interface RoomTasteFingerprint {
  dimensions: TasteDimension[];
  dominantArchetype: string;
  listenerCount: number;
  energyIndex: number;
  asciiChart: string;
  currentTrackFingerprint?: TrackTasteFingerprint | null;
}

export interface CurrentTrackCandidate {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  durationSec?: number;
  bpm?: number;
}

const FALLBACK_LASTFM_KEY = 'b25b959554ed76058ac220b7b2e0a026';

const AXIS_KEYWORDS: Record<string, string[]> = {
  electronic: [
    'electro', 'techno', 'house', 'dance', 'dnb', 'drum and bass', 'drum & bass', 'trance', 'edm', 'dubstep',
    'garage', 'uk garage', 'club', 'bass', 'daft punk', 'justice', 'deadmau5', 'skrillex', 'tiesto',
    'disclosure', 'aphex twin', 'kraftwerk', 'chemical brothers', 'prodigy', 'avicii', 'calvin harris',
    'underworld', 'fatboy slim', 'charlotte de witte', 'fred again', 'bicep', 'four tet', 'jamie xx',
    'deep house', 'tech house', 'hardstyle', 'hardcore', 'breakbeat', 'idm', 'ambient techno',
    'kaytranada', 'flume', 'odesza', 'pendulum', 'noisia', 'sub focus', 'chase & status'
  ],
  rock: [
    'rock', 'punk', 'metal', 'grunge', 'post-punk', 'emo', 'hard rock', 'classic rock',
    'heavy', 'heavy metal', 'progressive metal', 'prog metal', 'progressive rock', 'prog rock',
    'alternative metal', 'alt metal', 'nu metal', 'stoner rock', 'sludge', 'post-metal',
    'math rock', 'industrial rock', 'psychedelic rock', 'thrash', 'death metal', 'guitar',
    // Iconic & Modern Rock/Metal Artists
    'tool', 'a perfect circle', 'deftones', 'korn', 'slipknot', 'system of a down', 'soad',
    'metallica', 'iron maiden', 'black sabbath', 'led zeppelin', 'pink floyd', 'queen', 'ac/dc',
    'nirvana', 'soundgarden', 'alice in chains', 'pearl jam', 'foo fighters', 'linkin park',
    'rage against the machine', 'ratm', 'audioslave', 'mastodon', 'gojira', 'opeth', 'rush',
    'dream theater', 'porcupine tree', 'queens of the stone age', 'qotsa', 'disturbed',
    'avenged sevenfold', 'judas priest', 'megadeth', 'slayer', 'pantera', 'rammstein', 'ghost',
    'meshuggah', 'radiohead', 'muse', 'cure', 'the cure', 'placebo', 'green day', 'blink-182',
    'smashing pumpkins', 'weezer', 'red hot chili peppers', 'rhcp', 'the offspring', 'rise against',
    'royal blood', 'turnstile', 'idles', 'fontaines d.c.', 'bring me the horizon', 'bmth',
    'architects', 'sleep token', 'coheed and cambria', 'the mars volta', 'interpol'
  ],
  synth: [
    'synth', 'synthwave', 'retrofuturistic', '80s', 'outrun', 'darksynth', 'cyberpunk',
    'kavinsky', 'perturbator', 'vaporwave', 'new wave', 'depeche mode', 'new order',
    'carpenter brut', 'the midnight', 'synthpop', 'gunship', 'timecop1983', 'fm-84',
    'mitch murder', 'com truise', 'lazerhawk', 'dance with the dead', 'italo disco',
    'chvrches', 'm83', 'tears for fears', 'duran duran', 'pet shop boys', 'kraftwerk'
  ],
  funk: [
    'funk', 'soul', 'disco', 'groove', 'r&b', 'motown', 'neo-soul', 'boogie', 'prince',
    'earth wind', 'stevie wonder', 'chaka khan', 'funkadelic', 'bruno mars', 'anderson .paak',
    'chic', 'kool & the gang', 'marvin gaye', 'aretha', 'james brown', 'sly stone',
    'curtis mayfield', 'parliament', 'al green', "d'angelo", 'silk sonic', 'khruangbin',
    'thundercat', 'vulfpeck', 'leon bridges', 'erykah badu', 'lauryn hill'
  ],
  hiphop: [
    'hip-hop', 'hiphop', 'hip hop', 'rap', 'trap', 'drill', 'lofi', 'lo-fi', 'boom bap', 'beats',
    'kanye', 'kendrick', 'drake', 'eminem', '2pac', 'notorious', 'j cole', 'travis scott',
    'mf doom', 'wu-tang', 'jay-z', 'nas', 'snoop', 'outkast', 'future', 'metro boomin',
    'asap rocky', 'denzel curry', 'tyler the creator', 'mac miller', 'kid cudi', 'playboi carti',
    'lil uzi', 'post malone', 'childish gambino', 'logic', 'run the jewels', 'freddie gibbs'
  ],
  indie: [
    'indie', 'alternative', 'alt-rock', 'shoegaze', 'dream pop', 'folk', 'indie pop', 'indie rock',
    'tame impala', 'strokes', 'the strokes', 'arctic monkeys', 'mac demarco', 'the 1975',
    'phoebe bridgers', 'vampire weekend', 'mgmt', 'arcade fire', 'the smiths', 'interpol',
    'foals', 'boygenius', 'beach house', 'alvvays', 'clairo', 'japanese breakfast',
    'wet leg', 'the national', 'bon iver', 'mitski', 'snail mail', 'soccer mommy',
    'big thief', 'fleet foxes', 'spoon', 'modest mouse', 'death cab for cutie', 'two door cinema club'
  ],
  chill: [
    'ambient', 'downtempo', 'peaceful', 'meditate', 'meditation', 'sleep', 'relax', 'relaxing',
    'study', 'brian eno', 'tycho', 'bonobo', 'boards of canada', 'zero 7', 'air',
    'moby', 'massive attack', 'portishead', 'thievery corporation', 'piano solo', 'calm',
    'stars of the lid', 'william basinski', 'lo-fi beats', 'spa', 'chillout', 'drone', 'soundscape'
  ],
};

function matchesKeyword(text: string, kw: string): boolean {
  if (kw.includes(' ') || kw.includes('-') || kw.includes('&') || kw.includes('.')) {
    return text.includes(kw);
  }
  // Safe word-boundary match for single words (prevents "cure" inside "secure", "air" inside "stairway", etc.)
  const regex = new RegExp(`(?:^|[^a-z0-9])${kw}(?:$|[^a-z0-9])`, 'i');
  return regex.test(text);
}

class TasteRadarChartService {
  private artistTagCache = new Map<string, { tags: string[]; expiresAt: number }>();

  

  /**
   * Fetches crowdsourced genre tags from Last.fm open API with in-memory caching.
   */
  public async enrichArtistTags(artist: string): Promise<string[]> {
    const norm = artist.trim().toLowerCase();
    if (!norm) return [];
    const now = Date.now();
    const cached = this.artistTagCache.get(norm);
    if (cached && cached.expiresAt > now) {
      return cached.tags;
    }

    const apiKey = config.LASTFM_API_KEY || FALLBACK_LASTFM_KEY;
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artist)}&api_key=${apiKey}&format=json`;

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'OWRadio/2.2' }, signal: AbortSignal.timeout(3500) });
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      const rawTags = data?.toptags?.tag;
      if (Array.isArray(rawTags)) {
        const tags = rawTags.slice(0, 8).map((t: any) => String(t.name).toLowerCase());
        this.artistTagCache.set(norm, { tags, expiresAt: now + 86400000 }); // 24h cache
        return tags;
      }
    } catch {}
    return [];
  }

  /**
   * Computes the 8-axis collective taste fingerprint for active voice listeners,
   * with optional overlay of currently played song and delta calculation.
   */
  public getRoomFingerprint(
    memberUserIds: string[],
    currentTrack?: CurrentTrackCandidate | null,
    livePcmRms?: number
  ): RoomTasteFingerprint {
    if (!featureFlags.isEnabled('feature_taste_radar_chart')) {
      return this.getDefaultFingerprint(memberUserIds.length, currentTrack, livePcmRms);
    }

    // Default neutral baseline values (25% across all genres for clean neutral circle)
    const scores: Record<string, number> = {
      electronic: 25,
      rock: 25,
      synth: 25,
      funk: 25,
      hiphop: 25,
      indie: 25,
      chill: 25,
      energy: 50,
    };

    if (memberUserIds.length > 0) {
      const placeholders = memberUserIds.map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT target_key, target_type, display_name, SUM(affinity_score) as total_affinity
        FROM user_preferences
        WHERE user_id IN (${placeholders}) AND affinity_score > 0
        GROUP BY target_type, target_key
        ORDER BY total_affinity DESC
        LIMIT 60
      `).all(...memberUserIds) as Array<{
        target_key: string;
        target_type: string;
        display_name: string;
        total_affinity: number;
      }>;

      for (const row of rows) {
        const text = `${row.target_key} ${row.display_name}`.toLowerCase();
        const weight = Math.min(row.total_affinity * 4, 30);

        for (const [axis, keywords] of Object.entries(AXIS_KEYWORDS)) {
          for (const kw of keywords) {
            if (matchesKeyword(text, kw)) {
              scores[axis] = Math.min(100, scores[axis] + weight);
              break;
            }
          }
        }
      }
    }

    // Energy dimension based on electronic + hiphop + rock vs chill
    scores.energy = Math.max(10, Math.min(100, Math.round(((scores.electronic + scores.hiphop + scores.rock) / 3) * 0.9 + (100 - scores.chill) * 0.1)));

    const dimensions: TasteDimension[] = [
      { axis: 'electronic', label: '⚡ Electronic / Dance', value: Math.round(scores.electronic), dominantTag: 'Club & Rhythm' },
      { axis: 'rock', label: '🎸 Rock & Post-Punk', value: Math.round(scores.rock), dominantTag: 'Raw Distortion' },
      { axis: 'synth', label: '🌆 Synth & 80s Retro', value: Math.round(scores.synth), dominantTag: 'Analog Arps' },
      { axis: 'funk', label: '🕺 Funk, Soul & Disco', value: Math.round(scores.funk), dominantTag: 'Organic Groove' },
      { axis: 'hiphop', label: '🎤 Hip-Hop & Beats', value: Math.round(scores.hiphop), dominantTag: 'Urban & 808s' },
      { axis: 'indie', label: '☕ Indie & Leftfield', value: Math.round(scores.indie), dominantTag: 'Eclectic Roots' },
      { axis: 'chill', label: '🌌 Chill & Ambient', value: Math.round(scores.chill), dominantTag: 'Atmosphere' },
      { axis: 'energy', label: '🔥 Energy & Intensity', value: Math.round(scores.energy), dominantTag: 'Dynamic Drive' },
    ];

    // Determine Room Archetype (respecting neutral rooms when scores tie)
    const nonEnergy = dimensions.filter((d) => d.axis !== 'energy');
    const sortedNonEnergy = [...nonEnergy].sort((a, b) => b.value - a.value);
    const topDim = sortedNonEnergy[0] || dimensions[0];
    const lowestDim = sortedNonEnergy[sortedNonEnergy.length - 1];

    let dominantArchetype = 'Balanced Eclectic Lounge';
    // Only classify into specific archetype if listeners show a clear preference (spread > 6% and topDim >= 30%)
    if (topDim.value - lowestDim.value > 6 && topDim.value >= 30) {
      if (topDim.axis === 'electronic') dominantArchetype = 'Warehouse Club Rave';
      if (topDim.axis === 'rock') dominantArchetype = 'Post-Punk Underground Cellar';
      if (topDim.axis === 'synth') dominantArchetype = 'Cyberpunk Neon Drive';
      if (topDim.axis === 'funk') dominantArchetype = 'Studio 54 Golden Era Disco';
      if (topDim.axis === 'hiphop') dominantArchetype = 'Low-End Heavy BoomBap Lounge';
      if (topDim.axis === 'indie') dominantArchetype = 'Coffeehouse Melodic Haven';
      if (topDim.axis === 'chill') dominantArchetype = 'Deep Space Ambient Sanctuary';
    }

    // Calculate Current Track Profile & Deltas if track is present
    const currentTrackFingerprint = currentTrack && currentTrack.title
      ? this.getTrackFingerprint(currentTrack, dimensions, livePcmRms)
      : null;

    const asciiChart = this.renderAsciiRadar(dimensions, currentTrackFingerprint);

    return {
      dimensions,
      dominantArchetype,
      listenerCount: memberUserIds.length,
      energyIndex: scores.energy,
      asciiChart,
      currentTrackFingerprint,
    };
  }

  /**
   * Projects a specific track onto the 8 acoustic dimensions and calculates deltas against the room.
   */
  public getTrackFingerprint(
    track: CurrentTrackCandidate,
    roomDimensions?: TasteDimension[],
    livePcmRms?: number
  ): TrackTasteFingerprint {
    // Base genuine acoustic scores start strictly at 0 (zero synthetic bit-shift floors)
    const scores: Record<string, number> = {
      electronic: 0,
      rock: 0,
      synth: 0,
      funk: 0,
      hiphop: 0,
      indie: 0,
      chill: 0,
      energy: 50,
    };

    const bpm = track.bpm;

    // Query extra metadata from SQLite if available
    let dbGenre = track.genre || '';
    let dbMood = '';
    let dbEnergy: number | null = null;
    let dbTags = '';

    try {
      const row = sqlite.prepare(`
        SELECT genre, mood, energy_level, ai_tags_json
        FROM songs
        WHERE (id = ? AND id != '') OR (title = ? AND artist = ?)
        LIMIT 1
      `).get(track.id || '', track.title, track.artist) as {
        genre?: string;
        mood?: string;
        energy_level?: number;
        ai_tags_json?: string;
      } | undefined;

      if (row) {
        if (row.genre) dbGenre = `${dbGenre} ${row.genre}`;
        if (row.mood) dbMood = row.mood;
        if (row.energy_level !== undefined && row.energy_level !== null) dbEnergy = row.energy_level;
        if (row.ai_tags_json) {
          try {
            const parsed = JSON.parse(row.ai_tags_json);
            if (Array.isArray(parsed)) dbTags = parsed.join(' ');
          } catch {}
        }
      }
    } catch {}

    // Check cached Last.fm crowdsourced artist tags
    const normArtist = track.artist.trim().toLowerCase();
    let cachedArtistTags = '';
    const cachedEntry = this.artistTagCache.get(normArtist);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      cachedArtistTags = cachedEntry.tags.join(' ');
    } else {
      // Fire-and-forget background fetch to prime cache for next poll / SSE tick
      void this.enrichArtistTags(track.artist);
    }

    const corpus = `${track.title} ${track.artist} ${track.album || ''} ${dbGenre} ${dbMood} ${dbTags} ${cachedArtistTags}`.toLowerCase();

    // Match keywords against expanded acoustic lexicon with word-boundary awareness
    for (const [axis, keywords] of Object.entries(AXIS_KEYWORDS)) {
      let matches = 0;
      for (const kw of keywords) {
        if (matchesKeyword(corpus, kw)) {
          matches++;
          if (matches === 1) scores[axis] += 65;
          else if (matches === 2) scores[axis] += 25;
          else scores[axis] += 5;
        }
      }
      scores[axis] = Math.min(100, scores[axis]);
    }

    // Energy Index derivation: prefer real-time PCM RMS when audio is live
    if (livePcmRms !== undefined && livePcmRms > 0 && featureFlags.isEnabled('feature_live_pcm_energy')) {
      // True live PCM RMS scaling (0.02 - 0.40 maps dynamically to 15% - 100%)
      scores.energy = Math.max(10, Math.min(100, Math.round(livePcmRms * 280)));
    } else if (dbEnergy !== null && dbEnergy >= 10 && dbEnergy <= 100) {
      scores.energy = dbEnergy;
    } else {
      const rockEnergyBoost = scores.rock >= 50 ? (scores.rock - 50) * 0.4 : 0;
      const electronicEnergyBoost = scores.electronic >= 50 ? (scores.electronic - 50) * 0.35 : 0;
      const genreEnergyBoost = ((scores.electronic + scores.rock + scores.hiphop) / 3) * 0.3;
      const chillDampener = (scores.chill / 100) * 20;
      scores.energy = Math.max(10, Math.min(100, Math.round(50 + genreEnergyBoost + rockEnergyBoost + electronicEnergyBoost - chillDampener)));
    }

    // Chill & Ambient score balance:
    // Only elevate chill if actual chill/ambient keywords or tags are present.
    // Otherwise keep chill low and dampen further for high energy / heavy rock tracks.
    const isExplicitChill = matchesKeyword(corpus, 'ambient') ||
      matchesKeyword(corpus, 'chill') ||
      matchesKeyword(corpus, 'chillout') ||
      matchesKeyword(corpus, 'peaceful') ||
      matchesKeyword(corpus, 'meditate') ||
      matchesKeyword(corpus, 'meditation') ||
      matchesKeyword(corpus, 'downtempo') ||
      matchesKeyword(corpus, 'drone') ||
      matchesKeyword(corpus, 'soundscape');

    if (isExplicitChill) {
      scores.chill = Math.max(scores.chill, 75);
    } else {
      // Non-chill tracks have low chill baseline suppressed by energy and heavy genres
      const acousticIntensity = Math.max(scores.energy, scores.rock, scores.electronic);
      scores.chill = Math.max(5, Math.min(25, Math.round(25 - (acousticIntensity - 50) * 0.25)));
    }

    const roomMap = new Map<string, number>();
    if (roomDimensions) {
      for (const rd of roomDimensions) {
        roomMap.set(rd.axis, rd.value);
      }
    }

    const labels: Record<string, { label: string; tag: string }> = {
      electronic: { label: '⚡ Electronic / Dance', tag: 'Club & Rhythm' },
      rock: { label: '🎸 Rock & Post-Punk', tag: 'Raw Distortion' },
      synth: { label: '🌆 Synth & 80s Retro', tag: 'Analog Arps' },
      funk: { label: '🕺 Funk, Soul & Disco', tag: 'Organic Groove' },
      hiphop: { label: '🎤 Hip-Hop & Beats', tag: 'Urban & 808s' },
      indie: { label: '☕ Indie & Leftfield', tag: 'Eclectic Roots' },
      chill: { label: '🌌 Chill & Ambient', tag: 'Atmosphere' },
      energy: { label: '🔥 Energy & Intensity', tag: 'Dynamic Drive' },
    };

    const dimensions: TrackTasteDimension[] = Object.keys(labels).map((axis) => {
      const val = Math.round(scores[axis]);
      const roomVal = roomMap.get(axis) ?? 25;
      return {
        axis,
        label: labels[axis].label,
        value: val,
        roomValue: roomVal,
        delta: val - roomVal,
        dominantTag: labels[axis].tag,
      };
    });

    // Top Genre Tag
    const nonEnergyDims = dimensions.filter((d) => d.axis !== 'energy');
    const topDim = [...nonEnergyDims].sort((a, b) => b.value - a.value)[0];
    const dominantGenre = topDim ? topDim.label.replace(/^[^\w\s]+/, '').trim() : 'Eclectic';

    // Alignment Score (Cosine Similarity between room and track vectors)
    let dot = 0;
    let normRoom = 0;
    let normTrack = 0;
    for (const d of dimensions) {
      const r = d.roomValue;
      const t = d.value;
      dot += r * t;
      normRoom += r * r;
      normTrack += t * t;
    }
    const cosine = normRoom > 0 && normTrack > 0 ? dot / (Math.sqrt(normRoom) * Math.sqrt(normTrack)) : 0.8;
    // Scale cosine into a natural alignment percentage
    const alignmentScore = Math.max(0, Math.min(100, Math.round(cosine * 100)));

    return {
      trackId: track.id || '',
      title: track.title,
      artist: track.artist,
      album: track.album,
      bpm,
      dimensions,
      dominantGenre,
      alignmentScore,
      energyIndex: scores.energy,
    };
  }

  private getDefaultFingerprint(
    listenerCount: number,
    currentTrack?: CurrentTrackCandidate | null,
    livePcmRms?: number
  ): RoomTasteFingerprint {
    const dimensions: TasteDimension[] = [
      { axis: 'electronic', label: '⚡ Electronic / Dance', value: 45, dominantTag: 'Club & Rhythm' },
      { axis: 'rock', label: '🎸 Rock & Post-Punk', value: 40, dominantTag: 'Raw Distortion' },
      { axis: 'synth', label: '🌆 Synth & 80s Retro', value: 55, dominantTag: 'Analog Arps' },
      { axis: 'funk', label: '🕺 Funk, Soul & Disco', value: 35, dominantTag: 'Organic Groove' },
      { axis: 'hiphop', label: '🎤 Hip-Hop & Beats', value: 30, dominantTag: 'Urban & 808s' },
      { axis: 'indie', label: '☕ Indie & Leftfield', value: 50, dominantTag: 'Eclectic Roots' },
      { axis: 'chill', label: '🌌 Chill & Ambient', value: 45, dominantTag: 'Atmosphere' },
      { axis: 'energy', label: '🔥 Energy & Intensity', value: 50, dominantTag: 'Dynamic Drive' },
    ];

    const currentTrackFingerprint = currentTrack && currentTrack.title
      ? this.getTrackFingerprint(currentTrack, dimensions, livePcmRms)
      : null;

    return {
      dimensions,
      dominantArchetype: 'Balanced Autonomous Blend',
      listenerCount,
      energyIndex: 50,
      asciiChart: this.renderAsciiRadar(dimensions, currentTrackFingerprint),
      currentTrackFingerprint,
    };
  }

  /**
   * Generates a clean, readable ASCII horizontal radar representation for Discord embeds,
   * showing track overlay and delta if a song is playing.
   */
  private renderAsciiRadar(
    dimensions: TasteDimension[],
    trackFingerprint?: TrackTasteFingerprint | null
  ): string {
    const lines = dimensions.map((d) => {
      const trackDim = trackFingerprint?.dimensions.find((td) => td.axis === d.axis);
      const shortLabel = d.label.padEnd(23, ' ');

      if (trackDim) {
        const deltaStr = trackDim.delta >= 0 ? `+${trackDim.delta}%` : `${trackDim.delta}%`;
        const deltaFormatted = `(Δ ${deltaStr.padStart(5, ' ')})`.padEnd(10, ' ');
        const filledTrack = Math.round(trackDim.value / 10);
        const barTrack = '▰'.repeat(filledTrack) + '▱'.repeat(10 - filledTrack);
        return `${shortLabel} ${String(d.value).padStart(2, ' ')}% ➔ ${String(trackDim.value).padStart(2, ' ')}% ${deltaFormatted} [${barTrack}]`;
      } else {
        const filledRoom = Math.round(d.value / 10);
        const barRoom = '▰'.repeat(filledRoom) + '▱'.repeat(10 - filledRoom);
        return `${shortLabel} [${barRoom}] ${String(d.value).padStart(3, ' ')}%`;
      }
    });
    return '```text\n' + lines.join('\n') + '\n```';
  }
}

export const tasteRadarChart = new TasteRadarChartService();
export default tasteRadarChart;
