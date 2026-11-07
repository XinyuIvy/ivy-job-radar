// Country/territory grouping: https://unstats.un.org/unsd/methodology/m49/
// Match location fields, not incidental office/customer mentions in the JD.
const codes = ("AL AD AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA " +
"AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW IO KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TF TG TN TZ UG YT ZA ZM ZW").split(" ");
const names = ["en", "zh"].flatMap((locale) => {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  return codes.map((code) => display.of(code) || code);
});
const aliases = ["Europe", "Africa", "European Union", "EU", "UK", "United Kingdom", "Great Britain",
"England", "Scotland", "Wales", "Northern Ireland", "Czech Republic", "Ivory Coast", "Cape Verde",
"Swaziland", "Democratic Republic of the Congo", "Republic of the Congo", "欧洲", "非洲", "欧盟", "英国", "科索沃", "Kosovo"];
const cities = ["London", "Paris", "Berlin", "Munich", "München", "Amsterdam", "Dublin", "Zurich", "Zürich",
"Geneva", "Lausanne", "Basel", "Madrid", "Barcelona", "Lisbon", "Milan", "Rome", "Warsaw", "Prague",
"Vienna", "Stockholm", "Copenhagen", "Oslo", "Helsinki", "Brussels", "Budapest", "Bucharest", "Athens",
"Edinburgh", "Manchester", "Cambridge", "Oxford", "Cape Town", "Johannesburg", "Nairobi", "Lagos", "Cairo",
"Accra", "Casablanca", "Tunis", "Kigali", "Addis Ababa", "伦敦", "巴黎", "柏林", "慕尼黑", "都柏林", "苏黎世", "阿姆斯特丹", "开普敦", "约翰内斯堡"];
const normalize = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
function contains(text: string, term: string) {
  const needle = normalize(term);
  if (/[\u3400-\u9fff]/u.test(needle)) return text.includes(needle);
  // Escape all punctuation before using country names as literal regex terms.
  const escaped = needle.replace(/[^a-z0-9 ]/g, (char) => "\\" + char);
  return new RegExp("(^|[^a-z])" + escaped + "($|[^a-z])", "i").test(text);
}
export function excludedJobGeography(job: { location?: string; region?: string }) {
  const location = normalize(String(job.location || ""));
  const region = normalize(String(job.region || ""));
  if ([...names, ...aliases].some((name) => contains(location, name) || contains(region, name))) return true;
  // Avoid treating ambiguous US state abbreviations as countries.
  const tokens = String(job.location || "").split(/[,;|]/).map((s) => s.trim());
  const last = tokens.at(-1) || "";
  if (codes.includes(last) && !["DE", "AL", "ME", "MD", "NE", "SD", "MA", "SC", "TN", "VA"].includes(last)) return true;
  const outside = /\b(?:usa|united states|u\.s\.|canada|china|australia|ontario)\b|美国|加拿大|中国|澳大利亚/.test(location)
    || /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|ON|BC|QC)(?:\s+\d|$)/.test(String(job.location || ""));
  return !outside && cities.some((city) => contains(location, city));
}
