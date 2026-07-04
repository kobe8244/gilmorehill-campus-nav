export type TabKey = "map" | "planner" | "settings";

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "map", label: "Map", icon: "🗺️" },
  { key: "planner", label: "Route Planner", icon: "🧭" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

// Bottom tab bar. Buttons are large (min 64px) with high-contrast
// active styling for accessibility, and expose aria labels/current state.
export default function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab-button${active === tab.key ? " active" : ""}`}
          onClick={() => onChange(tab.key)}
          aria-current={active === tab.key ? "page" : undefined}
          aria-label={`${tab.label} tab`}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
