export type VercelLikeRequest = {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

export function normalizeVercelRequest(req: VercelLikeRequest) {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const path = first(req.query?.path);
  if (!path) return;
  const url = new URL(req.url ?? "/", `https://${first(req.headers.host) ?? "localhost"}`);
  url.searchParams.delete("path");
  // Vercel supplies an own query object; changing url alone does not clear it for Express.
  if (req.query) delete req.query.path;
  const query = url.searchParams.toString();
  req.url = `/api/${path}${query ? `?${query}` : ""}`;
}
