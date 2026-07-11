// ============================================================================
//  CATCH ME FIRST — weather.js
//  Real-world weather synced into the game (open-meteo, no API key needed).
//  Uses geolocation if allowed, else defaults to Baku. Refreshes every 30 min.
// ============================================================================

import { State } from "./state.js";

const FALLBACK = { lat: 40.41, lon: 49.87 };   // Baku

function mapCode(code) {
  if (code >= 95) return "storm";
  if (code >= 71 && code <= 77) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86)) return "rain";
  return "clear";
}

async function coords() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(FALLBACK);
    const t = setTimeout(() => res(FALLBACK), 4500);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); res({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      () => { clearTimeout(t); res(FALLBACK); },
      { timeout: 4000 }
    );
  });
}

export const Weather = {
  async init() {
    if (!State.settings.realWeather) return;
    const tick = async () => {
      try {
        const { lat, lon } = await coords();
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (!r.ok) return;
        const d = await r.json();
        const cw = d.current_weather;
        if (!cw) return;
        const w = mapCode(cw.weathercode);
        State.world.realWeather = { temp: cw.temperature, code: cw.weathercode, w };
        if (State.settings.weather !== w) State.set("weather", w);   // applySetting pushes to the 3D world
      } catch {}
    };
    tick();
    setInterval(tick, 30 * 60e3);
  },
};
