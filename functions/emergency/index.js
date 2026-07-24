export async function onRequest(context) {
  const assetUrl = new URL(context.request.url);
  assetUrl.pathname = '/emergency/index.html';

  const response = await context.env.ASSETS.fetch(new Request(assetUrl, context.request));
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  const contactScript = `<script id="eiabi-contact">document.addEventListener('DOMContentLoaded',()=>{const node=document.querySelector('.open-call .placeholder');if(node){const link=document.createElement('a');link.href='mailto:robert@mcc0nnell.org';link.textContent='robert@mcc0nnell.org';node.replaceWith(link)}});</script>`;
  html = html.replace('</body>', contactScript + '\n</body>');

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('content-type', 'text/html; charset=UTF-8');
  headers.set('cache-control', 'no-cache');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
