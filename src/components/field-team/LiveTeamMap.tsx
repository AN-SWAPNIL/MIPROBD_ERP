import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { CurrentEmployeeLocation, LocationHistoryPoint } from "../../domains/erp.types";

const statusColor = { LIVE: "#059669", RECENT: "#0891b2", STALE: "#d97706", OFFLINE: "#64748b", NOT_TRACKING: "#b91c1c" } as const;

function markerIcon(location: CurrentEmployeeLocation, selected: boolean) {
  const color = statusColor[location.status];
  const initials = location.employee.name.split(" ").map((part) => part[0]).slice(0, 2).join("");
  return L.divIcon({
    className: "field-map-marker",
    html: `<span style="display:grid;width:${selected ? 42 : 36}px;height:${selected ? 42 : 36}px;place-items:center;border-radius:50%;background:${color};color:#fff;font:700 11px system-ui;border:3px solid #fff;box-shadow:0 3px 12px rgba(15,23,42,.35)">${initials}</span>`,
    iconSize: [selected ? 42 : 36, selected ? 42 : 36],
    iconAnchor: [selected ? 21 : 18, selected ? 21 : 18]
  });
}

function ClusteredEmployees({ locations, selectedId, onSelect }: { locations: CurrentEmployeeLocation[]; selectedId?: string; onSelect: (location: CurrentEmployeeLocation) => void }) {
  const map = useMap();
  useEffect(() => {
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true });
    for (const location of locations) {
      const marker = L.marker([location.latitude, location.longitude], { icon: markerIcon(location, location.userId === selectedId), title: `${location.employee.name} · ${location.status}` });
      marker.on("click", () => onSelect(location));
      marker.bindTooltip(`${location.employee.name} · ${location.status}`, { direction: "top", offset: [0, -18] });
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
    if (locations.length) map.fitBounds(L.latLngBounds(locations.map((location) => [location.latitude, location.longitude] as [number, number])), { padding: [36, 36], maxZoom: 13 });
    return () => { map.removeLayer(cluster); };
  }, [locations, map, onSelect, selectedId]);
  return null;
}

function FocusSelected({ location }: { location?: CurrentEmployeeLocation }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 14), { duration: 0.65 });
  }, [location, map]);
  return null;
}

export function LiveTeamMap({ locations, selectedId, onSelect }: { locations: CurrentEmployeeLocation[]; selectedId?: string; onSelect: (location: CurrentEmployeeLocation) => void }) {
  const selected = locations.find((location) => location.userId === selectedId);
  return <MapContainer className="h-full min-h-[430px] w-full" center={[23.8103, 90.4125]} zoom={11} scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ClusteredEmployees locations={locations} selectedId={selectedId} onSelect={onSelect} /><FocusSelected location={selected} />{locations.filter((location) => location.currentVisit).map((location) => <CircleMarker key={`customer-${location.currentVisit!.id}`} center={[location.currentVisit!.customerLatitude, location.currentVisit!.customerLongitude]} radius={7} pathOptions={{ color: "#075985", fillColor: "#e0f2fe", fillOpacity: 1, weight: 2 }}><Tooltip>{location.currentVisit!.customerName}</Tooltip></CircleMarker>)}</MapContainer>;
}

export function RouteHistoryMap({ points, visits }: { points: LocationHistoryPoint[]; visits: CurrentEmployeeLocation["currentVisit"][] }) {
  const route = points.map((point) => [point.latitude, point.longitude] as [number, number]);
  return <MapContainer className="h-full min-h-[400px] w-full" center={route[0] ?? [23.8103, 90.4125]} zoom={12} scrollWheelZoom><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{route.length ? <Polyline positions={route} pathOptions={{ color: "#0891b2", weight: 5, opacity: 0.85 }} /> : null}{points.map((point) => <CircleMarker key={point.id} center={[point.latitude, point.longitude]} radius={point.event === "VISIT_CHECK_IN" || point.event === "VISIT_CHECK_OUT" ? 7 : 4} pathOptions={{ color: point.event?.startsWith("VISIT") ? "#059669" : "#075985", fillOpacity: 1 }}><Tooltip>{new Date(point.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {point.event?.replaceAll("_", " ") ?? "LOCATION"}</Tooltip></CircleMarker>)}{visits.filter(Boolean).map((visit) => <CircleMarker key={visit!.id} center={[visit!.customerLatitude, visit!.customerLongitude]} radius={8} pathOptions={{ color: "#d97706", fillColor: "#fef3c7", fillOpacity: 1 }}><Tooltip>{visit!.customerName}</Tooltip></CircleMarker>)}</MapContainer>;
}
