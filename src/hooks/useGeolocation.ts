import { useCallback, useEffect, useRef, useState } from "react";

export interface Position {
  lat: number;
  lng: number;
  /** Radius of uncertainty in metres, as reported by the browser. */
  accuracyM: number;
  at: number;
}

export interface GeolocationState {
  position: Position | null;
  error: string | null;
  /** True while a watch is running. */
  tracking: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Follows the device position for live guidance.
 *
 * Tracking is opt-in and stoppable: it costs battery, and a location is
 * personal, so it is never started without the traveller asking. The browser
 * will only grant it over HTTPS, which is why the app is served from a
 * secure origin rather than opened as a local file.
 */
export function useGeolocation(): GeolocationState {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError("This browser cannot report your position.");
      return;
    }
    if (watchId.current !== null) return;
    setError(null);
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: p.coords.accuracy,
          at: p.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was refused. Guidance will stay on the map only."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Your position is not available here. GPS needs a view of the sky."
              : "Timed out waiting for your position."
        );
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }, [supported]);

  // Never leave a watch running behind us.
  useEffect(() => stop, [stop]);

  return { position, error, tracking, supported, start, stop };
}
