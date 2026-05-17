// ═══════════════════════════════════════════════════════════
//  SkyPulse — script.js  (SECURITY-AUDITED VERSION)
//  GitHub: https://github.com/Brayannr23/skypulse
//
//  Security fixes applied in this file:
//    1. CONFIG object  — no secrets in source (Finding 1)
//    2. sanitizeInput  — input validation before API call (Finding 3)
//    3. textContent    — XSS-safe DOM writes (Finding 2)
//    4. weatherCache   — client-side caching layer (10-minute TTL)
//
//  APIs used (no API key required):
//    • Open-Meteo Geocoding  → city name → lat/lon
//    • Open-Meteo Weather    → lat/lon   → live conditions
// ═══════════════════════════════════════════════════════════


// ── SECURITY FIX — Finding 1: No secrets in source code ────
//
// UNSAFE (what NOT to do if an API key were ever needed):
//   const API_KEY = 'abc123secret';   // ← anyone reading source can steal this
//
// SAFE: For a pure client-side app, use only public APIs that need no key.
// If a key is ever required, route requests through a backend proxy so the key
// lives in an environment variable on the server, never in browser-visible code.
//
// All API base URLs are declared here in one auditable place so they are easy
// to review and easy to swap — this is the JS equivalent of os.environ.get()
// in Django settings.py.

const CONFIG = {
  GEO_API:     'https://geocoding-api.open-meteo.com/v1/search',
  WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
  // NEVER add real API keys here — use a backend proxy instead.
  // Example backend pattern (Node/Express):
  //   app.get('/weather', (req, res) => {
  //     const key = process.env.WEATHER_API_KEY;   // safe — server-side only
  //     fetch(`https://api.example.com?key=${key}&q=${req.query.city}`)
  //       .then(r => r.json()).then(data => res.json(data));
  //   });
};


// ── CACHING LAYER ───────────────────────────────────────────
//
// Equivalent to Django's @cache_page decorator or the low-level cache API.
//
// WHY this view/query is a good cache candidate:
//   Weather data for a given city changes at most every 15 minutes on the
//   Open-Meteo API. Re-fetching on every keystroke / re-search is wasteful
//   and would hit rate limits if the app scaled.
//
// CACHE TIMEOUT: 10 minutes (600 000 ms)
//   Chosen because Open-Meteo updates current_weather hourly but
//   apparent_temperature and humidity update every 15 min. 10 minutes gives
//   a good balance: data is never more than 10 min stale, but we avoid
//   redundant network calls for users who toggle °C/°F or re-search the
//   same city quickly.
//
// STALE DATA RISK:
//   A fast-moving storm could change conditions within the cache window.
//   The "Updated at HH:MM:SS" timestamp shown in the UI lets users see
//   exactly when the data was fetched, which manages this expectation.
//
// Implementation: simple in-memory Map keyed by lowercase city name.
// In a production app this would be replaced by a shared Redis cache on the
// server so all users benefit, not just repeat searches in one browser tab.

const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 minutes — see rationale above
const weatherCache = new Map();          // key: 'city name' → { data, timestamp }

function getCached(city) {
  const entry = weatherCache.get(city.toLowerCase());
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    weatherCache.delete(city.toLowerCase());   // expired — evict
    return null;
  }
  return entry.data;   // cache hit
}

function setCache(city, data) {
  weatherCache.set(city.toLowerCase(), { data, timestamp: Date.now() });
}


// ── STEP 1: Grab DOM elements ──────────────────────────────
const cityInput    = document.querySelector('#city-input');
const searchBtn    = document.querySelector('#search-btn');
const errorMsg     = document.querySelector('#error-msg');
const loader       = document.querySelector('#loader');
const weatherPanel = document.querySelector('#weather-panel');
const toggleUnit   = document.querySelector('#toggle-unit');

const cityNameEl   = document.querySelector('#city-name');
const countryEl    = document.querySelector('#country-badge');
const iconEl       = document.querySelector('#weather-icon');
const tempEl       = document.querySelector('#temperature');
const conditionEl  = document.querySelector('#condition-text');
const humidityEl   = document.querySelector('#humidity');
const windEl       = document.querySelector('#wind');
const feelsLikeEl  = document.querySelector('#feels-like');
const visibilityEl = document.querySelector('#visibility');
const updatedAtEl  = document.querySelector('#updated-at');


// ── STEP 2: State variables ────────────────────────────────
let isCelsius = true;
let lastTempC = null;
let lastFeelsC = null;


