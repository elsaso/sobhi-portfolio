import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL;

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
      skipInline: false,
      drafts: false,
    },
  },
  site,
  integrations: site ? [sitemap()] : [],
});
