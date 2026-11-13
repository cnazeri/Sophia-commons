// Regions for "Near you" in the weekly digest (owner, 2026-11-13).
// weekly-digest writes one block per region, wrapped in <!--near:KEY--> ... <!--/near:KEY-->.
// send-newsletter keeps the block for the reader's region and removes the others; the site shows none.

export const REGION_LABEL: Record<string, string> = {
  na: "North America", uk: "the UK and Ireland", eu: "Europe", oc: "Australia and New Zealand",
  af: "Africa", la: "Latin America", as: "Asia",
};

// ISO 3166 two-letter code (subscriber) -> region key
const BY_CODE: Record<string, string> = {};
const put = (key: string, codes: string) => codes.split(" ").forEach((c) => { BY_CODE[c] = key; });
put("na", "US CA PR");
put("uk", "GB IE");
put("eu", "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GR HR HU IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA");
put("oc", "AU NZ FJ PG WS TO VU SB KI FM MH NR PW TV");
put("af", "ZA NA BW ZW ZM KE TZ UG RW ET GH NG SN EG MA TN DZ MZ MW LS SZ MU MG CM CI");
put("la", "MX GT BZ HN SV NI CR PA CU DO HT JM TT BB BS AG DM GD KN LC VC CO VE EC PE BO BR PY UY AR CL GY SR");
put("as", "IN CN JP KR TW HK MO SG MY TH VN PH ID KH LA MM NP LK BD PK IL JO LB TR AE QA KW BH OM SA GE AM AZ KZ KG UZ MN");

// Country names as the events table writes them -> region key
const BY_NAME: Record<string, string> = {
  usa: "na", "united states": "na", canada: "na", "puerto rico": "na",
  uk: "uk", "united kingdom": "uk", england: "uk", scotland: "uk", wales: "uk", "northern ireland": "uk", ireland: "uk",
  australia: "oc", "new zealand": "oc",
  "south africa": "af", namibia: "af", kenya: "af", egypt: "af",
  mexico: "la", brazil: "la", argentina: "la", chile: "la", colombia: "la", peru: "la",
  india: "as", china: "as", japan: "as", "south korea": "as", taiwan: "as", israel: "as", philippines: "as", thailand: "as",
};
const EUROPE = /^(austria|belgium|bulgaria|croatia|cyprus|czech|czechia|denmark|estonia|finland|france|germany|greece|hungary|iceland|italy|latvia|liechtenstein|lithuania|luxembourg|malta|netherlands|norway|poland|portugal|romania|russia|serbia|slovakia|slovenia|spain|sweden|switzerland|ukraine)$/;

export function regionOfCode(code: unknown): string | null {
  return BY_CODE[String(code ?? "").toUpperCase()] ?? null;
}
export function regionOfCountry(name: unknown): string | null {
  const n = String(name ?? "").trim().toLowerCase();
  return BY_NAME[n] ?? (EUROPE.test(n) ? "eu" : null);
}

const BLOCK = /<!--near:([a-z]{2})-->[\s\S]*?<!--\/near:\1-->/g;

// The reader's own block stays (markers removed); every other region's block goes
export function forReader(html: string, region: string | null): string {
  return html.replace(BLOCK, (m, key) => key === region ? m.replace(/<!--\/?near:[a-z]{2}-->/g, "") : "");
}
