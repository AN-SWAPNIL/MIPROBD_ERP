import { isFoundationMode } from "./config.js";
import app from "./foundation/app.js";

if (!isFoundationMode()) throw new Error("This branch requires the real backend. Use the prototype branch for mock demonstrations.");

if (!process.env.VERCEL) {
  const port = Number(process.env.API_PORT ?? 4174);
  app.listen(port, () => console.log(`MIPRO ERP API listening on http://localhost:${port}`));
}

export default app;
