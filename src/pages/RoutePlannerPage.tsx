import { useState } from "react";
import { campusGraph, destinations, entrancesFor, surveyProgress } from "../data/campusGraph";
import {
  findRouteToDestination,
  type Entrance,
  type RouteToEntrance,
} from "../navigation/pathfinding";
import {
  assessEntrance,
  describeRoute,
  PROFILE_LIST,
  profileLabel,
  type RouteProfile,
} from "../navigation/accessibility";
import { useTTS } from "../hooks/useTTS";
import CampusMap from "../components/CampusMap";

type Outcome =
  | { kind: "none" }
  | { kind: "route"; route: RouteToEntrance; profile: RouteProfile }
  // The chosen profile found nothing, but a route does exist for someone
  // without that barrier. Saying so is more useful than "no route found".
  | { kind: "noAccessibleRoute"; profile: RouteProfile; fallback: RouteToEntrance | null }
  | { kind: "noRoute" };

export default function RoutePlannerPage() {
  const [startId, setStartId] = useState(destinations[0].id);
  // Default to a pair that is genuinely a journey across campus.
  const [endId, setEndId] = useState(destinations[2].id);
  const [profile, setProfile] = useState<RouteProfile>("wheelchair");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const { speak } = useTTS();

  const nameOf = (id: string) => destinations.find((d) => d.id === id)?.name ?? id;
  const nodeOf = (id: string) => destinations.find((d) => d.id === id)?.nodeId;

  const progress = surveyProgress();
  const reset = () => setOutcome({ kind: "none" });

  // Route to the destination by way of whichever entrance this traveller can
  // actually use, rather than to a single fixed arrival point.
  const routeTo = (dest: string, p: RouteProfile) => {
    const from = nodeOf(startId);
    const to = nodeOf(dest);
    if (!from || !to) return null;
    return findRouteToDestination(
      campusGraph,
      from,
      to,
      entrancesFor(dest),
      p,
      assessEntrance
    );
  };

  const handleFindRoute = () => {
    const route = routeTo(endId, profile);

    if (route && !route.entranceUnusable) {
      setOutcome({ kind: "route", route, profile });
      const summary = describeRoute(route.edges, profile);
      const caution =
        summary.verifiedShare < 1
          ? " Part of this route has not been surveyed yet, so please take care."
          : "";
      // The rest advice is spoken because it is the part a user planning a
      // long walk most needs to hear before setting off.
      const rest = summary.restAdvice ? ` ${summary.restAdvice}` : "";
      speak(
        `Route found from ${nameOf(startId)} to ${nameOf(endId)}. ` +
          `${summary.metres} metres.${rest}${caution}`
      );
      return;
    }

    if (profile !== "shortest") {
      // Either no path, or a path that only reaches a door this traveller
      // cannot use. Both are reported the same way, with the reason given.
      const fallback = route ?? routeTo(endId, "shortest");
      setOutcome({ kind: "noAccessibleRoute", profile, fallback });
      speak(
        `No suitable route was found from ${nameOf(startId)} to ${nameOf(endId)}. ` +
          (route?.entranceUnusable
            ? "A path exists, but no entrance you can use has been recorded there."
            : fallback
              ? "The only known route has barriers you asked to avoid."
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
    reset();
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
            reset();
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
            reset();
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
          <legend style={{ fontWeight: 600, padding: 0 }}>Plan this route for</legend>

          {PROFILE_LIST.map((p) => (
            <div className="checkbox-row" key={p.id} style={{ alignItems: "flex-start" }}>
              <input
                id={`profile-${p.id}`}
                type="radio"
                name="profile"
                value={p.id}
                checked={profile === p.id}
                onChange={() => {
                  setProfile(p.id);
                  reset();
                }}
                style={{ marginTop: 4 }}
              />
              <label htmlFor={`profile-${p.id}`} style={{ margin: 0 }}>
                {p.label}
                <span
                  style={{
                    display: "block",
                    fontWeight: 400,
                    fontSize: 15,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {p.description}
                </span>
              </label>
            </div>
          ))}

          <div className="checkbox-row" style={{ alignItems: "flex-start" }}>
            <input
              id="profile-shortest"
              type="radio"
              name="profile"
              value="shortest"
              checked={profile === "shortest"}
              onChange={() => {
                setProfile("shortest");
                reset();
              }}
              style={{ marginTop: 4 }}
            />
            <label htmlFor="profile-shortest" style={{ margin: 0 }}>
              Shortest route
              <span
                style={{
                  display: "block",
                  fontWeight: 400,
                  fontSize: 15,
                  color: "var(--color-text-secondary)",
                }}
              >
                No accessibility filtering — may include steps and steep climbs.
              </span>
            </label>
          </div>
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
                No suitable route
              </h2>
              <p>
                There is no known route from {nameOf(startId)} to {nameOf(endId)}{" "}
                that meets the needs of “{profileLabel(outcome.profile)}”.
              </p>
              {outcome.fallback?.entranceUnusable && outcome.fallback.entrance ? (
                <>
                  <p>
                    A path reaches the building, but no entrance you can use has
                    been recorded there.
                  </p>
                  <EntranceNote
                    entrance={outcome.fallback.entrance}
                    profile={outcome.profile}
                  />
                </>
              ) : outcome.fallback ? (
                <p>
                  A route does exist ({Math.round(outcome.fallback.distanceM)} m), but
                  it has barriers you asked to avoid. Select{" "}
                  <strong>Shortest route</strong> to see it, or contact the building
                  for assistance.
                </p>
              ) : (
                <p>No route of any kind is mapped between these two places.</p>
              )}
              <p style={{ color: "var(--color-text-secondary)" }}>
                This gap is a survey finding, not an app error: no accessible way
                through has been recorded here yet.
              </p>
            </div>
          )}

          {outcome.kind === "noRoute" && (
            <div className="result-box">
              <p className="error-text">No route found between these locations.</p>
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
          {(progress.totalM / 1000).toFixed(2)} km study network has been measured on
          site. Unmeasured paths are shown as dashed lines.
        </p>
      </div>
    </div>
  );
}

/** How the arrival door looks to this traveller. */
function EntranceNote({ entrance, profile }: { entrance: Entrance; profile: RouteProfile }) {
  const a = assessEntrance(entrance, profile);
  const s = entrance.survey;
  const detail = [
    s.doorType ? `${s.doorType} door` : null,
    s.doorWidthM != null ? `${s.doorWidthM} m wide` : null,
    s.stepFree === true ? "level threshold" : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        margin: "0 0 8px",
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--color-surface)",
        borderLeft: `4px solid ${
          !a.verified
            ? "var(--color-border)"
            : a.passable
              ? "var(--color-success)"
              : "var(--color-error)"
        }`,
      }}
    >
      <strong>Arrive at:</strong> {entrance.id}
      {detail.length > 0 && ` — ${detail.join(", ")}`}
      {a.blockers.length > 0 && (
        <div className="error-text" style={{ marginTop: 4 }}>
          ⚠ {a.blockers.join("; ")}
        </div>
      )}
      {a.warnings.length > 0 && (
        <div style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
          {a.warnings.join("; ")}
        </div>
      )}
      {s.indoorHandoverId && (
        <div style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
          Indoor handover point: <strong>{s.indoorHandoverId}</strong>
        </div>
      )}
    </div>
  );
}

function RouteResult({
  route,
  profile,
  fromName,
  toName,
}: {
  route: RouteToEntrance;
  profile: RouteProfile;
  fromName: string;
  toName: string;
}) {
  const summary = describeRoute(route.edges, profile);
  const fullyVerified = summary.verifiedShare >= 1;
  const label = profileLabel(profile);

  return (
    <>
      <div className="map-preview">
        <CampusMap route={route} profile={profile} />
      </div>
      <div className="result-box">
        <h2 className="result-title">Route found</h2>
        <p className="result-distance">
          {fromName} → {toName}: <strong>{summary.metres} m</strong>
          {route.edges.length > 0 && ` · ${route.edges.length} path segments`}
        </p>
        <p style={{ margin: "0 0 8px", color: "var(--color-text-secondary)" }}>
          Planned for: {label}
        </p>

        {route.entrance && <EntranceNote entrance={route.entrance} profile={profile} />}

        {summary.restAdvice && (
          <p
            style={{
              margin: "0 0 8px",
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--color-surface)",
              borderLeft: `4px solid ${
                summary.restPoints > 0 ? "var(--color-success)" : "var(--color-error)"
              }`,
            }}
          >
            {summary.restAdvice}
          </p>
        )}

        {!fullyVerified && (
          <p className="error-text">
            ⚠ {Math.round((1 - summary.verifiedShare) * 100)}% of this route has not
            been surveyed yet — its accessibility is unconfirmed.
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
