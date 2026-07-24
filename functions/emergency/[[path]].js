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

const MATRIX_COUNTS = {
  'D-01': 9,
  'D-02': 6,
  'D-03': 4,
  'D-04': 18,
  'D-05': 9,
  'D-06': 5,
  'D-07': 7,
  'D-08': 6,
  'D-09': 16,
  'D-10': 10,
};

const CARDS = `<article class="rec" data-d="institutional language tech delay" data-txt="fcc (2023–2025) wea multilingual and asl template rules wireless emergency alerts must support pre-installed asl video templates signed by certified deaf interpreters for 18 common alerts, with device support required in 2028—shifting institutional responsibility upstream of the user."><div class="rec-inner"><div class="rec-meta"><span class="rec-id code">SRC-032</span><span class="rec-cat">Alert systems</span><span class="rec-refs"><button class="ref code" type="button" data-id="institutional" aria-label="Filter by Institutional capacity failure">D-09</button><button class="ref code" type="button" data-id="language" aria-label="Filter by Language conversion &amp; comprehension">D-04</button><button class="ref code" type="button" data-id="tech" aria-label="Filter by Technology setup &amp; maintenance">D-07</button><button class="ref code" type="button" data-id="delay" aria-label="Filter by Delay">D-01</button></span></div><h3>WEA Multilingual and ASL Template Rules</h3><div class="by">FCC (2023–2025)</div><p class="find">Wireless Emergency Alerts must support pre-installed ASL video templates signed by Certified Deaf Interpreters for 18 common alerts, with device support required in 2028—shifting institutional responsibility upstream of the user.</p><a class="view" href="https://docs.fcc.gov/public/attachments/DA-25-12A1_Rcd.pdf" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a></div></article><article class="rec" data-d="institutional language delay action" data-txt="washington odhh (2025) position statement on accessible emergency management responsibility for timely asl translation must sit with emergency agencies, not a disability office; translated alerts should be released within an hour so deaf, hard-of-hearing, and deafblind residents receive timely information."><div class="rec-inner"><div class="rec-meta"><span class="rec-id code">SRC-033</span><span class="rec-cat">Washington / policy</span><span class="rec-refs"><button class="ref code" type="button" data-id="institutional" aria-label="Filter by Institutional capacity failure">D-09</button><button class="ref code" type="button" data-id="language" aria-label="Filter by Language conversion &amp; comprehension">D-04</button><button class="ref code" type="button" data-id="delay" aria-label="Filter by Delay">D-01</button><button class="ref code" type="button" data-id="action" aria-label="Filter by Protective-action consequence">D-10</button></span></div><h3>Position Statement on Accessible Emergency Management</h3><div class="by">Washington ODHH (2025)</div><p class="find">Responsibility for timely ASL translation must sit with emergency agencies, not a disability office; translated alerts should be released within an hour so Deaf, hard-of-hearing, and DeafBlind residents receive timely information.</p><a class="view" href="https://www.dshs.wa.gov/sites/default/files/ALTSA/odhh/documents/WA-Position-Statement-on-Accessible-Emergency-Alerts-Final-Draft-9-22-2025.pdf" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a></div></article><article class="rec" data-d="language institutional search delay trust" data-txt="villarreal, macpherson-krutsky &amp; painter (2025) barriers and best practices for inclusive emergency alerts a synthesis of barriers for people with limited english proficiency and auditory or visual disabilities identifies agency capacity gaps, delayed multi-format messages, inaccessible channels, inaccurate translations, and trust deficits."><div class="rec-inner"><div class="rec-meta"><span class="rec-id code">SRC-034</span><span class="rec-cat">Alert systems</span><span class="rec-refs"><button class="ref code" type="button" data-id="language" aria-label="Filter by Language conversion &amp; comprehension">D-04</button><button class="ref code" type="button" data-id="institutional" aria-label="Filter by Institutional capacity failure">D-09</button><button class="ref code" type="button" data-id="search" aria-label="Filter by Search &amp; channel switching">D-02</button><button class="ref code" type="button" data-id="delay" aria-label="Filter by Delay">D-01</button><button class="ref code" type="button" data-id="trust" aria-label="Filter by Trust &amp; actionable understanding">D-08</button></span></div><h3>Barriers and Best Practices for Inclusive Emergency Alerts</h3><div class="by">Villarreal, MacPherson-Krutsky &amp; Painter (2025)</div><p class="find">A synthesis of barriers for people with limited English proficiency and auditory or visual disabilities identifies agency capacity gaps, delayed multi-format messages, inaccessible channels, inaccurate translations, and trust deficits.</p><a class="view" href="https://doi.org/10.1016/j.ijdrr.2025.105581" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a></div></article><article class="rec" data-d="language institutional repair action framework" data-txt="maguire, boisvert &amp; villeneuve (2025) experiences of dhh people during emergencies a scoping study of 48 articles identifies persistent barriers in warnings and alerts, emergency-sector response, and preparedness; multi-format alerts and first-responder training remain under-implemented across oecd countries."><div class="rec-inner"><div class="rec-meta"><span class="rec-id code">SRC-035</span><span class="rec-cat">Deaf empirical</span><span class="rec-refs"><button class="ref code" type="button" data-id="language" aria-label="Filter by Language conversion &amp; comprehension">D-04</button><button class="ref code" type="button" data-id="institutional" aria-label="Filter by Institutional capacity failure">D-09</button><button class="ref code" type="button" data-id="repair" aria-label="Filter by Repair &amp; accommodation">D-05</button><button class="ref code" type="button" data-id="action" aria-label="Filter by Protective-action consequence">D-10</button><button class="ref code" type="button" data-id="framework" aria-label="Filter by Framework &amp; method">FWK</button></span></div><h3>Experiences of DHH People During Emergencies</h3><div class="by">Maguire, Boisvert &amp; Villeneuve (2025)</div><p class="find">A scoping study of 48 articles identifies persistent barriers in warnings and alerts, emergency-sector response, and preparedness; multi-format alerts and first-responder training remain under-implemented across OECD countries.</p><a class="view" href="https://doi.org/10.1007/s13753-025-00671-0" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a></div></article><article class="rec" data-d="language tech institutional" data-txt="pmvg / wcte / eq4all (2025) nextgen tv asl avatar emergency alerts a live atsc 3.0 demonstration delivered signed emergency alerts as an opt-in broadcast application layer using an animated avatar—showing a production pathway that can reduce reliance on live interpretation."><div class="rec-inner"><div class="rec-meta"><span class="rec-id code">SRC-036</span><span class="rec-cat">Production</span><span class="rec-refs"><button class="ref code" type="button" data-id="language" aria-label="Filter by Language conversion &amp; comprehension">D-04</button><button class="ref code" type="button" data-id="tech" aria-label="Filter by Technology setup &amp; maintenance">D-07</button><button class="ref code" type="button" data-id="institutional" aria-label="Filter by Institutional capacity failure">D-09</button></span></div><h3>NextGen TV ASL Avatar Emergency Alerts</h3><div class="by">PMVG / WCTE / EQ4ALL (2025)</div><p class="find">A live ATSC 3.0 demonstration delivered signed emergency alerts as an opt-in broadcast application layer using an animated avatar—showing a production pathway that can reduce reliance on live interpretation.</p><a class="view" href="https://www.publicmediaventure.com/_files/ugd/9cc034_271e15dae0e7495bb407adff86ff7fa1.pdf" target="_blank" rel="noopener">View source <span class="ar" aria-hidden="true">→</span></a></div></article>`;

