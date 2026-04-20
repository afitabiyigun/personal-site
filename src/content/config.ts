import { defineCollection, z } from 'astro:content';

const photography = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      location: z.string(),
      caption: z.string(),
      photo: image(),
      exif: z
        .object({
          camera: z.string().optional(),
          lens: z.string().optional(),
          shutter: z.string().optional(),
          aperture: z.string().optional(),
          iso: z.number().optional(),
        })
        .optional(),
    }),
});

const garden = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    updated: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    status: z.enum(['seedling', 'budding', 'evergreen']).default('seedling'),
    confidence: z.number().min(0).max(1).default(0.5),
    links: z.array(z.string()).default([]),
  }),
});

export const collections = { photography, garden };