// ── SECURITY FIX — Finding 3: Input sanitisation ───────────
//
// PROBLEM: The original code passed the raw input value straight to
//   encodeURIComponent() with only a whitespace check. There was no
//   maximum length or character allow-list. In a server-side context
//   this pattern is the root of injection vulnerabilities.
//
// In Django the ORM prevents SQL injection because it uses parameterised
// queries — the user input is NEVER concatenated into raw SQL:
//   UNSAFE:  cursor.execute("SELECT * FROM cities WHERE name='" + name + "'")
//   SAFE:    City.objects.filter(name=name)   ← Django always parameterises
//
// For this JS app the equivalent risk is URL/API injection. We mitigate it
// by validating and normalising the input before it touches the network.
//
// Rules enforced:
//   • Strip leading/trailing whitespace
//   • Reject empty strings
//   • Enforce a 100-character maximum length
//   • Allow only characters that can appear in a real city name:
//     letters (any script), spaces, hyphens, apostrophes, and periods
//
// encodeURIComponent() then percent-encodes any remaining special chars
// before they reach the API URL.

function sanitizeInput(raw) {
  const trimmed = raw.trim();

  if (trimmed === '') {
    throw new Error('Please enter a city name first.');
  }

  if (trimmed.length > 100) {
    throw new Error('City name is too long (max 100 characters).');
  }

  // Allow letters, digits, spaces, hyphens, apostrophes, periods.
  // This blocks angle brackets, quotes, and script characters that
  // could be used for injection if the value were ever reflected into HTML.
  const allowedPattern = /^[\p{L}\p{N}\s\-'.]+$/u;
  if (!allowedPattern.test(trimmed)) {
    throw new Error('City name contains invalid characters.');
  }

  return trimmed;
}


// ── STEP 3: WMO weather code → label + emoji ───────────────
function getWeatherInfo(code) {
  const map = {
    0:  ['☀️',  'Clear sky',                  'theme-sunny'],
    1:  ['🌤️', 'Mainly clear',               'theme-sunny'],
    2:  ['⛅',  'Partly cloudy',              'theme-cloudy'],
    3:  ['☁️',  'Overcast',                   'theme-cloudy'],
    45: ['🌫️', 'Foggy',                       'theme-cloudy'],
    48: ['🌫️', 'Icy fog',                     'theme-cloudy'],
    51: ['🌦️', 'Light drizzle',              'theme-rainy'],
    53: ['🌧️', 'Moderate drizzle',           'theme-rainy'],
    55: ['🌧️', 'Dense drizzle',              'theme-rainy'],
    61: ['🌧️', 'Slight rain',                'theme-rainy'],
    63: ['🌧️', 'Moderate rain',              'theme-rainy'],
    65: ['🌧️', 'Heavy rain',                 'theme-rainy'],
    71: ['🌨️', 'Slight snowfall',            'theme-snowy'],
    73: ['❄️',  'Moderate snowfall',          'theme-snowy'],
    75: ['❄️',  'Heavy snowfall',             'theme-snowy'],
    77: ['🌨️', 'Snow grains',                'theme-snowy'],
    80: ['🌦️', 'Slight rain showers',        'theme-rainy'],
    81: ['🌧️', 'Moderate rain showers',      'theme-rainy'],
    82: ['⛈️', 'Violent rain showers',       'theme-rainy'],
    85: ['🌨️', 'Snow showers',               'theme-snowy'],
    86: ['🌨️', 'Heavy snow showers',         'theme-snowy'],
    95: ['⛈️', 'Thunderstorm',               'theme-rainy'],
    96: ['⛈️', 'Thunderstorm with hail',     'theme-rainy'],
    99: ['⛈️', 'Thunderstorm, heavy hail',   'theme-rainy'],
  };
  return map[code] || ['🌡️', 'Unknown conditions', 'theme-cloudy'];
}


// ── STEP 4: Show/hide helpers ──────────────────────────────
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function showError(message) {
  // SAFE — textContent never interprets HTML, so even if message contained
  // a <script> tag it would be rendered as harmless visible text.
  errorMsg.textContent = message;
  show(errorMsg);
}

function clearError() {
  errorMsg.textContent = '';
  hide(errorMsg);
}


// ── STEP 5: Temperature conversion helpers ─────────────────
const toFahrenheit = (c) => Math.round((c * 9) / 5 + 32);


// ── STEP 6: Render temperatures in the active unit ─────────
function displayTemps() {
  if (lastTempC === null) return;
  if (isCelsius) {
    // SAFE — textContent, not innerHTML (Finding 2)
    tempEl.textContent      = `${Math.round(lastTempC)}°C`;
    feelsLikeEl.textContent = `${Math.round(lastFeelsC)}°C`;
  } else {
    tempEl.textContent      = `${toFahrenheit(lastTempC)}°F`;
    feelsLikeEl.textContent = `${toFahrenheit(lastFeelsC)}°F`;
  }
}


// ── STEP 7: Render cached or fresh data into the DOM ───────
//
// SECURITY FIX — Finding 2: XSS-safe DOM writes
//
// Every single value from the API is written with .textContent.
// .textContent treats the value as PLAIN TEXT — the browser never parses it
// as HTML. This means even if the API returned:
//   { name: '<img src=x onerror="stealCookies()">' }
// ...the browser would display the literal string, not execute the code.
//
// This is the exact equivalent of Django's auto-escaping:
//   SAFE:   {{ user.bio }}          ← Django HTML-encodes special chars
//   UNSAFE: {{ user.bio|safe }}     ← Django skips encoding — never use on untrusted data
//
// UNSAFE (what NOT to do):
//   cityNameEl.innerHTML = place.name;   // ← XSS risk if API returns malicious string
//
// SAFE (what we do):
//   cityNameEl.textContent = place.name; // ← always treated as plain text

function renderWeather(place, weatherData) {
  hide(loader);

  const cw = weatherData.current_weather;
  const [emoji, description, theme] = getWeatherInfo(cw.weathercode);

  lastTempC  = cw.temperature;
  lastFeelsC = weatherData.hourly.apparent_temperature[0];

  // All DOM writes use .textContent — never .innerHTML (Finding 2)
  cityNameEl.textContent  = place.name;     // SAFE — textContent, not innerHTML
  countryEl.textContent   = place.country;  // SAFE
  iconEl.textContent      = emoji;          // SAFE — emoji is a fixed constant, not user input
  conditionEl.textContent = description;    // SAFE

  displayTemps();

  humidityEl.textContent   = `${weatherData.hourly.relativehumidity_2m[0]}%`;  // SAFE
  windEl.textContent       = `${cw.windspeed} km/h`;                            // SAFE
  visibilityEl.textContent = `${(weatherData.hourly.visibility[0] / 1000).toFixed(1)} km`; // SAFE
  updatedAtEl.textContent  = `Updated at ${new Date().toLocaleTimeString()}`;   // SAFE — no user data

  document.body.classList.add(theme);
  show(weatherPanel);
}


// ── STEP 8: Main fetch function ────────────────────────────
function fetchWeather(cityName) {
  // Sanitise before anything else (Finding 3)
  let safeCity;
  try {
    safeCity = sanitizeInput(cityName);
  } catch (err) {
    showError(err.message);
    return;
  }

  clearError();
  hide(weatherPanel);
  document.body.classList.remove('theme-sunny', 'theme-cloudy', 'theme-rainy', 'theme-snowy');

  // ── CACHE CHECK ─────────────────────────────────────────
  // Before hitting the network, check if we have a fresh result.
  // This is equivalent to Django's low-level cache API:
  //   cache.get(key) → hit → return; miss → fetch + cache.set(key, value, timeout)
  const cached = getCached(safeCity);
  if (cached) {
    // Cache hit — render immediately, no network call needed
    console.info(`[SkyPulse cache] HIT for "${safeCity}" — skipping fetch`);
    renderWeather(cached.place, cached.weatherData);
    return;
  }

  // Cache miss — fetch from the APIs
  console.info(`[SkyPulse cache] MISS for "${safeCity}" — fetching from API`);
  show(loader);

  // ── FETCH #1: Geocoding ────────────────────────────────
  // encodeURIComponent() percent-encodes any remaining special characters
  // so they cannot break out of the URL query string. Combined with
  // sanitizeInput() above, this gives two layers of protection.
  const geoURL = `${CONFIG.GEO_API}?name=${encodeURIComponent(safeCity)}&count=1&language=en&format=json`;

  fetch(geoURL)
    .then((response) => response.json())
    .then((geoData) => {
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`City "${safeCity}" not found. Try another spelling.`);
      }

      const place = geoData.results[0];
      const { latitude, longitude, name, country } = place;

      // ── FETCH #2: Weather ──────────────────────────────
      const weatherURL =
        `${CONFIG.WEATHER_API}` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current_weather=true` +
        `&hourly=relativehumidity_2m,apparent_temperature,visibility` +
        `&timezone=auto` +
        `&forecast_days=1`;

      return fetch(weatherURL)
        .then((res) => res.json())
        .then((weatherData) => ({ place: { name, country }, weatherData }));
    })
    .then(({ place, weatherData }) => {
      // Store in cache before rendering
      // Timeout: CACHE_TTL_MS = 10 minutes (see top of file for rationale)
      setCache(safeCity, { place, weatherData });
      renderWeather(place, weatherData);
    })
    .catch((error) => {
      hide(loader);
      showError(error.message || 'Something went wrong. Please try again.');
      console.error('SkyPulse fetch error:', error);
    });
}


// ── STEP 9: Event listeners ────────────────────────────────
searchBtn.addEventListener('click', () => {
  fetchWeather(cityInput.value);
});

cityInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchBtn.click();
  }
});

toggleUnit.addEventListener('click', () => {
  isCelsius = !isCelsius;
  if (isCelsius) {
    toggleUnit.textContent = '°F';
    toggleUnit.classList.remove('active');
  } else {
    toggleUnit.textContent = '°C';
    toggleUnit.classList.add('active');
  }
  displayTemps();
});

document.addEventListener('DOMContentLoaded', () => {
  fetchWeather('Los Angeles');
});
