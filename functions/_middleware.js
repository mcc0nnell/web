const SOURCES = [
  {
    id: 32,
    cat: 'Alert systems',
    auth: 'FCC (2023–2025)',
    title: 'WEA Multilingual and ASL Template Rules',
    find: 'Wireless Emergency Alerts must support pre-installed ASL video templates signed by Certified Deaf Interpreters for 18 common alerts, with device support required in 2028—shifting institutional responsibility upstream of the user.',
    url: 'https://docs.fcc.gov/public/attachments/DA-25-12A1_Rcd.pdf',
    d: ['institutional', 'language', 'tech', 'delay'],
  },
  {
    id: 33,
    cat: 'Washington / policy',
    auth: 'Washington ODHH (2025)',
    title: 'Position Statement on Accessible Emergency Management',
    find: 'Responsibility for timely ASL translation must sit with emergency agencies, not a disability office; translated alerts should be released within an hour so Deaf, hard-of-hearing, and DeafBlind residents receive timely information.',
    url: 'https://www.dshs.wa.gov/sites/default/files/ALTSA/odhh/documents/WA-Position-Statement-on-Accessible-Emergency-Alerts-Final-Draft-9-22-2025.pdf',
    d: ['institutional', 'language', 'delay', 'action'],
  },
  {
    id: 34,
    cat: 'Alert systems',
    auth: 'Villarreal, MacPherson-Krutsky & Painter (2025)',
    title: 'Barriers and Best Practices for Inclusive Emergency Alerts',
    find: 'A synthesis of barriers for people with limited English proficiency and auditory or visual disabilities identifies agency capacity gaps, delayed multi-format messages, inaccessible channels, inaccurate translations, and trust deficits.',
    url: 'https://doi.org/10.1016/j.ijdrr.2025.105581',
    d: ['language', 'institutional', 'search', 'delay', 'trust'],
  },
  {
    id: 35,
    cat: 'Deaf empirical',
    auth: 'Maguire, Boisvert & Villeneuve (2025)',
    title: 'Experiences of DHH People During Emergencies',
    find: 'A scoping study of 48 articles identifies persistent barriers in warnings and alerts, emergency-sector response, and preparedness; multi-format alerts and first-responder training remain under-implemented across OECD countries.',
    url: 'https://doi.org/10.1007/s13753-025-00671-0',
    d: ['language', 'institutional', 'repair', 'action', 'framework'],
  },
  {
    id: 36,
    cat: 'Production',
    auth: 'PMVG / WCTE / EQ4ALL (2025)',
    title: 'NextGen TV ASL Avatar Emergency Alerts',
    find: 'A live ATSC 3.0 demonstration delivered signed emergency alerts as an opt-in broadcast application layer using an animated avatar—showing a production pathway that can reduce reliance on live interpretation.',
    url: 'https://www.publicmediaventure.com/_files/ugd/9cc034_271e15dae0e7495bb407adff86ff7fa1.pdf',
    d: ['language', 'tech', 'institutional'],
  },
];

const COUNTS = {
  delay: 9,
  search: 6,
  verify: 4,
  language: 18,
  repair: 9,
  informal: 5,
  tech: 7,
  trust: 6,
  institutional: 16,
  action: 10,
  framework: 9,
};

const CODES = {
  delay: ['D-01', 'Delay'],
  search: ['D-02', 'Search & channel switching'],
  verify: ['D-03', 'Verification'],
  language: ['D-04', 'Language conversion & comprehension'],
  repair: ['D-05', 'Repair & accommodation'],
  informal: ['D-06', 'Informal-network dependence'],
  tech: ['D-07', 'Technology setup & maintenance'],
  trust: ['D-08', 'Trust & actionable understanding'],
  institutional: ['D-09', 'Institutional capacity failure'],
  action: ['D-10', 'Protective-action consequence'],
  framework: ['FWK', 'Framework & method'],
};