const JS_ENTRIES = `,
 {id:32,cat:'Alert systems',auth:'FCC (2023–2025)',title:'WEA Multilingual and ASL Template Rules',find:'Wireless Emergency Alerts must support pre-installed ASL video templates signed by Certified Deaf Interpreters for 18 common alerts, with device support required in 2028—shifting institutional responsibility upstream of the user.',url:'https://docs.fcc.gov/public/attachments/DA-25-12A1_Rcd.pdf',d:['institutional','language','tech','delay']},
 {id:33,cat:'Washington / policy',auth:'Washington ODHH (2025)',title:'Position Statement on Accessible Emergency Management',find:'Responsibility for timely ASL translation must sit with emergency agencies, not a disability office; translated alerts should be released within an hour so Deaf, hard-of-hearing, and DeafBlind residents receive timely information.',url:'https://www.dshs.wa.gov/sites/default/files/ALTSA/odhh/documents/WA-Position-Statement-on-Accessible-Emergency-Alerts-Final-Draft-9-22-2025.pdf',d:['institutional','language','delay','action']},
 {id:34,cat:'Alert systems',auth:'Villarreal, MacPherson-Krutsky & Painter (2025)',title:'Barriers and Best Practices for Inclusive Emergency Alerts',find:'A synthesis of barriers for people with limited English proficiency and auditory or visual disabilities identifies agency capacity gaps, delayed multi-format messages, inaccessible channels, inaccurate translations, and trust deficits.',url:'https://doi.org/10.1016/j.ijdrr.2025.105581',d:['language','institutional','search','delay','trust']},
 {id:35,cat:'Deaf empirical',auth:'Maguire, Boisvert & Villeneuve (2025)',title:'Experiences of DHH People During Emergencies',find:'A scoping study of 48 articles identifies persistent barriers in warnings and alerts, emergency-sector response, and preparedness; multi-format alerts and first-responder training remain under-implemented across OECD countries.',url:'https://doi.org/10.1007/s13753-025-00671-0',d:['language','institutional','repair','action','framework']},
 {id:36,cat:'Production',auth:'PMVG / WCTE / EQ4ALL (2025)',title:'NextGen TV ASL Avatar Emergency Alerts',find:'A live ATSC 3.0 demonstration delivered signed emergency alerts as an opt-in broadcast application layer using an animated avatar—showing a production pathway that can reduce reliance on live interpretation.',url:'https://www.publicmediaventure.com/_files/ugd/9cc034_271e15dae0e7495bb407adff86ff7fa1.pdf',d:['language','tech','institutional']}`;

