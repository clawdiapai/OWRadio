/**
 * @file test_recipe_translator.ts
 * @description Verifies Ollama Qwen 1.5B musical recipe translation into structured JSON.
 */

import recipeTranslator from '../src/services/recipeTranslator.js';

async function run() {
  console.log('--- Testing RecipeTranslator with Qwen 1.5B ---');

  const prompt = '90s French touch house with funky basslines';
  console.log(`Prompt: "${prompt}"`);

  const t0 = performance.now();
  const recipe = await recipeTranslator.translatePrompt(prompt);
  const elapsed = Math.round(performance.now() - t0);

  console.log(`Received recipe in ${elapsed}ms:`, JSON.stringify(recipe, null, 2));

  if (!recipe.genreFamily || !Array.isArray(recipe.seedArtists) || recipe.seedArtists.length === 0) {
    throw new Error('Recipe validation failed: missing genreFamily or seedArtists');
  }

  if (!recipe.targetBpmRange || recipe.targetBpmRange.length !== 2) {
    throw new Error('Recipe validation failed: invalid targetBpmRange');
  }

  console.log('✅ RecipeTranslator test passed!');
}

run().catch((err) => {
  console.error('❌ RecipeTranslator test failed:', err);
  process.exit(1);
});
