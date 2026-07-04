import CampusMap from "../components/CampusMap";

export default function MapPage() {
  return (
    <div className="page">
      <h1 className="page-header">Campus Map</h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CampusMap />
      </div>
    </div>
  );
}
