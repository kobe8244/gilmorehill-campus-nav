import { useCallback, useEffect } from "react";

// Text-to-speech hook backed by the browser Web Speech API
// (window.speechSynthesis). Placeholder ready for richer voice guidance.
export function useTTS() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Warm up the voice list on mount. Some browsers (notably Chrome) load
  // voices asynchronously and silently drop the first speak() call if no
  // voices are ready yet, which is why speech "doesn't always trigger".
  useEffect(() => {
    if (!supported) return;
    window.speechSynthesis.getVoices();
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      // Stop anything in progress so guidance stays current.
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-GB";
      utterance.rate = 0.9;
      // Chrome drops an utterance if speak() runs in the same tick as
      // cancel(), so defer to the next tick for reliable playback.
      window.setTimeout(() => synth.speak(utterance), 80);
    },
    [supported]
  );

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
  }, [supported]);

  return { speak, stop, supported };
}
