const SOURCES = [
  { id: 32, cat: 'Alert systems', auth: 'FCC (2023–2025)', title: 'WEA Multilingual and ASL Template Rules', find: 'Wireless Emergency Alerts must support pre-installed ASL video templates signed by Certified Deaf Interpreters for 18 common alerts, with device support required in 2028—shifting institutional responsibility upstream of the user.', url: 'https://docs.fcc.gov/public/attachments/DA-25-12A1_Rcd.pdf', d: ['institutional', 'language', 'tech', 'delay'] },
  { id: 33, cat: 'Washington / policy', auth: 'Washington ODHH (2025)', title: 'Position Statement on Accessible Emergency Management', find: 'Responsibility for timely ASL translation must sit with emergency agencies, not a disability office; translated alerts should be released within an hour so Deaf, hard-of-hearing, and DeafBlind residents receive timely information.', url: 'https://www.dshs.wa.gov/sites/default/files/ALTSA/odhh/documents/WA-Position-Statement-on-Accessible-Emergency-Alerts-Final-Draft-9-22-2025.pdf', d: ['institutional', 'language', 'delay', 'action'] },
  { id: 34, cat: 'Alert systems', auth: 'Villarreal, MacPherson-Krutsky & Painter (2025)', title: 'Barriers and Best Practices for Inclusive Emergency Alerts', find: 'A synthesis of barriers for people with limited English proficiency and auditory or visual disabilities identifies agency capacity gaps, delayed multi-format messages, inaccessible channels, inaccurate translations, and trust deficits.', url: 'https://doi.org/10.1016/j.ijdrr.2025.105581', d: ['language', 'institutional', 'search', 'delay', 'trust'] },
  { id: 35, cat: 'Deaf empirical', auth: 'Maguire, Boisvert & Villeneuve (2025)', title: 'Experiences of DHH People During Emergencies', find: 'A scoping study of 48 articles identifies persistent barriers in warnings and alerts, emergency-sector response, and preparedness; multi-format alerts and first-responder training remain under-implemented across OECD countries.', url: 'https://doi.org/10.1007/s13753-025-00671-0', d: ['language', 'institutional', 'repair', 'action', 'framework'] },
  { id: 36, cat: 'Production', auth: 'PMVG / WCTE / EQ4ALL (2025)', title: 'NextGen TV ASL Avatar Emergency Alerts', find: 'A live ATSC 3.0 demonstration delivered signed emergency alerts as an opt-in broadcast application layer using an animated avatar—showing a production pathway that can reduce reliance on live interpretation.', url: 'https://www.publicmediaventure.com/_files/ugd/9cc034_271e15dae0e7495bb407adff86ff7fa1.pdf', d: ['language', 'tech', 'institutional'] },
  { id: 37, cat: 'International policy', auth: 'WFD & WASLI (2015)', title: 'Communication during Natural Disasters and Other Mass Emergencies for Deaf People Who Use Signed Language', find: 'UNCRPD-mapped recommendations call for emergency systems to plan direct, timely, signed, accessible, and two-way communication before disasters occur, using professional interpreters, visual and captioned media, relay services, accessible technology, and universal design rather than transferring access work to Deaf people and their informal networks.', url: 'https://wfdeaf.org/news/wfd-and-wasli-statement-communication-during-natural-disasters-and-other-mass-emergencies-for-deaf-people-who-use-signed-language/', d: ['delay', 'language', 'repair', 'informal', 'tech', 'institutional', 'action'] },
];

const COUNTS = { delay: 10, search: 6, verify: 4, language: 19, repair: 10, informal: 6, tech: 8, trust: 6, institutional: 17, action: 11, framework: 9 };
const CODES = {
  delay: ['D-01', 'Delay'], search: ['D-02', 'Search & channel switching'], verify: ['D-03', 'Verification'],
  language: ['D-04', 'Language conversion & comprehension'], repair: ['D-05', 'Repair & accommodation'], informal: ['D-06', 'Informal-network dependence'],
  tech: ['D-07', 'Technology setup & maintenance'], trust: ['D-08', 'Trust & actionable understanding'], institutional: ['D-09', 'Institutional capacity failure'],
  action: ['D-10', 'Protective-action consequence'], framework: ['FWK', 'Framework & method'],
};

