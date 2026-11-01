const defaultUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const defaultAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function resolveMapTiles(tileUrl?: string, attribution?: string) {
  const url = tileUrl?.trim() || defaultUrl;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !["{z}", "{x}", "{y}"].every((part) => url.includes(part))) {
    throw new Error("Map tiles require an HTTPS raster URL with {z}, {x}, {y} and no embedded credentials.");
  }
  const credit = attribution?.trim() || defaultAttribution;
  if (parsed.hostname.endsWith("tile.openstreetmap.org") && !/openstreetmap\.org\/copyright/.test(credit)) {
    throw new Error("OpenStreetMap tiles require visible contributor attribution.");
  }
  if (/<\s*(?:script|iframe|img|style|object)|\bon\w+\s*=|javascript:/i.test(credit)) {
    throw new Error("Map attribution must not contain active content.");
  }
  return { url, attribution: credit };
}
