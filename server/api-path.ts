export function normalizeApiPath(url: string) {
  const queryAt = url.indexOf("?");
  const path = queryAt < 0 ? url : url.slice(0, queryAt);
  const query = queryAt < 0 ? "" : url.slice(queryAt);
  let normalized = path.startsWith("/") ? path : `/${path}`;
  if (!/^\/api(?:\/|$)/.test(normalized)) normalized = normalized === "/" ? "/api" : `/api${normalized}`;
  return normalized.replace(/^\/api\/v1(?=\/|$)/, "/api") + query;
}
