const OLD_TITLE = 'The Invisible Labor of Video Relay Service Access';
const NEW_TITLE = 'Video Relay Service Interpreters: Intricacies of Sign Language Access';

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  html = html.replaceAll(OLD_TITLE, NEW_TITLE);
  html = html.replaceAll(
    'brunson (2011) the invisible labor of video relay service access',
    'brunson (2011) video relay service interpreters: intricacies of sign language access'
  );

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('content-type', 'text/html; charset=UTF-8');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
