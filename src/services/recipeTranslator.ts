/**
 * @file recipeTranslator.ts
 * @description Translates human natural-language musical vibe prompts into structured JSON "Musical Recipes".
 * Powered by local Ollama qwen2.5:1.5b running in strict JSON mode with zero external cloud dependencies.
 */

import config from '../config.js';
import brainLogger from './brainLogger.js';

export interface MusicalRecipe {
  genreFamily: string;
  subgenres: string[];
  seedArtists: string[];
  targetBpmRange: [number, number];
  eraYears: [number, number];
  targetEnergy: [number, number];
  targetValence: [number, number];
  moodDescriptors: string[];
  harmonicModes: Array<'minor' | 'major' | 'modal'>;
}

const SYSTEM_PROMPT = `You are a master musicologist and AI DJ recipe translator.
Your sole job is to translate human musical vibe prompts into a precise, structured JSON "Musical Recipe".

Respond ONLY with a valid JSON object matching this schema, with NO markdown backticks, NO explanation, and NO prelude:
{
  "genreFamily": string,
  "subgenres": [string, string, string],
  "seedArtists": [string, string, string, string],
  "targetBpmRange": [min_number, max_number],
  "eraYears": [start_year, end_year],
  "targetEnergy": [min_float_0_to_1, max_float_0_to_1],
  "targetValence": [min_float_0_to_1, max_float_0_to_1],
  "moodDescriptors": [string, string, string],
  "harmonicModes": ["minor" | "major" | "modal"]
}`;

export class RecipeTranslatorService {
  private cache = new Map<string, { recipe: MusicalRecipe; expiresAt: number }>();

  /**
   * Translates a human prompt into a structured musical recipe.
   */
  public async translatePrompt(promptText: string): Promise<MusicalRecipe> {
    const key = promptText.trim().toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.recipe;
    }

    const t0 = performance.now();
    try {
      const payload = {
        model: config.OLLAMA_MODEL || 'qwen2.5:1.5b',
        messages: [
          {"role": "system", "content": SYSTEM_PROMPT},
          {"role": "user", "content": `Translate this musical vibe into a Musical Recipe: "${promptText}"`}
        ],
        format: "json",
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      };

      const res = await fetch(`${config.OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        throw new Error(`Ollama chat returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      const content = data?.message?.content;
      if (!content) {
        throw new Error('Empty message content returned from Ollama');
      }

      const parsed: MusicalRecipe = JSON.parse(content);
      const elapsed = Math.round(performance.now() - t0);

      // Validate core required fields
      if (!parsed.seedArtists || !Array.isArray(parsed.seedArtists) || parsed.seedArtists.length === 0) {
        throw new Error('Invalid recipe: seedArtists missing');
      }

      // Ensure valid numbers
      parsed.targetBpmRange = parsed.targetBpmRange || [90, 125];
      parsed.eraYears = parsed.eraYears || [1980, 2025];
      parsed.targetEnergy = parsed.targetEnergy || [0.4, 0.8];

      this.cache.set(key, { recipe: parsed, expiresAt: now + 3600 }); // Cache for 1 hour

      brainLogger.logInteraction({
        timestamp: now,
        model: 'qwen2.5:1.5b',
        action: 'vibe',
        prompt: promptText,
        response: JSON.stringify(parsed, null, 2),
        durationMs: elapsed,
        status: 'success',
      });

      console.log(`[RecipeTranslator] 🍳 Translated "${promptText}" into recipe (${elapsed}ms): Seeds: [${parsed.seedArtists.join(', ')}] | Era: ${parsed.eraYears[0]}-${parsed.eraYears[1]}`);
      return parsed;
    } catch (err) {
      console.warn(`[RecipeTranslator] LLM translation failed for "${promptText}", falling back to heuristic:`, (err as Error).message);
      return this.fallbackHeuristicRecipe(promptText);
    }
  }

  /**
   * Fallback heuristic recipe if Ollama is offline or unbooted.
   */
  private fallbackHeuristicRecipe(prompt: string): MusicalRecipe {
    return {
      genreFamily: 'eclectic',
      subgenres: ['alternative', 'indie', 'crossover'],
      seedArtists: ['Daft Punk', 'The Cure', 'Pink Floyd', 'Radiohead'],
      targetBpmRange: [85, 128],
      eraYears: [1975, 2024],
      targetEnergy: [0.4, 0.8],
      targetValence: [0.4, 0.7],
      moodDescriptors: [prompt],
      harmonicModes: ['minor', 'major'],
    };
  }
}

export const recipeTranslator = new RecipeTranslatorService();
export default recipeTranslator;