const CLIENT_PATCH = `
<script id="eiabi-corpus-patch">
(() => {
  const sources = ${JSON.stringify(SOURCES)};
  const counts = ${JSON.stringify(COUNTS)};
  const codes = ${JSON.stringify(CODES)};
  const exactTitle = 'Video Relay Service Interpreters: Intricacies of Sign Language Access';

  const esc = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const sourceIds = new Set(
    [...document.querySelectorAll('.rec-id')].map(node => node.textContent.trim())
  );

  const firstId = [...document.querySelectorAll('.rec-id')]
    .find(node => node.textContent.trim() === 'SRC-001');
  if (firstId) {
    const card = firstId.closest('.rec');
    const title = card?.querySelector('h3');
    if (title) title.textContent = exactTitle;
    if (card) {
      card.dataset.txt = card.dataset.txt
        .replace('the invisible labor of video relay service access', exactTitle.toLowerCase())
        .replace('video relay service interpreters deaf vrs users', exactTitle.toLowerCase() + ' deaf vrs users');
    }
  }

  const records = document.getElementById('records');
  if (records) {
    for (const source of sources) {
      const sourceId = 'SRC-' + String(source.id).padStart(3, '0');
      if (sourceIds.has(sourceId)) continue;

      const refs = source.d.map(id => {
        const [code, label] = codes[id];
        return '<button class="ref code" type="button" data-id="' + esc(id) + '" aria-label="Filter by ' + esc(label) + '">' + esc(code) + '</button>';
      }).join('');

      const article = document.createElement('article');
      article.className = 'rec';
      article.dataset.d = source.d.join(' ');
      article.dataset.txt = (source.auth + ' ' + source.title + ' ' + source.find).toLowerCase();
      article.innerHTML = '<div class="rec-inner">' +
        '<div class="rec-meta">' +
          '<span class="rec-id code">' + sourceId + '</span>' +
          '<span class="rec-cat">' + esc(source.cat) + '</span>' +
          '<span class="rec-refs">' + refs + '</span>' +
        '</div>' +
        '<h3>' + esc(source.title) + '</h3>' +
        '<div class="by">' + esc(source.auth) + '</div>' +
        '<p class="find">' + esc(source.find) + '</p>' +
        '<a class="view" href="' + esc(source.url) + '" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a>' +
      '</div>';
      records.appendChild(article);
      sourceIds.add(sourceId);
    }
  }

  document.querySelectorAll('#tax .tx').forEach(button => {
    const id = button.dataset.id;
    if (!(id in counts)) return;
    const count = counts[id];
    const countNode = button.querySelector('.ct');
    if (countNode) countNode.textContent = String(count);
    const label = codes[id][1];
    button.setAttribute('aria-label', label + ', ' + count + ' sources');
  });

  const matrixCounts = {
    'D-01': 9, 'D-02': 6, 'D-03': 4, 'D-04': 18, 'D-05': 9,
    'D-06': 5, 'D-07': 7, 'D-08': 6, 'D-09': 16, 'D-10': 10, FWK: 9,
  };
  document.querySelectorAll('.mrow').forEach(row => {
    const code = row.querySelector('.m-code')?.textContent.trim();
    const countNode = row.querySelector('.m-count');
    if (countNode && code in matrixCounts) countNode.textContent = String(matrixCounts[code]);
  });

  const shown = document.getElementById('shown');
  if (shown) shown.textContent = String(document.querySelectorAll('.rec:not(.dim)').length);
})();
</script>`;

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const contentType = response.headers.get('content-type') || '';

  if (!url.pathname.startsWith('/emergency') || !contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  html = html
    .replaceAll('31 sources', '36 sources')
    .replaceAll('data-to="31">31', 'data-to="36">36')
    .replaceAll('The Invisible Labor of Video Relay Service Access', 'Video Relay Service Interpreters: Intricacies of Sign Language Access')
    .replaceAll('<h3>Video Relay Service Interpreters</h3>', '<h3>Video Relay Service Interpreters: Intricacies of Sign Language Access</h3>');

  if (!html.includes('id="eiabi-corpus-patch"')) {
    html = html.replace('</body>', CLIENT_PATCH + '\n</body>');
  }

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
