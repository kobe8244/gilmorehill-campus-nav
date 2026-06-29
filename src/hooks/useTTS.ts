import { useCallback } from "react";
import * as Speech from "expo-speech";

export function useTTS() {
  const speak = useCallback((text: string) => {
    Speech.speak(text, {
      language: "en-GB",
      rate: 0.85,
    });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
  }, []);

  return { speak, stop };
}