const EXTRA_STYLES = `<style id="eiabi-v1-styles">
.version-stamp{display:inline-block;margin-top:1rem;color:#ff8f80;font:700 .7rem var(--mono);letter-spacing:.1em;text-transform:uppercase}
.calibration-note{margin-top:1rem;color:var(--ink-soft);font-size:.8rem;line-height:1.5}
.method-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)}
.method-card{padding:var(--space-3);border-top:2px solid var(--signal);background:color-mix(in srgb,var(--surface) 70%,transparent)}
.method-card h3,.adjacent h3,.open-call h2{margin-bottom:1rem;font:500 clamp(1.55rem,2.4vw,2.35rem)/1.08 var(--serif);letter-spacing:-.025em}
.method-card p,.method-card li,.adjacent p,.open-call p{color:var(--ink-soft);font-size:.88rem;line-height:1.62}
.method-card ul{display:grid;gap:.45rem;padding-left:1.2rem}.placeholder{font-family:var(--mono);font-size:.78rem;color:var(--signal)}
.prisma{grid-column:1/-1;margin-top:var(--space-2);padding:var(--space-3);border:1px solid var(--line-strong);background:var(--surface)}
.prisma-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;align-items:stretch;list-style:none}
.prisma-flow li{position:relative;padding:1.25rem;border:1px solid var(--line);background:var(--surface-raised);text-align:center}
.prisma-flow li:not(:last-child)::after{content:'→';position:absolute;right:-.8rem;top:50%;z-index:2;color:var(--signal);font-weight:700;transform:translateY(-50%)}
.prisma-flow b{display:block;margin-top:.5rem;font:500 1.5rem var(--serif)}.prisma figcaption{margin-top:1rem;color:var(--ink-soft);font-size:.78rem}
.adjacent{margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--line-strong)}
.adjacent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2);margin-top:1.5rem}.adjacent-grid article{padding:var(--space-2);border-left:2px solid var(--line-strong)}
.adjacent-grid h4{margin-bottom:.6rem;font:600 1.15rem var(--serif)}
.distinction{margin-top:var(--space-3);padding:var(--space-2);border-left:4px solid var(--signal);background:var(--signal-soft);color:var(--ink)!important;font:500 clamp(1.15rem,1rem + .45vw,1.45rem)/1.45 var(--serif)!important}
.open-call{margin-top:var(--space-4);padding:var(--space-3);border:1px solid var(--line-strong);border-top:4px solid var(--signal);background:var(--surface-raised)}
.revision-link{color:var(--signal);font-weight:700;text-underline-offset:.25rem}.foot-meta{display:grid;gap:.4rem;margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.16)}
.revision-log{margin-top:.75rem;padding-top:.75rem;border-top:1px solid rgba(255,255,255,.16)}
@media(max-width:760px){.method-grid,.adjacent-grid{grid-template-columns:1fr}.prisma-flow{grid-template-columns:1fr}.prisma-flow li:not(:last-child)::after{content:'↓';right:auto;left:50%;top:auto;bottom:-1.2rem;transform:translateX(-50%)}}
</style>`;

const METHOD_SECTION = `<section class="section" id="method" aria-labelledby="method-title">
<header class="sec-head"><span class="sec-num">02</span><h2 class="sec-title" id="method-title">Method</h2><p class="sec-desc">Search protocol and selection process for the current evidence corpus.</p></header>
<div class="method-grid">
<article class="method-card"><h3>Databases and indexes</h3><p class="placeholder">[PLACEHOLDER — supply final databases and indexes searched]</p><ul><li>Suggested: Scopus</li><li>Web of Science</li><li>PubMed</li><li>Google Scholar</li><li>IEEE Xplore / ACM Digital Library</li><li>Government and organizational repositories</li></ul></article>
<article class="method-card"><h3>Date range and queries</h3><p><strong>Date range:</strong> 1990–2026</p><p class="placeholder">[PLACEHOLDER — confirm complete query strings and search dates]</p><ul><li>“emergency information accessibility”</li><li>“emergency communication” AND accessibility</li><li>“warning accessibility” OR “accessible alerts”</li><li>“administrative burden” AND disability</li><li>“information access burden”</li></ul></article>
<article class="method-card"><h3>Inclusion criteria</h3><p class="placeholder">[PLACEHOLDER — confirm final criteria]</p><ul><li>Empirical studies, conceptual papers, validated instruments, standards, and policy reports</li><li>Emergency warnings, alerts, crisis communication, or protective action</li><li>Evidence bearing on disability-related access labor or institutional production</li><li>English-language or accessible translated full text</li></ul></article>
<article class="method-card"><h3>Exclusion criteria</h3><p class="placeholder">[PLACEHOLDER — confirm final criteria]</p><ul><li>Non-emergency communication</li><li>Purely technical networking studies without an access construct</li><li>Duplicates and inaccessible records</li><li>Commentary without a conceptual or empirical contribution</li></ul></article>
<figure class="prisma" aria-labelledby="prisma-title" aria-describedby="prisma-text"><h3 id="prisma-title">Screening and selection</h3><ol class="prisma-flow"><li>Records identified<b>[TBD]</b></li><li>Records screened<b>[TBD]</b></li><li>Full texts assessed<b>[TBD]</b></li><li>Sources included<b>37</b></li></ol><figcaption id="prisma-text">Text equivalent: [TBD] records identified; [TBD] screened; [TBD] full texts assessed; 37 sources included in the synthesis.</figcaption></figure>
</div></section>`;

