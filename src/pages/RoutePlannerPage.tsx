import { useState } from "react";
import { campusGraph, destinations, surveyProgress } from "../data/campusGraph";
import { findRoute, type Route } from "../navigation/pathfinding";
import { describeRoute, type RouteProfile } from "../navigation/accessibility";
import { useTTS } from "../hooks/useTTS";
import CampusMap from "../components/CampusMap";

type Outcome =
  | { kind: "none" }
  | { kind: "route"; route: Route; profile: RouteProfile }
  // The accessible search found nothing, but a route does exist for someone
  // who can manage steps. Saying so is more useful than "no route found".
  | { kind: "noAccessibleRoute"; fallback: Route | null }
  | { kind: "noRoute" };

export default function RoutePlannerPage() {
  const [startId, setStartId] = useState(destinations[0].id);
  // Default to a pair that is genuinely a journey across campus.
  const [endId, setEndId] = useState(destinations[2].id);
  const [profile, setProfile] = useState<RouteProfile>("accessible");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const { speak } = useTTS();

  const nameOf = (id: string) => destinations.find((d) => d.id === id)?.name ?? id;
  const nodeOf = (id: string) => destinations.find((d) => d.id === id)?.nodeId;

  const progress = surveyProgress();

  const handleFindRoute = () => {
    const from = nodeOf(startId);
    const to = nodeOf(endId);
    if (!from || !to) return;

    const route = findRoute(campusGraph, from, to, profile);

    if (route) {
      setOutcome({ kind: "route", route, profile });
      const summary = describeRoute(route.edges);
      const caution =
        summary.verifiedShare < 1
          ? " Part of this route has not been surveyed yet, so please take care."
          : "";
      speak(
        `Route found from ${nameOf(startId)} to ${nameOf(endId)}. ` +
          `${summary.metres} metres.${caution}`
      );
      return;
    }

    if (profile === "accessible") {
      const fallback = findRoute(campusGraph, from, to, "shortest");
      setOutcome({ kind: "noAccessibleRoute", fallback });
      speak(
        `No step-free route was found from ${nameOf(startId)} to ${nameOf(endId)}. ` +
          (fallback
            ? "The only known route includes steps."
            : "No route is known at all.")
      );
      return;
    }

    setOutcome({ kind: "noRoute" });
    speak("No route found between the selected locations.");
  };

  const swap = () => {
    setStartId(endId);
    setEndId(startId);
    setOutcome({ kind: "none" });
  };

  return (
    <div className="page">
      <h1 className="page-header">Route Planner</h1>
      <div className="page-body">
        <label htmlFor="from-select">From</label>
        <select
          id="from-select"
          value={startId}
          onChange={(e) => {
            setStartId(e.target.value);
            setOutcome({ kind: "none" });
          }}
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <label htmlFor="to-select">To</label>
        <select
          id="to-select"
          value={endId}
          onChange={(e) => {
            setEndId(e.target.value);
            setOutcome({ kind: "none" });
          }}
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <button
          className="btn"
          type="button"
          onClick={swap}
          style={{ background: "var(--color-primary-light)", marginTop: 12 }}
        >
          ⇅ Swap start and destination
        </button>

        <fieldset style={{ border: "none", padding: 0, margin: "20px 0 0" }}>
          <legend style={{ fontWeight: 600, padding: 0 }}>Route type</legend>
          {(
            [
              ["accessible", "Step-free (wheelchair accessible)"],
              ["shortest", "Shortest route (may include steps)"],
            ] as const
          ).map(([value, text]) => (
            <div className="checkbox-row" key={value}>
              <input
                id={`profile-${value}`}
                type="radio"
                name="profile"
                value={value}
                checked={profile === value}
                onChange={() => {
                  setProfile(value);
                  setOutcome({ kind: "none" });
                }}
              />
              <label htmlFor={`profile-${value}`} style={{ margin: 0 }}>
                {text}
              </label>
            </div>
          ))}
        </fieldset>

        <button
          className="btn"
          type="button"
          onClick={handleFindRoute}
          disabled={startId === endId}
          aria-label="Find route between the selected locations"
        >
          {startId === endId ? "Choose two different places" : "Find Route"}
        </button>

        {/* aria-live so a screen-reader user hears the result without
            having to hunt for where it appeared on the page. */}
        <div aria-live="polite">
          {outcome.kind === "route" && (
            <RouteResult
              route={outcome.route}
              profile={outcome.profile}
              fromName={nameOf(startId)}
              toName={nameOf(endId)}
            />
          )}

          {outcome.kind === "noAccessibleRoute" && (
            <div className="result-box">
              <h2 className="result-title" style={{ color: "var(--color-error)" }}>
                No step-free route
              </h2>
              <p>
                There is no known step-free route from {nameOf(startId)} to{" "}
                {nameOf(endId)}.
              </p>
              {outcome.fallback ? (
                <p>
                  The only route currently mapped includes steps
                  {" ("}
                  {Math.round(outcome.fallback.distanceM)} m{")"}. Switch to{" "}
                  <strong>Shortest route</strong> to see it, or contact the
                  building for assistance.
                </p>
              ) : (
                <p>No route of any kind is mapped between these two places.</p>
              )}
              <p style={{ color: "var(--color-text-secondary)" }}>
                This gap is a survey finding, not an app error: no accessible
                entrance has been recorded here yet.
              </p>
            </div>
          )}

          {outcome.kind === "noRoute" && (
            <div className="result-box">
              <p className="error-text">
                No route found between these locations.
              </p>
            </div>
          )}
        </div>

        <p
          style={{
            marginTop: 24,
            color: "var(--color-text-secondary)",
            fontSize: 15,
          }}
        >
          Survey progress: {Math.round(progress.share * 100)}% of the{" "}
          {(progress.totalM / 1000).toFixed(2)} km study network has been
          measured on site. Unmeasured paths are shown as dashed lines.
        </p>
      </div>
    </div>
  );
}

function RouteResult({
  route,
  profile,
  fromName,
  toName,
}: {
  route: Route;
  profile: RouteProfile;
  fromName: string;
  toName: string;
}) {
  const summary = describeRoute(route.edges);
  const fullyVerified = summary.verifiedShare >= 1;

  return (
    <>
      <div className="map-preview">
        <CampusMap route={route} />
      </div>
      <div className="result-box">
        <h2 className="result-title">
          {profile === "accessible" ? "Step-free route found" : "Route found"}
        </h2>
        <p className="result-distance">
          {fromName} → {toName}: <strong>{summary.metres} m</strong>
          {route.edges.length > 0 && ` · ${route.edges.length} path segments`}
        </p>

        {!fullyVerified && (
          <p className="error-text">
            ⚠ {Math.round((1 - summary.verifiedShare) * 100)}% of this route has
            not been surveyed yet — its accessibility is unconfirmed.
          </p>
        )}

        {summary.warnings.length > 0 && (
          <>
            <h3 style={{ fontSize: 18, margin: "12px 0 4px" }}>Along the way</h3>
            <ul style={{ margin: 0, paddingLeft: 22 }}>
              {summary.warnings.map((w) => (
                <li key={w} className="result-step">
                  {w}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
