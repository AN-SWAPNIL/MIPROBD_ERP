import { isFoundationMode } from "./config.js";

// Only the selected backend initializes. Real requests never construct prototype state.
const { default: app } = await (isFoundationMode()
  ? import("./foundation/app.js")
  : import("./mock-app.js"));

if (!process.env.VERCEL) {
  const port = Number(process.env.API_PORT ?? 4174);
  app.listen(port, () => console.log(`MIPRO ERP API listening on http://localhost:${port}`));
}

export default app;
