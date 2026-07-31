import { useState } from "react";
import MapPage from "./pages/MapPage";
import RoutePlannerPage from "./pages/RoutePlannerPage";
import SettingsPage from "./pages/SettingsPage";
import TabBar, { TabKey } from "./components/TabBar";
import { SettingsProvider } from "./settings/SettingsContext";

export default function App() {
  // Which of the three tabs is currently shown. A simple state-based
  // switcher keeps the demo lightweight (no router dependency).
  const [activeTab, setActiveTab] = useState<TabKey>("planner");

  return (
    <SettingsProvider>
      <div className="app-shell">
        <main className="app-content">
          {activeTab === "map" && <MapPage />}
          {activeTab === "planner" && <RoutePlannerPage />}
          {activeTab === "settings" && <SettingsPage />}
        </main>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    </SettingsProvider>
  );
}
