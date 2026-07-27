import type { Entrance, Graph, GraphEdge, GraphNode } from "../navigation/pathfinding";
import rawNetwork from "./campusNetwork.json";

// The campus network is generated, not hand-written: `npm run survey:build`
// rebuilds campusNetwork.json from the OpenStreetMap geometry in
// survey/campus-network.geojson plus the accessibility attributes recorded
// in survey/segments.csv. Editing this file by hand would be overwritten on
// the next survey import — change the CSV and re-run instead.

export interface Destination {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Network node where an outdoor route to this destination ends. */
  nodeId: string;
  /**
   * Set when this destination sits inside another one. The Hunterian Museum
   * occupies level 2 of the Main Building, so the outdoor route ends at the
   * building's entrance and the indoor system takes over from there.
   */
  insideOf: string | null;
}

interface CampusNetworkFile {
  generated: string;
  attribution: string;
  destinations: Destination[];
  entrances: Entrance[];
  nodes: GraphNode[];
  segments: GraphEdge[];
}

// The JSON is generated, so its inferred type collapses wherever a column is
// entirely unsurveyed (every value null). Casting through the declared shape
// keeps the app honest about what will be there once data arrives.
const network = rawNetwork as unknown as CampusNetworkFile;

export const campusGraph: Graph = {
  nodes: network.nodes,
  edges: network.segments,
};

/** The four buildings this project navigates between. */
export const destinations: Destination[] = network.destinations;

/** Every mapped way into those buildings — the indoor handover points. */
export const entrances: Entrance[] = network.entrances ?? [];

export const entrancesFor = (destinationId: string): Entrance[] =>
  entrances.filter((e) => e.serves === destinationId);

export const attribution: string = network.attribution;
export const generatedAt: string = network.generated;

export const destinationById = (id: string): Destination | undefined =>
  destinations.find((d) => d.id === id);

/** How much of the network has actually been surveyed, by length. */
export function surveyProgress(): { surveyedM: number; totalM: number; share: number } {
  const totalM = campusGraph.edges.reduce((sum, e) => sum + e.lengthM, 0);
  const surveyedM = campusGraph.edges
    .filter((e) => e.survey.stepFree !== null && e.survey.widthM != null)
    .reduce((sum, e) => sum + e.lengthM, 0);
  return { surveyedM, totalM, share: totalM > 0 ? surveyedM / totalM : 0 };
}
