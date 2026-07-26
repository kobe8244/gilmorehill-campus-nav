import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { campusGraph, destinations } from "../data/campusGraph";
import { assess } from "../navigation/accessibility";
import type { Route } from "../navigation/pathfinding";
import { Colors } from "../constants/theme";

// Centre of the four-destination study area.
const STUDY_AREA_CENTRE = { lat: 55.8723, lng: -4.2878 };

const containerStyle: React.CSSProperties = { width: "100%", height: "100%" };

// Read once at module load — the key is constant for the app's lifetime
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

interface CampusMapProps {
  /** Active route to draw, if any. */
  route?: Route | null;
  /** Draw the surveyed network faintly behind the route. */
  showNetwork?: boolean;
}

export default function CampusMap({ route = null, showNetwork = true }: CampusMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  // Hold the live map instance so the route can be drawn imperatively.
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const routeLinesRef = useRef<google.maps.Polyline[]>([]);
  const networkLinesRef = useRef<google.maps.Polyline[]>([]);

  const onMapLoad = useCallback((instance: google.maps.Map) => setMap(instance), []);
  const onMapUnmount = useCallback(() => setMap(null), []);

  // The surveyed network, drawn faintly so the user can see which ground the
  // app actually has data for — and, by omission, which it does not.
  useEffect(() => {
    if (!map) return;
    networkLinesRef.current.forEach((l) => l.setMap(null));
    networkLinesRef.current = [];

    if (showNetwork) {
      for (const edge of campusGraph.edges) {
        networkLinesRef.current.push(
          new google.maps.Polyline({
            path: edge.coords.map(([lng, lat]) => ({ lat, lng })),
            strokeColor: Colors.border,
            strokeOpacity: 0.85,
            strokeWeight: 3,
            map,
          })
        );
      }
    }

    return () => {
      networkLinesRef.current.forEach((l) => l.setMap(null));
      networkLinesRef.current = [];
    };
  }, [map, showNetwork]);

  // Draw (or clear) the route whenever the map or the route changes.
  // Drawing directly on the map instance is more reliable than the
  // declarative <Polyline> component under React StrictMode re-mounts.
  useEffect(() => {
    if (!map) return;
    routeLinesRef.current.forEach((l) => l.setMap(null));
    routeLinesRef.current = [];

    if (!route || route.edges.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    // One polyline per segment rather than one for the whole route, so a
    // segment nobody has surveyed can be drawn differently from one that
    // has been checked. The route is only as trustworthy as its worst part.
    for (const edge of route.edges) {
      const path = edge.coords.map(([lng, lat]) => ({ lat, lng }));
      path.forEach((p) => bounds.extend(p));

      const { verified } = assess(edge);
      routeLinesRef.current.push(
        new google.maps.Polyline({
          path,
          strokeColor: Colors.accent,
          strokeOpacity: verified ? 0.95 : 0,
          strokeWeight: 7,
          map,
          // A dashed line reads as provisional, which is exactly what an
          // unsurveyed segment is.
          icons: verified
            ? undefined
            : [
                {
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 0.95,
                    strokeColor: Colors.accent,
                    strokeWeight: 7,
                    scale: 3,
                  },
                  offset: "0",
                  repeat: "14px",
                },
              ],
        })
      );
    }

    map.fitBounds(bounds, 72);

    return () => {
      routeLinesRef.current.forEach((l) => l.setMap(null));
      routeLinesRef.current = [];
    };
  }, [map, route]);

  if (loadError) {
    return (
      <div style={{ padding: 24 }} className="error-text">
        Failed to load Google Maps. Check the API key and that the Maps
        JavaScript API is enabled.
      </div>
    );
  }

  if (!isLoaded) {
    return <div style={{ padding: 24 }}>Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={STUDY_AREA_CENTRE}
      zoom={17}
      onLoad={onMapLoad}
      onUnmount={onMapUnmount}
    >
      {destinations.map((d) => (
        <Marker
          key={d.id}
          position={{ lat: d.lat, lng: d.lng }}
          title={
            d.insideOf
              ? `${d.name} — inside the Main Building; route ends at its entrance`
              : d.name
          }
        />
      ))}
    </GoogleMap>
  );
}
