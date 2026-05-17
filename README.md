# ☁ SkyPulse — Weather Widget

**GitHub:** https://github.com/Brayannr23/skypulse

A live weather app built with vanilla HTML, CSS, and JavaScript.  
Option B — Fetch from a public API.

---

## What it does

SkyPulse lets you type any city name in the world and instantly see the current weather — temperature, humidity, wind speed, feels-like temperature, and visibility — all without reloading the page. The background changes color theme based on whether the weather is sunny, cloudy, rainy, or snowy. You can also switch between Celsius and Fahrenheit at any time using the toggle button.

---

## How it works (user interactions)

1. **Search by city** — Type a city name and click "Search" or press Enter. The app makes two chained `fetch()` calls: first to the Open-Meteo Geocoding API to convert the city name into GPS coordinates, then to the Open-Meteo Weather API to retrieve live conditions.
2. **Toggle °C / °F** — Click the unit button to switch units. No new network request is made — the stored raw Celsius value is converted in JavaScript.
3. **Error handling** — If the city is not found or the network fails, a clear error message appears. The `.catch()` block handles all failures gracefully.

---

## Option chosen

**Option B — Fetch from a public API**

| API | Purpose |
|-----|---------|
| Open-Meteo Geocoding (`https://geocoding-api.open-meteo.com`) | Converts city name to latitude/longitude |
| Open-Meteo Weather (`https://api.open-meteo.com`) | Returns current weather by coordinates |

No API key is required for either service.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure — search input, result panel, Content Security Policy meta tag |
| `styles.css` | All styling — glassmorphism card, animated background blobs, CSS variables, responsive layout |
| `script.js` | All logic — security fixes, caching layer, fetch calls, DOM manipulation, unit conversion |
| `SECURITY.md` | Full security audit — every finding with risk, fix, and file location |
| `.env.example` | Documents required environment variables (for future backend proxy) |

---

## Security improvements (v2)

This version addresses five security findings identified during a full audit. See `SECURITY.md` for the complete write-up.

| Finding | Risk | Fix |
|---------|------|-----|
| Hard-coded config | API keys could be committed to source | `CONFIG` object + backend-proxy pattern documented |
| XSS via DOM writes | Malicious API response could execute JS | All DOM writes use `.textContent`, never `.innerHTML` |
| Missing input validation | Raw input passed to API | `sanitizeInput()` enforces length + character allow-list |
| No Subresource Integrity | CDN compromise could inject styles | `crossorigin="anonymous"` on all external links |
| No Content Security Policy | XSS would have unrestricted network access | CSP `<meta>` tag restricts scripts, styles, and `fetch()` origins |

---

## Caching

A client-side in-memory cache with a **10-minute TTL** is implemented in `script.js`.

**Why this is a good cache candidate:** Weather data from Open-Meteo updates at most every 15 minutes. Re-fetching the same city on every search is unnecessary network traffic and would hit rate limits at scale.

**Cache timeout chosen:** 10 minutes (`CACHE_TTL_MS = 10 * 60 * 1000`). This ensures data is never more than 10 minutes stale — acceptable for a weather display — while eliminating redundant calls for users who toggle units or re-search the same city.

**Stale data risk:** A fast-moving storm could change conditions within the 10-minute window. The "Updated at HH:MM:SS" timestamp visible in the UI tells users exactly when the data was fetched, managing this expectation clearly.

This is equivalent to Django's `@cache_page(60 * 10)` decorator or the `cache.get()` / `cache.set()` low-level cache API.

---

## JavaScript features used

- `function` keyword + arrow functions `() => {}`
- `let` (state variables) + `const` (DOM refs and helpers)
- `document.querySelector()` for all element selection
- `textContent` changes in response to events (never `innerHTML` on untrusted data)
- `classList.add()` / `classList.remove()` / `classList.toggle()` for dynamic CSS
- `fetch()` + `.then()` + `.catch()` Promise chain
- `if / else` conditionals for unit toggling and validation
- `addEventListener()` for click and keydown events
- `Map` for the in-memory cache

---

## Scalability Design

### How SkyPulse would scale to 10x more users

**Current architecture:** A single static file server (e.g. GitHub Pages, Netlify, or a single Nginx instance) serving three files — `index.html`, `styles.css`, and `script.js`. All computation happens in the user's browser; the only backend calls go directly to Open-Meteo's public API.

**First scaling move — vertical, then horizontal:**
The first response to a 10x traffic spike would be *vertical scaling* — increasing the CPU and RAM of the static file server. This is fast to implement (no architecture change) and effective up to a point, typically until the server's network bandwidth or connection-handling capacity becomes the bottleneck. Once vertical scaling hits its ceiling, *horizontal scaling* becomes necessary: spinning up multiple identical server instances behind a load balancer. For a pure static-file workload, horizontal scaling is extremely straightforward because there is no application state on the server — every instance can serve every request equally.

**Load balancer configuration and session strategy:**
A load balancer (e.g. AWS ALB, Nginx upstream, or Cloudflare Load Balancing) would distribute incoming requests across instances using a round-robin or least-connections algorithm. Because SkyPulse is a stateless, sessionless front-end app, there is no session-affinity (sticky-session) requirement today. However, if a backend proxy were added to protect API keys, sessions would need to be stored in a shared external store — either a database-backed session table or a Redis cluster — so that a user whose request lands on Server A on one click and Server B on the next click still sees a consistent authenticated state. For this app, the recommended approach would be Redis-backed sessions: fast reads/writes, easy expiry, and horizontally sharable across all instances.

**Database replication and partitioning:**
SkyPulse currently has no database. If a backend were added — for example, to log searches, store user preferences, or cache API responses server-side — the database would initially run as a single primary. At 10x users, read traffic (fetching cached weather data) would far outstrip write traffic (storing new results). The appropriate scaling strategy would be *read replicas*: one primary handles all writes; two or more replicas handle all reads, with the application directing `SELECT` queries to replicas and `INSERT`/`UPDATE` queries to the primary. Horizontal partitioning (sharding) would only become necessary at much higher scale — for example, if search-history data grew large enough that a single server's disk or index could no longer handle it efficiently. For a weather app at 10x current load, a primary plus two read replicas would be more than sufficient.

**CDN layer:**
The static assets (`index.html`, `styles.css`, `script.js`) are ideal candidates for a Content Delivery Network. A CDN caches copies of the files at edge nodes worldwide, so a user in Tokyo is served from a nearby node rather than a distant origin server. This reduces latency for end users and removes load from the origin server almost entirely for static files. Services like Cloudflare, AWS CloudFront, or Netlify's edge network provide this out of the box.
