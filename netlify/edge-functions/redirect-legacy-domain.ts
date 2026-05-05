// Netlify Edge Function — runs at the edge before any static asset is served.
// Used to 301 the legacy klubba.golf domain to the primary scluba.com.
// _redirects with Host= conditions doesn't work for aliases sharing a site
// with the primary, so we handle it in code here.

export default async (request: Request) => {
  const url = new URL(request.url);
  if (url.hostname === 'klubba.golf' || url.hostname === 'www.klubba.golf') {
    return Response.redirect(`https://scluba.com${url.pathname}${url.search}`, 301);
  }
  // Otherwise let the request flow through to the normal handler.
};

export const config = { path: '/*' };
