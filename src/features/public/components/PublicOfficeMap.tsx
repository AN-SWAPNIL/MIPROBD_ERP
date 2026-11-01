import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { mapTiles } from "../../../lib/maps/config";

export default function PublicOfficeMap({ center, company }: { center: [number, number]; company: string }) {
  return (
    <div className="relative z-0 h-[360px] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100" aria-label="Map showing MIPRO office area in Uttara, Dhaka">
      <MapContainer className="h-full w-full" center={center} zoom={15} scrollWheelZoom={false}>
        <TileLayer {...mapTiles} />
        <CircleMarker center={center} radius={10} pathOptions={{ color: "#ffffff", fillColor: "#0e7490", fillOpacity: 1, weight: 3 }}>
          <Popup><strong>{company}</strong><br />Uttara, Dhaka</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
