import cors from "cors";
import express from "express";
import { normalizeApiPath } from "../api-path.js";
import { backendConfig } from "../config.js";
import { jsonBodyError } from "../http-security.js";
import { createFoundationRouter } from "./router.js";

const app = express();
app.disable("x-powered-by");
if (process.env.VERCEL) app.set("trust proxy", 1);
app.use(cors({ origin: backendConfig().origin, credentials: true }));
app.use(express.json({ limit: "256kb" }));
app.use(jsonBodyError);
app.use((req, _res, next) => { req.url = normalizeApiPath(req.url); next(); });
app.use("/api", createFoundationRouter());

export default app;
