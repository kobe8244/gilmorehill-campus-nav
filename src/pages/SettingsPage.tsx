import { useSettings } from "../settings/SettingsContext";
import { useTTS } from "../hooks/useTTS";
import { PROFILE_LIST, profileLabel, type RouteProfile } from "../navigation/accessibility";
import { generatedAt, attribution, surveyProgress } from "../data/campusGraph";

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, hint, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="setting-row">
      <span className="setting-label">
        {label}
        <span
          style={{
            display: "block",
            fontWeight: 400,
            fontSize: 15,
            color: "var(--color-text-secondary)",
          }}
        >
          {hint}
        </span>
      </span>
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const { speak, supported } = useTTS();
  const progress = surveyProgress();

  return (
    <div className="page">
      <h1 className="page-header">Settings</h1>
      <div className="page-body">
        <ToggleRow
          label="High contrast"
          hint="Stronger colours and heavier focus outlines."
          checked={settings.highContrast}
          onChange={(v) => settings.set("highContrast", v)}
        />
        <ToggleRow
          label="Voice guidance"
          hint={supported ? "Speak routes and directions aloud." : "This browser has no speech support."}
          checked={settings.voiceGuidance}
          disabled={!supported}
          onChange={(v) => {
            settings.set("voiceGuidance", v);
            if (v) speak("Voice guidance is on.");
          }}
        />
        <ToggleRow
          label="Speak each turn"
          hint="While following a route, announce turns as they approach."
          checked={settings.spokenTurns}
          disabled={!supported || !settings.voiceGuidance}
          onChange={(v) => settings.set("spokenTurns", v)}
        />

        <label htmlFor="default-profile">Plan routes for, by default</label>
        <select
          id="default-profile"
          value={settings.defaultProfile}
          onChange={(e) => settings.set("defaultProfile", e.target.value as RouteProfile)}
        >
          {PROFILE_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="shortest">{profileLabel("shortest")}</option>
        </select>

        <div className="app-info">
          <p>
            Survey coverage: {Math.round(progress.share * 100)}% of{" "}
            {(progress.totalM / 1000).toFixed(2)} km measured on site.
          </p>
          <p>Network generated {new Date(generatedAt).toLocaleDateString("en-GB")}.</p>
          <p style={{ fontSize: 14 }}>{attribution}</p>
        </div>
      </div>
    </div>
  );
}
