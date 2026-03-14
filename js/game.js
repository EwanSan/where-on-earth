/**
 * game.js  –  entry point
 * Initialises the map, loads data, and drives the game loop.
 * Supports multiple game modes via the MODES object.
 */

import { FR, ALIASES, EXCLUDED_ISO2 }      from './data.js';
import { CAPITALS, CAPITAL_ALIASES }      from './capitals.js';
import { norm, randomPointIn, zoomForFeature } from './geo.js';

/* global L, turf */

const GEOJSON_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

// ── Map ──────────────────────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: true }).setView([20, 10], 2);

L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  }
).addTo(map);

// ── Shared state ─────────────────────────────────────────────────────────────

let countries      = [];   // GeoJSON features (polygons)
let allGeoJSON     = null; // FeatureCollection for border overlays
let capitalsList   = [];   // [{ iso, en, fr, lat, lng, feature }, …]

let currentMode    = 'country';
let challenge      = null; // current round data (set by mode.pickChallenge)
let marker         = null;
let overlayLayers  = [];
let streak         = 0;
let best           = 0;
let phase          = 'guess';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const btnOk    = document.getElementById('btn-ok');
const btnSkip  = document.getElementById('btn-skip');
const inp      = document.getElementById('answer');
const modeBtns = document.querySelectorAll('.mode-btn');

// ── Mode definitions ─────────────────────────────────────────────────────────

