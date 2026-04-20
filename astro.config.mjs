import { defineConfig } from 'astro/config';

// Change REPO_NAME to whatever you call the GitHub repo.
// If you ever move this to afitabiyigun.github.io (root site), set `base` to '/'.
const REPO_NAME = 'personal-site';

export default defineConfig({
  site: 'https://afitabiyigun.github.io',
  base: `/${REPO_NAME}`,
  trailingSlash: 'ignore',
  build: {
    assets: 'assets',
  },
  vite: {
    ssr: {
      noExternal: ['gsap'],
    },
  },
});
