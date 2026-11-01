import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { normalizeVercelRequest,type VercelLikeRequest } from "./vercel-request.js";

test("Vercel rewrite removes its internal route parameter from URL and own query while retaining domain filters",()=>{
 const req:VercelLikeRequest={url:"/api?path=dashboard&from=2026-10-01&to=2026-10-31",headers:{host:"staging.vercel.app"},query:{path:["dashboard","ignored"],from:"2026-10-01",to:"2026-10-31"}};
 normalizeVercelRequest(req);assert.equal(req.url,"/api/dashboard?from=2026-10-01&to=2026-10-31");assert.deepEqual(req.query,{from:"2026-10-01",to:"2026-10-31"});
 const direct:VercelLikeRequest={url:"/api/health",headers:{}};normalizeVercelRequest(direct);assert.equal(direct.url,"/api/health");
});
test("Express strict validators accept a real HTTP request shaped like the Vercel adapter",async()=>{
 const app=express();app.use((req,_res,next)=>{Object.defineProperty(req,"query",{value:Object.fromEntries(new URL(req.url,"http://localhost").searchParams),configurable:true});normalizeVercelRequest(req as unknown as VercelLikeRequest);next();});
 app.get("/api/dashboard",(req,res)=>{const result=z.object({from:z.iso.date(),to:z.iso.date()}).strict().safeParse(req.query);res.status(result.success?200:422).json({valid:result.success});});
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 try{const r=await fetch(`http://127.0.0.1:${(server.address()as AddressInfo).port}/api?path=dashboard&from=2026-10-01&to=2026-10-31`);assert.equal(r.status,200);assert.deepEqual(await r.json(),{valid:true});}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
