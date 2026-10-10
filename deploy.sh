#!/usr/bin/env bash
# Sophia Commons: safe production deploy
#   ./deploy.sh            build _deploy/ and publish it to sophiacommons.org
#   ./deploy.sh --preview  build and publish to a private draft URL (not the live site)
#
# Only the public website files are copied into _deploy/. Nothing else in this folder
# (API keys, outreach lists, docs, backend code, spreadsheets) can reach the internet.
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC_FILES=(
  index.html sophia_commons_v9.css sophia_commons_v9.js blog.js i18n.js sb-init.js sw.js manifest.json
  robots.txt llms.txt sitemap.xml _redirects googleae2ea1fc1aac5bc6.html
  logo.svg logo.png icon-192.png icon-512.png favicon.ico favicon-32.png apple-touch-icon.png og-image.jpg
)

echo "→ Building _deploy/"
rm -rf _deploy && mkdir -p _deploy/lang
for f in "${PUBLIC_FILES[@]}"; do
  [ -f "$f" ] && cp "$f" _deploy/ || echo "  (skipped missing $f)"
done
cp lang/*.json _deploy/lang/
mkdir -p _deploy/fonts && cp fonts/*.woff2 _deploy/fonts/
mkdir -p _deploy/img && cp img/* _deploy/img/

echo "→ Prerendering static pages and sitemap (falls back to the plain app if Supabase is unreachable)"
if ! node automation/prerender.mjs _deploy; then
  echo "  (prerender failed; deploying without static pages, keeping the repo sitemap)"
  find _deploy -name '*.html' ! -name index.html ! -name 'google*.html' -delete 2>/dev/null || true
  cp sitemap.xml _deploy/sitemap.xml
fi

echo "→ Checking for secrets"
if grep -rIl -E 'sb_secret_|service_role|sbp_[0-9a-f]{20}|re_[A-Za-z0-9]{20}|RESEND_API_KEY=' _deploy; then
  echo "✗ A file above looks like it contains a secret. Deploy stopped." >&2
  exit 1
fi

echo "→ Checking the JavaScript parses"
node --check _deploy/sophia_commons_v9.js
node --check _deploy/i18n.js
for j in _deploy/lang/*.json; do node -e "JSON.parse(require('fs').readFileSync('$j','utf8'))"; done

echo "→ $(find _deploy -type f | wc -l | tr -d ' ') files ready (top level shown):"
find _deploy -maxdepth 1 -type f | sed 's|^_deploy/|   |' | sort

if [ "${1:-}" = "--preview" ]; then
  npx --yes netlify-cli deploy --dir=_deploy
else
  npx --yes netlify-cli deploy --prod --dir=_deploy
fi
