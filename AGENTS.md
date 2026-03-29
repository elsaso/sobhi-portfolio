# Flaco — agent context

**Flaco** (`@lexington/flaco`) is a personal portfolio and small-business marketing site template: a home page with hero, project and blog previews, dedicated **portfolio** (“work”) case studies, a **projects** showcase, optional **store** product cards, a **blog** with tag pages, form starter pages, and **system** routes for design tokens (colors, typography, buttons, links, overview). Primary use case: freelancers, studios, and creators shipping a polished marketing + content site on Astro.

## Tech stack

| Area | Source |
|------|--------|
| **Astro** | `astro@^6.0.0` (`package.json`) |
| **Tailwind CSS** | `tailwindcss@^4.1.18` with `@tailwindcss/vite@^4.1.18` in `astro.config.mjs` |
| **Plugins** | `@tailwindcss/forms`, `@tailwindcss/typography`, `tailwind-scrollbar-hide` (via `src/styles/global.css` `@plugin`) |
| **Content** | `astro:content` collections with `glob` loaders and `zod` from `astro/zod` (`src/content.config.ts`). Loader patterns include `.md` and `.mdx`; **`@astrojs/mdx` is not in this repo** — default to `.md` unless you add that integration. |
| **Integrations** | `@astrojs/sitemap` in `astro.config.mjs` |
| **RSS** | `@astrojs/rss` (`src/pages/rss.xml.js`) |
| **SEO helpers** | `@lexingtonthemes/seo` — `AstroSeo` in `src/components/fundations/head/Seo.astro` |
| **Other deps** | `reading-time` (blog), Shiki `github-dark` for markdown in `astro.config.mjs` |

## Folder map

| Path | Role |
|------|------|
| `src/pages/` | File-based routes (home, blog, work, store, projects, forms, system, RSS). |
| `src/layouts/` | `BaseLayout.astro`, `BlogLayout.astro`, `WorkLayout.astro`, `StoreLayout.astro`, `ProjectsLayout.astro`. |
| `src/components/` | `global/` (Navigation, Footer, Search), `landing/`, `blog/`, `work/`, `store/`, `projects/`, `stack/`, `assets/`, **`fundations/`** (head, elements, icons, scripts). |
| `src/content/` | Markdown entries: `posts/`, `work/`, `store/`, `projects/`. |
| `src/styles/` | `global.css` — Tailwind v4 `@theme`, fonts, colors, keyframes. |
| `src/images/` | Optimized assets (`astro:assets`); subfolders e.g. `blog/`, `work/`, `store/`, `projects/`, `brands/`, `assets/`. |
| `public/` | **Not present in this repo.** |

Path alias: `@/*` → `src/*` (`tsconfig.json`).

## Content collections

All collections use `defineCollection` + `glob({ base: "./src/content/...", pattern: "**/*.{md,mdx}" })` and Zod schemas with `image()` for image fields (use paths resolvable by Astro’s content image pipeline, as in existing entries under `src/images/...`).

### `work` → `src/content/work/`

- **Required fields:** `pubDate` (date), `title`, `subtitle`, `live` (string URL or placeholder), `image: { url, alt }` (`url` via `image()`).
- **Template:** copy structure from `src/content/work/1.md`.

### `store` → `src/content/store/`

- **Required fields:** `price`, `title`, `preview`, `checkout`, `license`, `highlights` (string array), `description`, `features` (array of `{ title, description }`), `image: { url, alt }`, `images` (array of `{ url, alt }`).
- **Template:** copy structure from `src/content/store/1.md`.

### `projects` → `src/content/projects/`

- **Required fields:** `pubDate`, `title`, `subtitle`, `live`, `logo: { url, alt }`, `image: { url, alt }`.
- **Template:** copy structure from `src/content/projects/1.md`.

### `posts` → `src/content/posts/`

- **Required fields:** `title`, `pubDate`, `description`, `author`, `image: { url, alt }`, `tags` (string array).
- **Template:** copy structure from `src/content/posts/1.md`.

## Routing conventions

