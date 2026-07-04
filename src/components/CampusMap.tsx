import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { campusGraph } from "../data/campusGraph";
import { Colors } from "../constants/theme";

// University of Glasgow, Gilmorehill campus centre
const GLASGOW_UNI = { lat: 55.8721, lng: -4.2882 };

const containerStyle: React.CSSProperties = { width: "100%", height: "100%" };

// Read once at module load — the key is constant for the app's lifetime
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

interface CampusMapProps {
  // Ordered list of node IDs forming an active route to draw (optional)
  routeNodeIds?: string[];
}

export default function CampusMap({ routeNodeIds = [] }: CampusMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  // Hold the live map instance so we can draw the route imperatively
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const onMapLoad = useCallback((instance: google.maps.Map) => {
    setMap(instance);
  }, []);

  const onMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Draw (or clear) the route line whenever the map or the route changes.
  // Drawing directly on the map instance is more reliable than the
  // declarative <Polyline> component under React StrictMode re-mounts.
  useEffect(() => {
    if (!map) return;

    // Remove any previously drawn route
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // Convert node IDs into coordinates
    const coords = routeNodeIds
      .map((id) => campusGraph.nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => n != null)
      .map((n) => ({ lat: n.lat, lng: n.lng }));

    if (coords.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        path: coords,
        strokeColor: Colors.accent,
        strokeOpacity: 0.9,
        strokeWeight: 6,
        map,
      });

      // Zoom/pan the map so the whole route is visible
      const bounds = new google.maps.LatLngBounds();
      coords.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, 64);
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, routeNodeIds]);

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
      center={GLASGOW_UNI}
      zoom={16}
      onLoad={onMapLoad}
      onUnmount={onMapUnmount}
    >
      {campusGraph.nodes.map((node) => (
        <Marker
          key={node.id}
          position={{ lat: node.lat, lng: node.lng }}
          title={node.name}
        />
      ))}
    </GoogleMap>
  );
}
