import { useState } from "react";
import { campusGraph } from "../data/campusGraph";
import { findShortestPath, PathResult } from "../navigation/dijkstra";
import { useTTS } from "../hooks/useTTS";
import CampusMap from "../components/CampusMap";

export default function RoutePlannerPage() {
  const [startId, setStartId] = useState<string>(campusGraph.nodes[0].id);
  const [endId, setEndId] = useState<string>(campusGraph.nodes[1].id);
  const [wheelchairOnly, setWheelchairOnly] = useState(false);
  const [result, setResult] = useState<PathResult | null>(null);
  const [noPath, setNoPath] = useState(false);
  const { speak } = useTTS();

  const nodeName = (id: string): string =>
    campusGraph.nodes.find((n) => n.id === id)?.name ?? id;

  // Run Dijkstra on the campus graph, then announce the result via TTS
  const handleFindRoute = () => {
    const pathResult = findShortestPath(
      campusGraph,
      startId,
      endId,
      wheelchairOnly
    );
    if (pathResult) {
      setResult(pathResult);
      setNoPath(false);
      const names = pathResult.path.map(nodeName);
      speak(
        `Route found. ${Math.round(
          pathResult.totalDistance
        )} metres via ${names.join(", ")}.`
      );
    } else {
      setResult(null);
      setNoPath(true);
      speak("No route found between the selected locations.");
    }
  };

  return (
    <div className="page">
      <h1 className="page-header">Route Planner</h1>
      <div className="page-body">
        <label htmlFor="from-select">From</label>
        <select
          id="from-select"
          value={startId}
          onChange={(e) => setStartId(e.target.value)}
        >
          {campusGraph.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>

        <label htmlFor="to-select">To</label>
        <select
          id="to-select"
          value={endId}
          onChange={(e) => setEndId(e.target.value)}
        >
          {campusGraph.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>

        <div className="checkbox-row">
          <input
            id="wheelchair"
            type="checkbox"
            checked={wheelchairOnly}
            onChange={(e) => setWheelchairOnly(e.target.checked)}
          />
          <label htmlFor="wheelchair" style={{ margin: 0 }}>
            Wheelchair-accessible routes only
          </label>
        </div>

        <button
          className="btn"
          type="button"
          onClick={handleFindRoute}
          aria-label="Find route between selected locations"
        >
          Find Route
        </button>

        {result && (
          <>
            <div className="map-preview">
              <CampusMap routeNodeIds={result.path} />
            </div>
            <div className="result-box">
              <h2 className="result-title">Route Found</h2>
              <p className="result-distance">
                Distance: {Math.round(result.totalDistance)} m
              </p>
              {result.path.map((id, index) => (
                <div key={id} className="result-step">
                  {index + 1}. {nodeName(id)}
                </div>
              ))}
            </div>
          </>
        )}

        {noPath && (
          <div className="result-box">
            <p className="error-text">
              No route found between these locations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
