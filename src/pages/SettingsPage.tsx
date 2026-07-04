import { useState } from "react";
import { useTTS } from "../hooks/useTTS";

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [highContrast, setHighContrast] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [wheelchairRoutes, setWheelchairRoutes] = useState(false);
  const { speak, supported } = useTTS();

  return (
    <div className="page">
      <h1 className="page-header">Settings</h1>
      <div className="page-body">
        <ToggleRow
          label="High Contrast Mode"
          checked={highContrast}
          onChange={setHighContrast}
        />
        <ToggleRow
          label="Voice Guidance"
          checked={voiceGuidance}
          onChange={setVoiceGuidance}
        />
        <ToggleRow
          label="Wheelchair-Accessible Routes Only"
          checked={wheelchairRoutes}
          onChange={setWheelchairRoutes}
        />

        <button
          className="btn"
          type="button"
          disabled={!supported}
          onClick={() =>
            speak(
              "Voice guidance is working. Head north towards the Main Building."
            )
          }
        >
          Test Voice Guidance
        </button>
        {!supported && (
          <p className="error-text">
            Voice guidance is not supported in this browser.
          </p>
        )}

        <div className="app-info">
          <p>Gilmorehill Campus Navigation v1.0.0</p>
          <p>ENG5059P MSc Project — University of Glasgow</p>
        </div>
      </div>
    </div>
  );
}
