// Translates sophiacommons.org links into app pages, so a tapped website link opens the right screen:
//   /event/<id>   -> Events page      /listing/<id or slug> -> Directory page
//   /article/<id> -> news article     anything else         -> the path as given
const MAP: [RegExp, string][] = [
  [/^\/event\/([^/?#]+)/, '/events/'],
  [/^\/listing\/([^/?#]+)/, '/directory/'],
  [/^\/article\/([^/?#]+)/, '/article/'],
];

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // path can be a full https link or an app link such as sophiacommons:///event/<id>
    const p = /^https?:\/\//i.test(path)
      ? path.replace(/^https?:\/\/[^/]*/i, '') || '/'
      : '/' + path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    for (const [re, to] of MAP) {
      const m = p.match(re);
      if (m) return to + m[1];
    }
    return p;
  } catch {
    return '/';
  }
}
