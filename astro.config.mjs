// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro';

const SENTRY_DSN = process.env.PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const SENTRY_ENV =
  process.env.SENTRY_ENVIRONMENT ||
  // Cloudflare Pages : CF_PAGES_BRANCH = main → production, autres branches = branch name.
  (process.env.CF_PAGES_BRANCH === 'main' ? 'production' : process.env.CF_PAGES_BRANCH) ||
  'development';

// https://astro.build/config
export default defineConfig({
  site: 'https://scluba.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
  }),
  integrations: [
    ...(SENTRY_DSN
      ? [
          sentry({
            dsn: SENTRY_DSN,
            environment: SENTRY_ENV,
            sendDefaultPii: false,
            tracesSampleRate: 0.1,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            sourceMapsUploadOptions: { enabled: false },
          }),
        ]
      : []),
  ],
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
