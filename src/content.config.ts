import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string(),
      period: z.string(),
      role: z.string(),
      organization: z.string(),
      industry: z.string(),
      featured: z.boolean(),
      order: z.number().int().positive(),
      technologies: z.array(z.string()).min(1),
      highlights: z.array(z.string()).min(1).max(3),
      links: z.array(
        z.object({
          label: z.string(),
          url: z.string().url(),
        })
      ),
      logo: z.object({
        url: image(),
        alt: z.string(),
      }),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
    }),
});

export const collections = {
  projects,
};
