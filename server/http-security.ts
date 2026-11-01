import type { ErrorRequestHandler } from "express";

// Keep parser diagnostics and request bodies out of client-facing error responses.
export const jsonBodyError: ErrorRequestHandler = (error, _req, res, next) => {
  const messages: Record<string, { status: number; message: string }> = {
    "entity.parse.failed": { status: 400, message: "Request body must be valid JSON." },
    "entity.too.large": { status: 413, message: "Request body is too large. Upload files using private Storage." },
    "charset.unsupported": { status: 415, message: "JSON requests must use a supported character encoding." },
    "encoding.unsupported": { status: 415, message: "Request encoding is not supported." }
  };
  const result = messages[String(error?.type)];
  if (!result) return next(error);
  res.setHeader("Cache-Control", "private, no-store");
  res.status(result.status).json({ success: false, data: null, message: result.message });
};
