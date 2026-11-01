import { request, type IncomingHttpHeaders } from "node:http";

export const isolatedPeer = (suffix: string) => `127.77.${parseInt(suffix.slice(0, 2), 16)}.${parseInt(suffix.slice(2, 4), 16)}`;

// Real loopback peers keep concurrent test suites inside their own login-rate window.
export function localApiRequest(url: string, peer: string, method: string, headers: Record<string, string>, body?: string): Promise<{ status: number; json: unknown; headers: IncomingHttpHeaders }> {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !/^127\.77\.\d{1,3}\.\d{1,3}$/.test(peer)) throw new Error("Test transport requires an isolated loopback address.");
  return new Promise((resolve, reject) => {
    const req = request(target, { method, headers, localAddress: peer }, async (res) => {
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of res) { size += chunk.length; if (size > 8 * 1024 * 1024) { res.destroy(); throw new Error("Test response exceeds its bounded size."); } chunks.push(Buffer.from(chunk)); }
        resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: res.headers });
      } catch (error) { reject(error); }
    });
    req.setTimeout(30000, () => req.destroy(new Error("Local test API request timed out.")));
    req.on("error", reject); req.end(body);
  });
}