| URL pattern | Source |
|-------------|--------|
| `/` | `src/pages/index.astro` |
| `/blog` | `src/pages/blog/index.astro` (lists collection `posts`) |
| `/blog/posts/[id]` | `src/pages/blog/posts/[...slug].astro` — `getStaticPaths` uses `params.slug: entry.id` (entry id from filename/path in the collection). |
| `/blog/tags`, `/blog/tags/[tag]` | `src/pages/blog/tags/index.astro`, `[tag].astro` |
| `/work`, `/work/[id]` | `src/pages/work/index.astro`, `[...slug].astro` (`work` collection) |
| `/store/`, `/store/[id]` | `src/pages/store/index.astro`, `[...slug].astro` (`store` collection) |
| `/projects/`, `/projects/[id]` | `src/pages/projects/index.astro`, `[...slug].astro` (`projects` collection) |
| `/forms/*` | `src/pages/forms/contact.astro`, `signin.astro`, `signup.astro`, `reset.astro` |
| `/system/*` | `src/pages/system/overview.astro`, `colors.astro`, `typography.astro`, `buttons.astro`, `link.astro` |
| `/now`, `/socials`, `/stack`, `/studio` | respective `.astro` pages in `src/pages/` |
| `/rss.xml` | `src/pages/rss.xml.js` |
| `/404` | `src/pages/404.astro` |

**Note:** `rss.xml.js` currently globs `./blog/*.{md,mdx}` under `src/pages/blog/`; blog posts in this theme are loaded from `src/content/posts/` via the content layer. If you rely on RSS, align the feed with `posts` (e.g. `getCollection("posts")`) or move markdown accordingly.

There is **no** changelog or legal section driven by content collections in this repo.

## Customization guide

- **Site URL / domain** — Set `site` in `astro.config.mjs` (currently `https://yourdomain.com`) for canonical URLs and sitemap/RSS `context.site`. Update placeholder URLs and copy in `src/components/fundations/head/Seo.astro` (`canonical`, `openGraph`, `twitter`) to match production.
- **Brand colors & typography** — Edit `src/styles/global.css`: `@theme` blocks (`--font-sans`, `--font-display`, `--font-mono`, `--color-accent-*`, `--color-base-*`, animations, shadows).
- **Navigation / footer** — `src/components/global/Navigation.astro` (`navLinks`, brand text, auxiliary links). `src/components/global/Footer.astro` (logo, copyright, social links).
- **Global shell** — `src/layouts/BaseLayout.astro` imports global CSS, `BaseHead`, `Navigation`, `Footer`, `Search`, `ThemeToggle`. **`<head>` composition** — `src/components/fundations/head/BaseHead.astro` pulls in `Seo`, `Meta`, `Fonts`, `Favicons`, `FuseJS`, `ToggleLocalStorage`.

## Commands

From the project root (see `README.md`):

| Command | Action |
|--------|--------|
| `npm install` | Install dependencies |
| `npm run dev` | Dev server |
| `npm run build` | Production build → `./dist/` |
| `npm run preview` | Preview production build |
| `npm run astro ...` | Astro CLI |
| `npm run astro --help` | Astro CLI help |

## Guardrails

- Do **not** rename the `src/components/fundations/` folder or its `fundations` spelling — it is referenced throughout imports and comments.
- Do **not** widen Zod schemas in `src/content.config.ts` without updating every layout/page/component that reads `entry.data` (e.g. `BlogLayout`, `WorkLayout`, cards, search index).
- Prefer **minimal diffs** and patterns already used in neighboring files.
- Do **not** add dependencies to docs that are not listed in `package.json`.

## Lexington Themes — docs & support

Use the same link pattern as `README.md`:

- Theme specs: https://lexingtonthemes.com/templates/flaco  
- Documentation: https://lexingtonthemes.com/documentation  
- Changelog: https://lexingtonthemes.com/changelog/flaco  
- Support: https://lexingtonthemes.com/legal/support/  
- Bundle: https://lexingtonthemes.com  

Publisher: **Lexington Themes** — https://lexingtonthemes.com/
