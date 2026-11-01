import type { Response } from "express";
import type { Session } from "@supabase/supabase-js";
import type { Context } from "./context.js";
export const refreshCookie = "mipro_refresh";
export const sessionCookie = "mipro_sid";
const cookiePath = "/api/auth";
const options = (ctx: Context) => ({ httpOnly: true, sameSite: "strict" as const, secure: ctx.config.secureCookies, path: cookiePath });
export function writeSessionCookies(ctx: Context, res: Response, session: Session, id: string) {
  const flags = { ...options(ctx), maxAge: 30 * 86400 * 1000 };
  res.cookie(refreshCookie, session.refresh_token, flags); res.cookie(sessionCookie, id, flags);
}
export function clearSessionCookies(ctx: Context, res: Response) { res.clearCookie(refreshCookie, options(ctx)); res.clearCookie(sessionCookie, options(ctx)); }
