import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { firmSchema } from './lib/content/schemas';

/**
 * Firms and their facts.
 *
 * One YAML file per firm, keyed by slug. Facts live here rather than in page
 * code, so a future firm is a data addition rather than a code change. Schema
 * violations fail the build.
 */
const firms = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/firms' }),
  schema: firmSchema,
});

export const collections = { firms };
