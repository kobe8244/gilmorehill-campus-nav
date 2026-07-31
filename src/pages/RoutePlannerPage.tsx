import { useCallback, useState } from "react";
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
import { useGeolocation } from "../hooks/useGeolocation";
import { snapToNetwork, withVirtualStart, coverageFor, YOU_ARE_HERE } from "../navigation/snap";
import { useSettings } from "../settings/SettingsContext";
import GuidancePanel from "../components/GuidancePanel";
import CampusMap from "../components/CampusMap";

type Outcome =
  | { kind: "none" }
  | { kind: "route"; route: RouteToEntrance; profile: RouteProfile }
  // The chosen profile found nothing, but a route does exist for someone
  // without that barrier. Saying so is more useful than "no route found".
  | { kind: "noAccessibleRoute"; profile: RouteProfile; fallback: RouteToEntrance | null }
  | { kind: "noRoute" };

export default function RoutePlannerPage() {
  // "__here" means the traveller's own position rather than a building.
  const HERE = "__here";
  const [startId, setStartId] = useState<string>(destinations[0].id);
  // Default to a pair that is genuinely a journey across campus.
  const [endId, setEndId] = useState(destinations[2].id);
  const settings = useSettings();
  // Starts on the traveller's saved preference; changing it here is a
  // one-off for this journey and does not overwrite the setting.
  const [profile, setProfile] = useState<RouteProfile>(settings.defaultProfile);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "none" });
  const { speak: rawSpeak } = useTTS();
  const geo = useGeolocation();
  const here = geo.position;

  // One place decides whether the app talks, so the setting cannot be
  // bypassed by a call site that forgot about it.
  const speak = useCallback(
    (text: string) => { if (settings.voiceGuidance) rawSpeak(text); },
    [settings.voiceGuidance, rawSpeak]
  );

  const nameOf = (id: string) =>
    id === HERE ? "your location" : (destinations.find((d) => d.id === id)?.name ?? id);
  const nodeOf = (id: string) => destinations.find((d) => d.id === id)?.nodeId;

  const progress = surveyProgress();
  const reset = () => setOutcome({ kind: "none" });

  // Where the traveller is on the network, when starting from their own
  // position. Recomputed as the position updates so the route always begins
  // where they actually are, not at the nearest junction.
  const snap = startId === HERE && here ? snapToNetwork(campusGraph, here, profile) : null;
  const coverage = startId === HERE ? coverageFor(snap) : null;

  // Route to the destination by way of whichever entrance this traveller can
  // actually use, rather than to a single fixed arrival point.
  const routeTo = (dest: string, p: RouteProfile) => {
    const to = nodeOf(dest);
    if (!to) return null;

    if (startId === HERE) {
      if (!snap || !coverage?.covered) return null;
      // Splitting the path the traveller stands on gives a route that starts
      // under their feet rather than at a junction some way off.
      const graph = withVirtualStart(campusGraph, snap);
      const fromNode = graph.nodes.some((n) => n.id === YOU_ARE_HERE)
        ? YOU_ARE_HERE
        : snap.edge.from;
      return findRouteToDestination(graph, fromNode, to, entrancesFor(dest), p, assessEntrance);
    }

    const from = nodeOf(startId);
    if (!from) return null;
    return findRouteToDestination(campusGraph, from, to, entrancesFor(dest), p, assessEntrance);
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
    // The traveller's own position can only ever be a starting point.
    if (startId === HERE) return;
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
            if (e.target.value === HERE && !geo.tracking) geo.start();
          }}
        >
          <option value={HERE}>📍 My location</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {startId === HERE && <LocationStatus geo={geo} coverage={coverage} />}

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
          disabled={startId === HERE}
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
          disabled={startId === endId || (startId === HERE && !coverage?.covered)}
          aria-label="Find route between the selected locations"
        >
          {startId === endId
            ? "Choose two different places"
            : startId === HERE && !here
              ? "Waiting for your position…"
              : startId === HERE && !coverage?.covered
                ? "Outside the surveyed area"
                : "Find Route"}
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
              geo={geo}
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
  geo,
}: {
  route: RouteToEntrance;
  profile: RouteProfile;
  fromName: string;
  toName: string;
  geo: ReturnType<typeof useGeolocation>;
}) {
  const summary = describeRoute(route.edges, profile);
  const fullyVerified = summary.verifiedShare >= 1;
  const label = profileLabel(profile);

  return (
    <>
      <div className="map-preview">
        <CampusMap route={route} profile={profile} here={geo.position} />
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

      <GuidancePanel
        route={route}
        profile={profile}
        destinationName={toName}
        position={geo.position}
        error={geo.error}
        tracking={geo.tracking}
        supported={geo.supported}
        start={geo.start}
        stop={geo.stop}
      />
    </>
  );
}

/** Whether the traveller's position is known, and whether we cover it. */
function LocationStatus({
  geo,
  coverage,
}: {
  geo: ReturnType<typeof useGeolocation>;
  coverage: { covered: boolean; distanceM: number; message: string } | null;
}) {
  if (!geo.supported) {
    return (
      <p className="error-text" style={{ marginTop: 8 }}>
        This browser cannot report your position. Choose a starting building instead.
      </p>
    );
  }
  if (geo.error) {
    return (
      <p className="error-text" style={{ marginTop: 8 }}>
        {geo.error}
      </p>
    );
  }
  if (!geo.position) {
    return (
      <p style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>
        Finding your position… allow location access when the browser asks.
      </p>
    );
  }
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--color-surface)",
        borderLeft: `4px solid ${
          coverage?.covered ? "var(--color-success)" : "var(--color-error)"
        }`,
      }}
    >
      <div style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>
        Position accurate to about {Math.round(geo.position.accuracyM)} m
      </div>
      {coverage?.message && <div style={{ marginTop: 4 }}>{coverage.message}</div>}
    </div>
  );
}
