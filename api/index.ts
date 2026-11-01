import app from "../server/index.js";
import { normalizeVercelRequest, type VercelLikeRequest } from "../server/vercel-request.js";

export default function handler(req: VercelLikeRequest, res: any) {
  normalizeVercelRequest(req);
  return app(req as any, res);
}
