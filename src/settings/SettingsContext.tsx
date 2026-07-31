import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { RouteProfile } from "../navigation/accessibility";

// User preferences, kept in one place and persisted.
//
// Persistence is not a nicety here: someone who needs high contrast needs it
// on every visit, and asking them to set it again each time is precisely the
// kind of small, repeated friction this project exists to remove.

export interface Settings {
  /** Stronger colours and heavier focus rings. */
  highContrast: boolean;
  /** Whether the app speaks. */
  voiceGuidance: boolean;
  /** Speak each turn as it approaches, rather than only a summary. */
  spokenTurns: boolean;
  /** Which traveller the route planner starts on. */
  defaultProfile: RouteProfile;
}

const DEFAULTS: Settings = {
  highContrast: false,
  voiceGuidance: true,
  spokenTurns: true,
  defaultProfile: "wheelchair",
};

const STORAGE_KEY = "gilmorehill-nav-settings";

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Merge over the defaults so a setting added in a later version does not
    // arrive undefined for someone with a stored copy of the old shape.
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface SettingsContextValue extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private browsing can refuse storage; the setting still applies for
        // this session, which is better than failing outright.
      }
      return next;
    });
  }, []);

  // High contrast is applied on the document root so it reaches everything,
  // including Leaflet's own controls, which live outside the React tree.
  useEffect(() => {
    document.documentElement.dataset.highContrast = String(settings.highContrast);
  }, [settings.highContrast]);

  return (
    <SettingsContext.Provider value={{ ...settings, set }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
