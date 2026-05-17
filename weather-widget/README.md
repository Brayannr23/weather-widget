# ☁ SkyPulse — Weather Widget

A live weather app built with vanilla HTML, CSS, and JavaScript as part of a web development assignment (Option B — Fetch from a public API).

## What it does

SkyPulse lets you type any city name in the world and instantly see the current weather — temperature, humidity, wind speed, feels-like temperature, and visibility — all without reloading the page. The background changes color theme based on whether the weather is sunny, cloudy, rainy, or snowy. You can also switch between Celsius and Fahrenheit at any time using the toggle button.

## How it works (user interactions)

1. **Search by city** — Type a city name into the input box and click "Search" or press Enter. The app makes two chained `fetch()` calls: first to the Open-Meteo Geocoding API to turn the city name into GPS coordinates, then to the Open-Meteo Weather API to get live conditions.
2. **Toggle °C / °F** — Click the unit button to switch between Celsius and Fahrenheit. No new fetch is made — the app converts the stored raw value in JavaScript using a formula.
3. **Error handling** — If you type a city that doesn't exist or the network fails, a clear error message appears. The `.catch()` block in the Promise chain handles all failures gracefully.

## Option chosen

**Option B — Fetch from a public API**

- **Open-Meteo Geocoding API** (`https://geocoding-api.open-meteo.com`) — converts city name to latitude/longitude
- **Open-Meteo Weather API** (`https://api.open-meteo.com`) — returns current weather by coordinates
- No API key required for either service

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure — two interactive elements (search input + toggle button), result panel |
| `styles.css` | All styling — glassmorphism card, animated background blobs, CSS variables, responsive layout |
| `script.js` | All logic — event listeners, fetch calls, DOM manipulation, unit conversion, state tracking |

## JavaScript features used

- `function` keyword + arrow functions `() => {}`
- `let` (state variables) + `const` (DOM refs and helpers)
- `document.querySelector()` to select every interactive element
- `innerHTML` / `textContent` changes in response to events
- `classList.add()` / `classList.remove()` / `classList.toggle()` for dynamic CSS
- `fetch()` + `.then()` + `.catch()` Promise chain
- `if / else` conditionals for unit toggling and validation
- `addEventListener()` for click and keydown events
