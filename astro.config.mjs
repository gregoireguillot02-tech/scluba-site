// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import sentry from '@sentry/astro';

const SENTRY_DSN = process.env.PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const SENTRY_ENV =
  process.env.SENTRY_ENVIRONMENT ||
  process.env.CONTEXT /* netlify: production | deploy-preview | branch-deploy */ ||
  'development';

// https://astro.build/config
export default defineConfig({
  site: 'https://scluba.com',
  output: 'static',
  adapter: netlify(),
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