function updateTaxonomy(html) {
  for (const [dimension, count] of Object.entries(COUNTS)) {
    let start = html.indexOf(`data-id="${dimension}"`, html.indexOf('id="tax"'));
    if (start < 0) continue;
    start = html.lastIndexOf('<button', start);
    const end = html.indexOf('</button>', start) + '</button>'.length;
    let button = html.slice(start, end);
    button = button.replace(/aria-label="([^"]+), \d+ sources"/, `aria-label="$1, ${count} sources"`);
    button = button.replace(/(<span class="ct code" aria-hidden="true">)\d+(<\/span>)/, `$1${count}$2`);
    html = html.slice(0, start) + button + html.slice(end);
  }
  return html;
}

function updateMatrix(html) {
  for (const [code, count] of Object.entries(MATRIX_COUNTS)) {
    const escaped = code.replace('-', '\\-');
    const pattern = new RegExp(`(<div class="m-code">${escaped}<\\/div>[\\s\\S]*?<div class="m-count">)\\d+(<\\/div>)`);
    html = html.replace(pattern, `$1${count}$2`);
  }
  return html;
}

function expandCorpus(html) {
  if (html.includes('SRC-032')) return html;

  html = html.replaceAll('31 sources', '36 sources');
  html = html.replace('data-to="31">31', 'data-to="36">36');
  html = html.replace('<b id="shown">31</b>', '<b id="shown">36</b>');
  html = updateTaxonomy(html);
  html = updateMatrix(html);

  const last = html.indexOf('SRC-031');
  if (last >= 0) {
    const insertAt = html.indexOf('</article>', last) + '</article>'.length;
    html = html.slice(0, insertAt) + CARDS + html.slice(insertAt);
  }

  const srcStart = html.indexOf('const SRC=[');
  const srcEnd = html.indexOf('\n];', srcStart);
  if (srcStart >= 0 && srcEnd >= 0) {
    html = html.slice(0, srcEnd) + JS_ENTRIES + html.slice(srcEnd);
  }

  return html;
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = expandCorpus(await response.text());
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
