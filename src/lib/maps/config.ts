import { resolveMapTiles } from "./tiles";

// Public build settings only; never supply a secret or a private signed URL here.
export const mapTiles = resolveMapTiles(import.meta.env.VITE_MAP_TILE_URL, import.meta.env.VITE_MAP_ATTRIBUTION);
