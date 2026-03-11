import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const work = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/work" }),
  schema: ({ image }) =>
    z.object({
      pubDate: z.coerce.date(),
      title: z.string(),
      subtitle: z.string(),
      live: z.string(),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
    }),
});

const store = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/store" }),
  schema: ({ image }) =>
    z.object({
      price: z.string(),
      title: z.string(),
      preview: z.string(),
      checkout: z.string(),
      license: z.string(),
      highlights: z.array(z.string()),
      description: z.string(),
      features: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
        })
      ),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
      images: z.array(
        z.object({
          url: image(),
          alt: z.string(),
        })
      ),
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z.object({
      pubDate: z.coerce.date(),
      title: z.string(),
      subtitle: z.string(),
      live: z.string(),
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

const postsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      pubDate: z.coerce.date(),
      description: z.string(),
      author: z.string(),
      image: z.object({
        url: image(),
        alt: z.string(),
      }),
      tags: z.array(z.string()),
    }),
});

export const collections = {
  work,
  store,
  projects,
  posts: postsCollection,
};