const ADJACENT_AND_CALL = `<section class="adjacent" aria-labelledby="adjacent-title"><h3 id="adjacent-title">Adjacent instruments and why they don’t close the gap</h3><div class="adjacent-grid">
<article><h4>Administrative burden</h4><p>The closest theoretical parent measures learning, compliance, and psychological costs in access to public benefits and government processes—not emergency information under time pressure.</p></article>
<article><h4>Health and eHealth literacy</h4><p>These instruments measure an individual’s capacity to locate, understand, evaluate, and use information. They do not measure labor imposed by inaccessible institutional production.</p></article>
<article><h4>Area-level vulnerability</h4><p>The Social Vulnerability Index and FEMA Community Resilience Estimates measure population susceptibility at geographic scale, not the labor imposed during a specific information transaction.</p></article>
</div><p class="distinction">Existing instruments measure who is vulnerable or what a person can do; this index measures what the system costs them.</p></section>
<aside class="open-call" role="region" aria-labelledby="open-call-title"><h2 id="open-call-title">Know an instrument we missed?</h2><p>The zero in this review is a finding, not a claim of completeness. If a validated instrument measuring emergency-information access burden exists and isn’t in this corpus, send it and it will be reviewed and credited in the next version.</p><p><strong>Contact:</strong> <span class="placeholder">[CONTACT METHOD]</span></p><p>Contributions are acknowledged in the revision log.</p></aside>`;

const FOOTER = `<footer class="shell"><section class="foot"><div><h2>Emergency Information Access Burden Index</h2><p class="version-stamp">v1.0 · July 2026</p></div><div class="foot-copy"><p>Literature review—a synthesis of 37 sources across 10 prospective dimensions, spanning 1990–2026. Findings are paraphrased, with the original linked from each record.</p><div class="foot-meta"><p><strong>Author:</strong> Robert McConnell</p><p><strong>Publisher:</strong> Deaf in Government, Inc. (DIG)</p><p>The views expressed are the author’s own and do not represent those of any employer or federal agency.</p></div><section class="revision-log" id="revision-log" aria-labelledby="revision-title"><h3 id="revision-title">Revision log</h3><p><strong>v1.0 · July 2026</strong> — Initial published review.</p></section><p><a class="revision-link" href="#revision-log">Revision log</a></p></div></section></footer>`;

