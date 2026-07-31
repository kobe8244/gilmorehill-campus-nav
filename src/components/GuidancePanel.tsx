import { useEffect, useRef } from "react";
import type { Route } from "../navigation/pathfinding";
import type { RouteProfile } from "../navigation/accessibility";
import {
  buildGuidance,
  locateOnRoute,
  spokenFor,
  type GuidanceStep,
  type RouteProgress,
} from "../navigation/guidance";
import { useGeolocation } from "../hooks/useGeolocation";
import { useSettings } from "../settings/SettingsContext";
import { useTTS } from "../hooks/useTTS";

// How far from the route before we say anything. GPS between tall sandstone
// buildings drifts by tens of metres, so the threshold is generous: crying
// "you have left the route" at every wobble would train the traveller to
// ignore the one time it matters.
const OFF_ROUTE_M = 35;

/** Announce the next turn once the traveller is this close to it. */
const ANNOUNCE_WITHIN_M = 25;

interface Props {
  route: Route;
  profile: RouteProfile;
  destinationName: string;
  /** Reported upward so the map can draw the traveller's position. */
  onPosition?: (p: { lat: number; lng: number; accuracyM: number } | null) => void;
}

export default function GuidancePanel({ route, profile, destinationName, onPosition }: Props) {
  const { position, error, tracking, supported, start, stop } = useGeolocation();
  const settings = useSettings();
  const { speak } = useTTS();

  const steps: GuidanceStep[] = buildGuidance(route, destinationName, profile);
  const progress: RouteProgress | null = position ? locateOnRoute(route, steps, position) : null;

  useEffect(() => {
    onPosition?.(position);
  }, [position, onPosition]);

  // Speak each instruction once, as it comes within range. Tracking the last
  // spoken index stops the same turn being repeated on every GPS tick.
  const spokenIndex = useRef(-1);
  useEffect(() => {
    if (!settings.voiceGuidance || !settings.spokenTurns || !progress) return;
    const nextIndex = Math.min(progress.stepIndex + 1, steps.length - 1);
    if (nextIndex === spokenIndex.current) return;
    if (progress.toNextM <= ANNOUNCE_WITHIN_M) {
      spokenIndex.current = nextIndex;
      speak(spokenFor(steps[nextIndex]));
    }
  }, [progress, steps, settings.voiceGuidance, settings.spokenTurns, speak]);

  const next = progress ? steps[Math.min(progress.stepIndex + 1, steps.length - 1)] : steps[1];

  return (
    <div className="guidance">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Directions</h3>
        {supported && (
          <button
            className="btn"
            type="button"
            style={{ width: "auto", marginTop: 0, padding: "8px 14px" }}
            onClick={tracking ? stop : start}
          >
            {tracking ? "Stop following" : "📍 Follow me"}
          </button>
        )}
      </div>

      {error && (
        <p className="error-text" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}

      {/* Live state, once a position is known. */}
      {progress && (
        <div aria-live="polite" style={{ marginTop: 12 }}>
          <p className="guidance-manoeuvre">{next.text.replace(/, then continue.*/, "")}</p>
          <p className="guidance-distance">
            in {progress.toNextM} m
            <span style={{ fontSize: 16, fontWeight: 400, color: "var(--color-text-secondary)" }}>
              {" "}
              · {progress.remainingM} m to go
            </span>
          </p>
          {next.notes.length > 0 && (
            <ul style={{ margin: "0 0 8px", paddingLeft: 22 }}>
              {next.notes.map((n) => (
                <li key={n} className="guidance-note">
                  {n}
                </li>
              ))}
            </ul>
          )}
          {progress.offRouteM > OFF_ROUTE_M && (
            <p className="guidance-off-route">
              You appear to be about {progress.offRouteM} m from the route. If the
              position looks wrong, note that GPS is unreliable between tall
              buildings — follow the map rather than the arrow.
            </p>
          )}
          {position && (
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
              Position accurate to about {Math.round(position.accuracyM)} m
            </p>
          )}
        </div>
      )}

      {/* The whole route, always available — it is what a traveller reads
          before setting off, and what someone without GPS relies on. */}
      <ol className="step-list">
        {steps.map((s, i) => (
          <li key={`${s.distanceFromStartM}-${i}`} className={progress?.stepIndex === i ? "current" : ""}>
            <span>
              {s.manoeuvre === "arrive" ? s.text : `${s.text}`}
              {s.distanceFromStartM > 0 && s.manoeuvre !== "arrive" && (
                <span style={{ color: "var(--color-text-secondary)" }}> (at {s.distanceFromStartM} m)</span>
              )}
            </span>
            {s.notes.length > 0 && (
              <ul style={{ margin: "4px 0 0", paddingLeft: 22, fontWeight: 400 }}>
                {s.notes.map((n) => (
                  <li key={n} style={{ color: "var(--color-text-secondary)" }}>
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {!supported && (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 15 }}>
          This browser cannot report your position, so the directions above are
          listed rather than followed live.
        </p>
      )}
    </div>
  );
}
