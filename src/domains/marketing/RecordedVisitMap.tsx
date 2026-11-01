import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FieldVisit } from "./visitContracts";
import { mapTiles } from "../../lib/maps/config";

export default function RecordedVisitMap({ visit }: { visit: FieldVisit }) {
  if (!visit.position) return null;
  const { latitude, longitude, accuracy } = visit.position;
  const center: [number, number] = [latitude, longitude];
  return <div className="relative z-0 h-72 w-full overflow-hidden rounded-md border border-blue-200" data-testid="recorded-visit-map">
    <MapContainer center={center} zoom={15} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer {...mapTiles} />
      <Circle center={center} radius={accuracy} pathOptions={{ color: "#0891b2", fillOpacity: 0.12, weight: 1 }} />
      <CircleMarker center={center} radius={7} pathOptions={{ color: "#1e3a8a", fillOpacity: 1 }}><Popup>{visit.employee}<br />Reported check-in: {new Date(visit.receivedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}<br />Accuracy about {Math.round(accuracy)} m. Not current location.</Popup></CircleMarker>
    </MapContainer>
  </div>;
}
