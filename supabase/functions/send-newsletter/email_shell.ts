// ══════════════════════════════════════════
//  Email frame for every newsletter: header with logo, white content card, footer with
//  site links, why-you-got-this and unsubscribe. Table layout with inline styles so it holds
//  up in Gmail, Apple Mail and Outlook. Only used for email; the site shows the bare body.
// ══════════════════════════════════════════

const SITE = "https://sophiacommons.org";
const LOGO = `${SITE}/img/logo-mark.png`;
const C = {
  page: "#F3EDE2",      // warm ivory, matches the site background family
  card: "#FFFFFF",
  ink: "#1E1810",
  muted: "#6F665B",
  gold: "#7F6116",      // gold text color from the site (passes AA on white)
  rule: "#E8E2DA",
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface ShellInput {
  subject: string;
  preheader?: string;      // inbox preview line; hidden in the message itself
  kicker?: string;         // small line under the logo, e.g. "Weekly digest · October 16, 2026"
  body: string;            // the newsletter content (HTML)
  unsubscribeUrl: string;
}

export function emailShell({ subject, preheader = "", kicker = "", body, unsubscribeUrl }: ShellInput): string {
  const footLink = (href: string, label: string) =>
    `<a href="${href}" style="color:${C.gold};text-decoration:none;font-weight:bold">${label}</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width: 520px) {
    .card { padding: 22px 18px 20px !important; }
    .vthumb { float: none !important; width: 100% !important; height: auto !important; margin: 0 0 10px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};font-size:1px;line-height:1px">${esc(preheader)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td align="center" style="padding:0 0 20px">
      <a href="${SITE}" style="text-decoration:none"><img src="${LOGO}" width="72" height="72" alt="Sophia Commons" style="display:block;border:0;margin:0 auto 10px"></a>
      <div style="font-family:${SERIF};font-size:26px;line-height:1.2;color:${C.ink}">Sophia Commons</div>
      ${kicker ? `<div style="font-family:${SANS};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.gold};margin-top:6px">${esc(kicker)}</div>` : ""}
    </td></tr>
    <tr><td class="card" style="background:${C.card};border:1px solid ${C.rule};border-radius:12px;padding:32px 32px 28px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink}">
${body}
    </td></tr>
    <tr><td align="center" style="padding:22px 16px 4px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.ink}">
      Know someone who'd enjoy this? Forward it to them.<br>
      <span style="color:${C.muted};font-size:13px">Got this from a friend? ${footLink(`${SITE}/?subscribe=1#home-nl-email`, "Get your own copy")}, free each week.</span>
    </td></tr>
    <tr><td align="center" style="padding:14px 16px 8px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">
      ${footLink(`${SITE}/directory`, "Directory")} &nbsp;&middot;&nbsp; ${footLink(`${SITE}/events`, "Events")} &nbsp;&middot;&nbsp; ${footLink(`${SITE}/podcasts`, "Podcasts &amp; Media")}
    </td></tr>
    <tr><td align="center" style="padding:8px 16px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted}">
      Sophia Commons is a free directory of the anthroposophical movement worldwide.<br>
      You're getting this because you subscribed at sophiacommons.org.<br>
      <a href="${esc(unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}
