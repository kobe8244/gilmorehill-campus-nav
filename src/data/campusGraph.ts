import { Graph } from "../navigation/dijkstra";

export const campusGraph: Graph = {
  nodes: [
    { id: "main_building", name: "Main Building", lat: 55.8722, lng: -4.2884 },
    { id: "james_watt_south", name: "James Watt Building (South)", lat: 55.8711, lng: -4.2894 },
    { id: "library", name: "University Library", lat: 55.8734, lng: -4.2892 },
    { id: "boyd_orr", name: "Boyd Orr Building", lat: 55.8718, lng: -4.2915 },
    { id: "joseph_black", name: "Joseph Black Building", lat: 55.8706, lng: -4.2935 },
    { id: "kelvin_building", name: "Kelvin Building", lat: 55.8714, lng: -4.2870 },
    { id: "fraser_building", name: "Fraser Building", lat: 55.8729, lng: -4.2862 },
    { id: "hunter_halls", name: "Hunter Halls", lat: 55.8740, lng: -4.2878 },
    { id: "west_quad", name: "West Quadrangle", lat: 55.8719, lng: -4.2900 },
    { id: "east_quad", name: "East Quadrangle", lat: 55.8723, lng: -4.2870 },
  ],
  edges: [
    { from: "main_building", to: "west_quad", distance: 80, wheelchairAccessible: true },
    { from: "main_building", to: "east_quad", distance: 90, wheelchairAccessible: true },
    { from: "main_building", to: "library", distance: 150, wheelchairAccessible: true },
    { from: "west_quad", to: "boyd_orr", distance: 120, wheelchairAccessible: true },
    { from: "west_quad", to: "james_watt_south", distance: 100, wheelchairAccessible: true },
    { from: "boyd_orr", to: "joseph_black", distance: 180, wheelchairAccessible: false },
    { from: "east_quad", to: "kelvin_building", distance: 110, wheelchairAccessible: true },
    { from: "east_quad", to: "fraser_building", distance: 95, wheelchairAccessible: true },
    { from: "library", to: "hunter_halls", distance: 85, wheelchairAccessible: true },
    { from: "fraser_building", to: "hunter_halls", distance: 130, wheelchairAccessible: true },
    { from: "james_watt_south", to: "joseph_black", distance: 200, wheelchairAccessible: true },
    { from: "kelvin_building", to: "fraser_building", distance: 100, wheelchairAccessible: true },
  ],
};