const MODES = {

  // ── Guess the Country ────────────────────────────────────────────────────
  country: {
    placeholder: 'Nom du pays / Country name…',

    pickChallenge() {
      const feat = countries[Math.floor(Math.random() * countries.length)];
      const [lat, lng] = randomPointIn(feat);
      return { feat, lat, lng, zoom: zoomForFeature(feat) };
    },

    checkAnswer(input) {
      const n   = norm(input);
      if (!n) return false;
      const iso = challenge.feat.properties.ISO_A3;
      const eng = norm(challenge.feat.properties.ADMIN || '');
      const fr  = norm(FR[iso] || '');
      if (n === eng) return true;
      if (fr && n === fr) return true;
      if (ALIASES[n] === iso) return true;
      return false;
    },

    getLabel() {
      const iso = challenge.feat.properties.ISO_A3;
      const eng = challenge.feat.properties.ADMIN || iso;
      const fr  = FR[iso];
      return (fr && fr !== eng) ? `${fr}  /  ${eng}` : eng;
    },

    onReveal(correct, guessedInput) {
      addAllBorders();

      if (!correct && guessedInput) {
        const gf = findCountryByInput(guessedInput);
        if (gf) {
          addOverlay(L.geoJSON(gf, {
            style: { color: '#ef4444', weight: 2.5, fillColor: '#ef4444', fillOpacity: 0.18 },
            interactive: false,
          }));
        }
      }

      addOverlay(L.geoJSON(challenge.feat, {
        style: {
          color: correct ? '#4ade80' : '#fbbf24', weight: 3,
          fillColor: correct ? '#4ade80' : '#fbbf24', fillOpacity: 0.18,
        },
        interactive: false,
      }));
    },
  },

  // ── Guess the Capital ────────────────────────────────────────────────────
  capital: {
    placeholder: 'Nom de la capitale / Capital name…',

    pickChallenge() {
      if (capitalsList.length === 0) return null;
      const entry = capitalsList[Math.floor(Math.random() * capitalsList.length)];
      return { ...entry, zoom: 7 };
    },

    checkAnswer(input) {
      const n = norm(input);
      if (!n || !challenge) return false;
      if (n === norm(challenge.en)) return true;
      if (n === norm(challenge.fr)) return true;
      if (CAPITAL_ALIASES[n] === challenge.iso) return true;
      return false;
    },

    getLabel() {
      if (!challenge) return '?';
      const en = challenge.en;
      const fr = challenge.fr;
      return (fr && fr !== en) ? `${fr}  /  ${en}` : en;
    },

    onReveal(correct) {
      addAllBorders();

      if (challenge && challenge.feature) {
        addOverlay(L.geoJSON(challenge.feature, {
          style: {
            color: correct ? '#4ade80' : '#fbbf24', weight: 3,
            fillColor: correct ? '#4ade80' : '#fbbf24', fillOpacity: 0.18,
          },
          interactive: false,
        }));
      }
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function findCountryByInput(input) {
  const n = norm(input);
  if (!n) return null;
  const aliasIso = ALIASES[n];
  for (const feat of countries) {
    const iso = feat.properties.ISO_A3;
    const eng = norm(feat.properties.ADMIN || '');
    const fr  = norm(FR[iso] || '');
    if (n === eng || (fr && n === fr) || (aliasIso && aliasIso === iso)) return feat;
  }
  return null;
}

function addOverlay(layer) { overlayLayers.push(layer.addTo(map)); }

function addAllBorders() {
  addOverlay(L.geoJSON(allGeoJSON, {
    style: { color: 'rgba(255,255,255,0.45)', weight: 1, fillOpacity: 0, dashArray: '4 3' },
    interactive: false,
  }));
}

function clearOverlays() {
  for (const l of overlayLayers) map.removeLayer(l);
  overlayLayers = [];
}

// ── UI ────────────────────────────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('val-streak').textContent = streak;
  document.getElementById('val-best').textContent   = best;
}

function showFeedback(type, msg) {
  const el = document.getElementById('feedback');
  el.className   = `glass ${type} show`;
  el.textContent = msg;
}

function hideFeedback() {
  const el = document.getElementById('feedback');
  el.className   = 'glass';
  el.textContent = '';
}

function setButtons(reviewMode) {
  if (reviewMode) {
    btnOk.textContent = 'Next';
    btnSkip.style.display = 'none';
  } else {
    btnOk.textContent = 'OK';
    btnSkip.style.display = '';
  }
}

function activateModeUI(mode) {
  modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  inp.placeholder = MODES[mode].placeholder;
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function fullReset() {
  streak  = 0;
  best    = 0;
  phase   = 'guess';
  challenge = null;

  updateHUD();
  hideFeedback();
  clearOverlays();
  setButtons(false);

  if (marker) { map.removeLayer(marker); marker = null; }

  activateModeUI(currentMode);
}

function nextRound() {
  phase = 'guess';
  setButtons(false);
  hideFeedback();
  clearOverlays();

  challenge = MODES[currentMode].pickChallenge();

  if (!challenge || challenge.lat == null || challenge.lng == null) {
    showFeedback('fail', 'No data available for this mode.');
    return;
  }

  inp.value    = '';
  inp.disabled = false;
  inp.focus();

  if (marker) map.removeLayer(marker);
  marker = L.marker([challenge.lat, challenge.lng], {
    icon: L.divIcon({
      className: '',
      html:       '<div class="dot"></div>',
      iconSize:   [18, 18],
      iconAnchor: [9, 9],
    }),
  }).addTo(map);

  map.flyTo([challenge.lat, challenge.lng], challenge.zoom, { animate: true, duration: 1.1 });
}

function revealAnswer(correct, guessedInput) {
  phase = 'review';
  inp.disabled = true;
  setButtons(true);
  MODES[currentMode].onReveal(correct, guessedInput);
}

function submit() {
  if (phase === 'review') { nextRound(); return; }
  if (!challenge) return;

  const input = inp.value.trim();
  if (!input) return;

  const mode    = MODES[currentMode];
  const label   = mode.getLabel();
  const correct = mode.checkAnswer(input);

  if (correct) {
    streak++;
    if (streak > best) best = streak;
    updateHUD();
    showFeedback('ok', `Correct !  ${label}`);
  } else {
    streak = 0;
    updateHUD();
    showFeedback('fail', `Raté — c'était : ${label}`);
  }

  revealAnswer(correct, input);
}

function skip() {
  if (phase === 'review') { nextRound(); return; }
  if (!challenge) return;

  streak = 0;
  updateHUD();
  showFeedback('skip', `Passé — c'était : ${MODES[currentMode].getLabel()}`);
  revealAnswer(false, null);
}

function switchMode(mode) {
  if (mode === currentMode && phase === 'guess') return;
  currentMode = mode;
  fullReset();
  nextRound();
}

// ── Events ────────────────────────────────────────────────────────────────────

btnOk  .addEventListener('click', submit);
btnSkip.addEventListener('click', skip);

document.addEventListener('keydown', e => {
  // Ignore Enter/Escape if a mode button is focused (prevent double-fire)
  if (document.activeElement && document.activeElement.classList.contains('mode-btn')) return;
  if (e.key === 'Enter')  { e.preventDefault(); submit(); }
  if (e.key === 'Escape') { e.preventDefault(); skip(); }
});

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();          // release focus so Enter goes to the game, not the button
    switchMode(btn.dataset.mode);
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const res = await fetch(GEOJSON_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data.features) || data.features.length === 0)
      throw new Error('GeoJSON contains no features');

    console.log('[boot] sample properties:', data.features[0].properties);

    // The geo-countries dataset uses these exact property names:
    //   "name"                  → English country name
    //   "ISO3166-1-Alpha-3"    → 3-letter ISO code  (e.g. "FRA")
    //   "ISO3166-1-Alpha-2"    → 2-letter ISO code  (e.g. "FR")
    countries = data.features
      .filter(f => {
        if (!f.geometry) return false;
        if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') return false;
        const p    = f.properties ?? {};
        const iso2 = p['ISO3166-1-Alpha-2'] || '';
        if (EXCLUDED_ISO2.has(iso2)) return false;
        return true;
      })
      .map(f => {
        const p    = f.properties ?? {};
        const iso  = p['ISO3166-1-Alpha-3'] || p['ISO_A3'] || '';
        const eng  = p['name'] || p['ADMIN'] || p['NAME'] || '';
        return { ...f, properties: { ...p, ISO_A3: iso, ADMIN: eng || iso } };
      })
      .filter(f => f.properties.ADMIN);

    allGeoJSON = { type: 'FeatureCollection', features: countries };

    // ── Build lookups to match capitals → country features ───────────────
    // Strategy: try ISO first, then fall back to name matching via FR + ALIASES.

    const countryByIso      = {};
    const countryByNormName = {};

    for (const f of countries) {
      const iso   = f.properties.ISO_A3;
      const admin = norm(f.properties.ADMIN || '');
      if (iso)   countryByIso[iso]        = f;
      if (admin) countryByNormName[admin]  = f;
    }

    capitalsList = Object.entries(CAPITALS)
      .map(([iso, cap]) => {
        // Try 1: direct ISO match
        let feature = countryByIso[iso];

        // Try 2: French country name (from FR table) matched against ADMIN
        if (!feature) {
          const frName = norm(FR[iso] || '');
          if (frName) feature = countryByNormName[frName];
        }

        // Try 3: scan ALIASES for entries pointing to this ISO
        if (!feature) {
          for (const [alias, aliasIso] of Object.entries(ALIASES)) {
            if (aliasIso === iso && countryByNormName[alias]) {
              feature = countryByNormName[alias];
              break;
            }
          }
        }

        if (!feature) return null;

        // Stamp the ISO on the feature so country mode can use FR/ALIASES too
        if (!feature.properties.ISO_A3) feature.properties.ISO_A3 = iso;

        return { iso, en: cap.en, fr: cap.fr, lat: cap.lat, lng: cap.lng, feature };
      })
      .filter(Boolean);

    console.log(`[boot] ${countries.length} countries, ${capitalsList.length} capitals matched`);
    if (countries.length === 0) throw new Error('No usable features after filtering');

    document.getElementById('loading').style.display = 'none';
    activateModeUI(currentMode);
    nextRound();
  } catch (err) {
    console.error('[boot] init failed:', err);
    document.getElementById('loading').innerHTML =
      `<div style="color:#f87171;text-align:center;padding:20px">
         Failed to load world data.<br>
         <small style="opacity:.6">${err.message}</small><br><br>
         <small style="opacity:.4">Check the browser console (F12) for details.</small><br><br>
         <button onclick="location.reload()"
           style="padding:10px 20px;border:none;border-radius:8px;
                  background:#4ade80;color:#111;cursor:pointer;font-size:15px">
           Retry
         </button>
       </div>`;
  }
})();
