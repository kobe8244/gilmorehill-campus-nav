import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { campusGraph, destinations, entrances } from "../data/campusGraph";
import { assessEntrance, isSurveyed, type RouteProfile } from "../navigation/accessibility";
import type { Route } from "../navigation/pathfinding";
import { Colors } from "../constants/theme";

// Centre of the four-destination study area.
const STUDY_AREA_CENTRE: L.LatLngExpression = [55.8723, -4.2878];

// OpenStreetMap tiles, the same source the path network itself comes from.
// Using OSM for the basemap as well as the data keeps the attribution
// honest and removes any need for an API key — which means anyone can run
// this project without registering for anything.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface CampusMapProps {
  /** Active route to draw, if any. */
  route?: Route | null;
  /** Who the route was planned for — decides how entrances are marked. */
  profile?: RouteProfile;
  /** Draw the surveyed network faintly behind the route. */
  showNetwork?: boolean;
}

export default function CampusMap({
  route = null,
  profile = "wheelchair",
  showNetwork = true,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // Create the map once. Leaflet is imperative, so it is held in a ref and
  // torn down explicitly — StrictMode mounts twice in development and would
  // otherwise leave a second map bound to the same container.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: STUDY_AREA_CENTRE,
      zoom: 17,
      // Keyboard panning is on by default and is part of being usable
      // without a mouse.
      keyboard: true,
    });
    L.tileLayer(TILE_URL, { maxZoom: 20, attribution: TILE_ATTRIBUTION }).addTo(map);
    mapRef.current = map;

    if (showNetwork) {
      // The surveyed network, drawn faintly, so the user can see which
      // ground the app has data for — and, by omission, which it does not.
      for (const edge of campusGraph.edges) {
        L.polyline(
          edge.coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple),
          { color: Colors.border, weight: 3, opacity: 0.9, interactive: false }
        ).addTo(map);
      }
    }

    for (const d of destinations) {
      L.marker([d.lat, d.lng], {
        title: d.name,
        alt: d.name,
        keyboard: true,
      })
        .bindTooltip(d.name, { permanent: false, direction: "top" })
        .bindPopup(
          `<b>${d.name}</b>` +
            (d.insideOf ? "<br>Inside the Main Building — route ends at its entrance" : "")
        )
        .addTo(map);
    }

    routeLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
    };
  }, [showNetwork]);

  // Redraw the route whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (!route || route.edges.length === 0) return;

    const bounds = L.latLngBounds([]);

    // One polyline per segment rather than one for the whole route, so a
    // segment nobody has surveyed can be drawn differently from one that
    // has been checked. A route is only as trustworthy as its worst part.
    for (const edge of route.edges) {
      const line = edge.coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      line.forEach((p) => bounds.extend(p));
      L.polyline(line, {
        color: Colors.accent,
        weight: 7,
        opacity: 0.95,
        // A dashed line reads as provisional, which is what an unsurveyed
        // segment is.
        dashArray: isSurveyed(edge) ? undefined : "10 8",
      })
        .bindPopup(
          `<b>${edge.id}</b> · ${edge.lengthM} m · ${edge.highway}` +
            (isSurveyed(edge) ? "" : "<br><i>not yet surveyed</i>")
        )
        .addTo(layer);
    }

    // Mark the arrival door, coloured by whether this traveller can use it.
    const arrival = route.nodeIds[route.nodeIds.length - 1];
    const door = entrances.find((e) => e.nodeId === arrival);
    if (door && door.lat != null && door.lng != null) {
      const verdict = assessEntrance(door, profile);
      L.circleMarker([door.lat, door.lng], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: !verdict.verified
          ? Colors.textSecondary
          : verdict.passable
            ? Colors.success
            : Colors.error,
        fillOpacity: 1,
      })
        .bindPopup(
          `<b>Entrance</b> ${door.id}` +
            (verdict.blockers.length ? `<br>⚠ ${verdict.blockers.join("; ")}` : "") +
            (verdict.warnings.length ? `<br>${verdict.warnings.join("; ")}` : "")
        )
        .addTo(layer);
      bounds.extend([door.lat, door.lng]);
    }

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }, [route, profile]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
      role="application"
      aria-label="Campus map showing the surveyed path network and the planned route"
    />
  );
}
