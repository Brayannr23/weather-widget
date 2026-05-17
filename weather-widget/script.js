// ═══════════════════════════════════════════════════════════
//  SkyPulse — script.js
//  Option B: Fetch from public APIs (no API key required)
//  APIs used:
//    • Open-Meteo Geocoding  → turn city name → lat/lon
//    • Open-Meteo Weather    → fetch live weather by lat/lon
// ═══════════════════════════════════════════════════════════


// ── STEP 1: Grab DOM elements we need ──────────────────────
// document.querySelector finds a single element by CSS selector
const cityInput    = document.querySelector('#city-input');
const searchBtn    = document.querySelector('#search-btn');
const errorMsg     = document.querySelector('#error-msg');
const loader       = document.querySelector('#loader');
const weatherPanel = document.querySelector('#weather-panel');
const toggleUnit   = document.querySelector('#toggle-unit');

// Individual result fields
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
// let = value that will change;  const = value that won't

let isCelsius = true;        // tracks which unit is active (toggle state)
let lastTempC = null;        // stores raw Celsius value for unit toggling
let lastFeelsC = null;       // stores raw "feels like" Celsius value


// ── STEP 3: WMO weather code → human label + emoji ─────────
// The Open-Meteo API returns a numeric "weathercode" (WMO standard).
// This function maps that number to a friendly description + emoji.

function getWeatherInfo(code) {
  // Each entry: [emoji, description, theme-class for background]
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
  // Return the entry for the given code, or a default if unknown
  return map[code] || ['🌡️', 'Unknown conditions', 'theme-cloudy'];
}


// ── STEP 4: Helper — show/hide UI elements ─────────────────
// Adding or removing the 'hidden' CSS class controls visibility.
// This is DOM manipulation via classList.

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// Show an error message and reveal the paragraph element
function showError(message) {
  errorMsg.textContent = message;   // change innerHTML/textContent
  show(errorMsg);
}

function clearError() {
  errorMsg.textContent = '';
  hide(errorMsg);
}


// ── STEP 5: Convert Celsius ↔ Fahrenheit ──────────────────
// Arrow function syntax:  const name = (params) => expression;

const toFahrenheit = (c) => Math.round((c * 9) / 5 + 32);
const toCelsius    = (f) => Math.round(((f - 32) * 5) / 9);


// ── STEP 6: Display temperature in the correct unit ───────
// This function reads the current isCelsius state and updates
// the temperature elements accordingly.

function displayTemps() {
  if (lastTempC === null) return;   // nothing to show yet

  if (isCelsius) {
    // Show Celsius
    tempEl.textContent     = `${Math.round(lastTempC)}°C`;
    feelsLikeEl.textContent = `${Math.round(lastFeelsC)}°C`;
  } else {
    // Convert and show Fahrenheit
    tempEl.textContent     = `${toFahrenheit(lastTempC)}°F`;
    feelsLikeEl.textContent = `${toFahrenheit(lastFeelsC)}°F`;
  }
}


// ── STEP 7: Main fetch function — get weather data ─────────
// This is an async function that chains two fetch() calls.
// First call → geocoding API (city name → lat/lon)
// Second call → weather API (lat/lon → weather data)