const CLIENT_PATCH = `<script id="eiabi-v1-patch">(() => {
const sources=${JSON.stringify(SOURCES)},counts=${JSON.stringify(COUNTS)},codes=${JSON.stringify(CODES)};
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const records=document.getElementById('records');const ids=new Set([...document.querySelectorAll('.rec-id')].map(n=>n.textContent.trim()));
for(const s of sources){const sid='SRC-'+String(s.id).padStart(3,'0');if(ids.has(sid)||!records)continue;const refs=s.d.map(id=>'<button class="ref code" type="button" data-id="'+esc(id)+'" aria-label="Filter by '+esc(codes[id][1])+'">'+esc(codes[id][0])+'</button>').join('');const a=document.createElement('article');a.className='rec';a.dataset.d=s.d.join(' ');a.dataset.txt=(s.auth+' '+s.title+' '+s.find).toLowerCase();a.innerHTML='<div class="rec-inner"><header class="rec-meta"><span class="rec-id code">'+sid+'</span><span class="rec-cat">'+esc(s.cat)+'</span><span class="rec-refs">'+refs+'</span></header><h3>'+esc(s.title)+'</h3><p class="by">'+esc(s.auth)+'</p><p class="find">'+esc(s.find)+'</p><a class="view" href="'+esc(s.url)+'" target="_blank" rel="noopener">View source →</a></div>';records.appendChild(a);ids.add(sid)}
document.querySelectorAll('#tax .tx').forEach(b=>{const id=b.dataset.id;if(!(id in counts))return;const n=b.querySelector('.ct');if(n)n.textContent=counts[id];b.setAttribute('aria-label',codes[id][1]+', '+counts[id]+' sources')});
const mc={'D-01':10,'D-02':6,'D-03':4,'D-04':19,'D-05':10,'D-06':6,'D-07':8,'D-08':6,'D-09':17,'D-10':11};document.querySelectorAll('.mrow').forEach(r=>{const c=r.querySelector('.m-code')?.textContent.trim(),n=r.querySelector('.m-count');if(n&&c in mc)n.textContent=mc[c]});
const first=[...document.querySelectorAll('.rec-id')].find(n=>n.textContent.trim()==='SRC-001')?.closest('.rec');if(first){const h=first.querySelector('h3');if(h)h.textContent='Video Relay Service Interpreters: Intricacies of Sign Language Access'}
const cards=[...document.querySelectorAll('.rec')];if(cards.length===37)cards.forEach(c=>c.classList.remove('dim'));const shown=document.getElementById('shown');if(shown)shown.textContent=String(cards.filter(c=>!c.classList.contains('dim')).length);
})();</script>`;

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const contentType = response.headers.get('content-type') || '';
  if (!url.pathname.startsWith('/emergency') || !contentType.includes('text/html')) return response;

  let html = await response.text();
  html = html
    .replace('</style>', EXTRA_STYLES + '</style>')
    .replaceAll('31 sources', '37 sources').replaceAll('36 sources', '37 sources')
    .replaceAll('<p class="n">31</p><p class="l">Sources synthesized</p>', '<p class="n">37</p><p class="l">Sources synthesized</p>')
    .replaceAll('<p class="n">36</p><p class="l">Sources synthesized</p>', '<p class="n">37</p><p class="l">Sources synthesized</p>')
    .replace('Burden dimensions identified</p>', 'Prospective dimensions</p>')
    .replace('<h1 id="page-title">Emergency Information Access Burden Index</h1>', '<h1 id="page-title">Emergency Information Access Burden Index</h1><p class="version-stamp">v1.0 · July 2026</p>')
    .replace('</div>\n  </section>\n\n  <section class="section" id="explorer"', '</div><p class="calibration-note">The dimensional structure is prospective and remains subject to exploratory and confirmatory factor analysis.</p>\n  </section>\n\n' + METHOD_SECTION + '\n\n  <section class="section" id="explorer"')
    .replace('<span class="sec-num">02</span><h2 class="sec-title" id="explorer-title">', '<span class="sec-num">03</span><h2 class="sec-title" id="explorer-title">')
    .replace('<span class="sec-num">03</span><h2 class="sec-title" id="matrix-title">', '<span class="sec-num">04</span><h2 class="sec-title" id="matrix-title">')
    .replace('<span class="sec-num">04</span><h2 class="sec-title" id="pipeline-title">', '<span class="sec-num">05</span><h2 class="sec-title" id="pipeline-title">')
    .replace('<span class="sec-num">05</span><h2 class="sec-title" id="findings-title">', '<span class="sec-num">06</span><h2 class="sec-title" id="findings-title">')
    .replace('<p class="pipe-ends">', '<p class="pipe-note"><strong>Unit of analysis.</strong> Burden is measured per transaction. Validation therefore requires event-based collection—such as diary or experience-sampling methods, or structured post-event recall—rather than reliance on a cross-sectional survey alone.</p><p class="pipe-ends">')
    .replace('<aside class="proposition">', ADJACENT_AND_CALL + '<aside class="proposition">')
    .replace(/<footer class="shell">[\s\S]*?<\/footer>/, FOOTER)
    .replaceAll('The Invisible Labor of Video Relay Service Access', 'Video Relay Service Interpreters: Intricacies of Sign Language Access')
    .replaceAll('<h3>Video Relay Service Interpreters</h3>', '<h3>Video Relay Service Interpreters: Intricacies of Sign Language Access</h3>');

  if (!html.includes('id="eiabi-v1-patch"')) html = html.replace('</body>', CLIENT_PATCH + '\n</body>');
  const headers = new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('content-type','text/html; charset=UTF-8');headers.set('cache-control','no-cache');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
