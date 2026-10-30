// Lean pages for search engines and AI crawlers (owner, 2026-10-29).
// Every page used to carry the whole app: all 19 sections, about 6,000 words of text that is the same on
// every URL. A listing adds 150-250 words of its own, so Google treated many listings as duplicates of
// each other (Search Console: "Duplicate, Google chose different canonical than user").
// For crawlers we serve the same page without the other sections and without the app scripts: the
// header and menu, this page's own content (the #prerender summary, plus the section itself on
// section pages such as /books), and the footer. Visitors keep the full app. The content is what a
// visitor sees on that URL, so this is dynamic rendering, not cloaking.
// Plain JS with no imports so Node (tests) and Deno (Netlify) can both load it.

export const CRAWLER_UA = /googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|bingbot|bingpreview|msnbot|duckduckbot|duckassistbot|applebot|yandex|baiduspider|petalbot|seznambot|qwantify|ecosia|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|ccbot|amazonbot|meta-externalagent|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|mistralai-user|cohere-ai|youbot|diffbot/i;

export const isCrawler = ua => CRAWLER_UA.test(String(ua || ''));

// Section kept on a section route (its static text is that page's real content)
export const SECTION_OF_ROUTE = {
  '/': 'sec-home',
  '/directory': 'sec-directory', '/events': 'sec-events', '/browse': 'sec-browse', '/news': 'sec-news', '/blog': 'sec-blog',
  '/books': 'sec-books', '/podcasts': 'sec-podcasts', '/memorial': 'sec-memorial', '/eldercare': 'sec-eldercare',
  '/about': 'sec-about', '/privacy': 'sec-privacy', '/terms': 'sec-terms',
};

// The element that starts at `start` (a <div ...> tag), through its matching </div>
function divAt(html, start) {
  const tag = /<div\b|<\/div>/gi;
  tag.lastIndex = start;
  let depth = 0, m;
  while ((m = tag.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return '';
}

export function crawlerView(html, keepSection = '') {
  const mainOpen = html.match(/<main id="center"[^>]*>/);
  const mainEnd = html.indexOf('</main>');
  if (!mainOpen || mainEnd < 0) return html;   // not the app shell: leave it alone
  const mainStart = mainOpen.index + mainOpen[0].length;

  // The summary (and its JSON-LD) that applySeo puts just before <footer>
  let summary = '';
  const pr = html.indexOf('<div id="prerender"');
  const foot = html.indexOf('<footer');
  if (pr > mainEnd && foot > pr) { summary = html.slice(pr, foot); html = html.slice(0, pr) + html.slice(foot); }

  let kept = '';
  if (keepSection) {
    const at = html.indexOf(`id="${keepSection}"`);
    const open = at < 0 ? -1 : html.lastIndexOf('<div', at);
    if (open >= mainStart && open < mainEnd) {
      kept = divAt(html, open).replace(/^<div class="pagesec(?! active)/, '<div class="pagesec active');
    }
  }
  html = html.slice(0, mainStart) + '\n' + summary + kept + '\n' + html.slice(mainEnd);

  // The right sidebar is the same on every page
  html = html.replace(/(<aside id="rightbar"[^>]*>)[\s\S]*?(<\/aside>)/, '$1$2');
  // No app scripts: without them nothing removes the summary or redraws the page
  html = html.replace(/<!-- Scripts are deferred[\s\S]*?(<\/body>)/, '$1');
  return html;
}

// Cached copies are kept per user agent, so a crawler never gets the visitors' copy or the other way round
export const VARY_HEADERS = { Vary: 'User-Agent', 'Netlify-Vary': 'header=User-Agent' };