function fetchWeather(cityName) {
  // 1. Reset UI state before loading
  clearError();
  hide(weatherPanel);
  show(loader);

  // 2. Remove any previous body theme classes
  document.body.classList.remove('theme-sunny', 'theme-cloudy', 'theme-rainy', 'theme-snowy');

  // ── FETCH CALL #1: Geocoding ──────────────────────────────
  // We ask Open-Meteo's geocoding API to find coordinates for the city
  const geoURL = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;

  fetch(geoURL)
    .then((response) => {
      // .then() runs when the HTTP response arrives
      // response.json() parses the body as JSON — also returns a Promise
      return response.json();
    })
    .then((geoData) => {
      // If no results, throw so the .catch() block handles it
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error(`City "${cityName}" not found. Try another spelling.`);
      }

      // Pull the first result's coordinates + metadata
      const place = geoData.results[0];
      const { latitude, longitude, name, country } = place;

      // ── FETCH CALL #2: Weather ──────────────────────────────
      // Now we have lat/lon — ask Open-Meteo for current weather
      const weatherURL =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current_weather=true` +
        `&hourly=relativehumidity_2m,apparent_temperature,visibility` +
        `&timezone=auto` +
        `&forecast_days=1`;

      // Return a new fetch Promise so the next .then() gets weather data
      return fetch(weatherURL).then((res) => res.json()).then((weatherData) => {
        // Bundle city info + weather together for the next step
        return { place: { name, country }, weatherData };
      });
    })
    .then(({ place, weatherData }) => {
      // ── Render the data into the DOM ──────────────────────
      hide(loader);

      const cw = weatherData.current_weather;   // shorthand
      const [emoji, description, theme] = getWeatherInfo(cw.weathercode);

      // Save raw Celsius values so the toggle button can convert them
      lastTempC   = cw.temperature;
      lastFeelsC  = weatherData.hourly.apparent_temperature[0];

      // Update city name and country badge (DOM manipulation)
      cityNameEl.textContent  = place.name;
      countryEl.textContent   = place.country;

      // Update the weather icon and condition description
      iconEl.textContent      = emoji;
      conditionEl.textContent = description;

      // Render temperatures using the current unit preference
      displayTemps();

      // Fill in detail cards
      humidityEl.textContent  = `${weatherData.hourly.relativehumidity_2m[0]}%`;
      windEl.textContent      = `${cw.windspeed} km/h`;
      visibilityEl.textContent = `${(weatherData.hourly.visibility[0] / 1000).toFixed(1)} km`;

      // Timestamp
      updatedAtEl.textContent = `Updated at ${new Date().toLocaleTimeString()}`;

      // Apply a background theme class based on weather (CSS class toggle)
      document.body.classList.add(theme);

      // Finally, reveal the results panel
      show(weatherPanel);
    })
    .catch((error) => {
      // .catch() handles any error that happened anywhere in the chain
      hide(loader);
      showError(error.message || 'Something went wrong. Please try again.');
      console.error('SkyPulse fetch error:', error);
    });
}


// ── STEP 8: Event Listener #1 — Search button click ────────
// addEventListener(event, callback) attaches a listener.
// This fires when the user clicks "Search".

searchBtn.addEventListener('click', () => {
  const city = cityInput.value.trim();   // read what the user typed

  if (city === '') {
    // Conditional: only fetch if there's actually a city name
    showError('Please enter a city name first.');
    return;
  }

  fetchWeather(city);   // call our main function
});


// ── STEP 9: Event Listener #2 — Enter key in the input ─────
// This fires when the user presses a key inside the text field.
// It makes the app feel natural (press Enter = same as clicking Search).

cityInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchBtn.click();   // trigger the same action as the button
  }
});


// ── STEP 10: Event Listener #3 — Unit toggle button ────────
// Switches between °C and °F without re-fetching any data.
// This demonstrates: state variable + conditional + DOM update.

toggleUnit.addEventListener('click', () => {
  // Flip the boolean state
  isCelsius = !isCelsius;

  // Update button label and active CSS class
  if (isCelsius) {
    toggleUnit.textContent = '°F';         // show what you CAN switch to
    toggleUnit.classList.remove('active');
  } else {
    toggleUnit.textContent = '°C';
    toggleUnit.classList.add('active');    // classList.add — CSS class manipulation
  }

  // Re-render temperatures in the new unit
  displayTemps();
});


// ── STEP 11: Run a default city on page load ───────────────
// This gives the page a nice first impression instead of an empty state.
// DOMContentLoaded fires once the HTML is fully parsed.

document.addEventListener('DOMContentLoaded', () => {
  fetchWeather('Los Angeles');   // default city on first load
});
