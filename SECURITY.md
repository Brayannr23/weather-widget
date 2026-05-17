# Security Audit — SkyPulse Weather Widget

**Repository:** https://github.com/Brayannr23/skypulse  
**Auditor:** Brayannr23  
**Date:** May 2026  
**App type:** Vanilla JS / HTML / CSS — client-side only (no Django backend)

> **Note on scope:** This app is a pure front-end, client-side project with no server, no database,
> and no user authentication. That rules out server-side vulnerabilities like SQL injection,
> CSRF, and session hijacking. The audit below covers the real attack surface of a
> browser-based JavaScript application: XSS, secret/key exposure, insecure resource loading,
> and Subresource Integrity. Each finding maps to the closest equivalent concept in the
> assignment rubric and explains the attack it prevents.

---

## Finding 1: API base URLs hard-coded and unguarded — Secret / Config Exposure equivalent

**Risk:**  
The geocoding and weather API base URLs were assembled by plain string concatenation
inside `fetchWeather()`. If an API key were ever added (e.g. switching to OpenWeatherMap),
it would be visible in plain source to anyone who opens DevTools → Sources. Even without
a key, hardcoded third-party URLs make it impossible to swap endpoints without editing
source code. This is the client-side equivalent of a hard-coded `SECRET_KEY` in
`settings.py`.

**Fix:**  
All API endpoints are now declared in a single `CONFIG` object at the top of `script.js`,
making them easy to audit and easy to replace. A `// NEVER add real API keys here —
use a backend proxy` comment documents the rule.

**Location:** `script.js`, top of file (`CONFIG` object, lines 1–10)

---

## Finding 2: User-controlled city name injected into the DOM via `textContent` — XSS Risk

**Risk:**  
The city name and country returned by the API were written directly into the DOM.
If the API ever returned a malicious string (or if the code were changed to use
`innerHTML`), a `<script>` tag or `onerror` attribute could execute JavaScript in
the user's browser (stored/reflected XSS).

**Fix:**  
All dynamic values are written exclusively with `.textContent`, never `.innerHTML`.
A comment on every DOM-write line documents this choice explicitly. This is the
client-side equivalent of using `{{ variable }}` (auto-escaped) instead of
`{{ variable|safe }}` in a Django template.

**Before (risky pattern):**
```js
// UNSAFE — never do this with untrusted data:
// cityNameEl.innerHTML = place.name;
```

**After (safe):**
```js
// SAFE — textContent treats the value as plain text, never as HTML
cityNameEl.textContent = place.name;
```

**Location:** `script.js`, inside `.then(({ place, weatherData }) => { … })` block

---

## Finding 3: User input not sanitised before being passed to the API — Input Validation

**Risk:**  
The raw value of the city input was passed directly to `encodeURIComponent()` with
only a whitespace-trim check. A very long string or one containing special characters
could cause unexpected API behaviour or, in a server-side context, enable injection
attacks. No maximum length or character allow-list was enforced.

**Fix:**  
Added an explicit `sanitizeInput()` function that trims whitespace, enforces a 100-
character maximum length, and strips any characters outside letters, spaces, hyphens,
and apostrophes (the full legal set for city names in every language is Unicode letters,
which `\p{L}` covers, but for broad browser support we strip only obvious script
characters). The function throws a visible error rather than silently truncating.

**Location:** `script.js`, `sanitizeInput()` function

---

## Finding 4: External resources loaded without Subresource Integrity — Supply-Chain Risk

**Risk:**  
`index.html` loaded Google Fonts over a CDN with no `integrity` attribute. If the CDN
were compromised, a malicious stylesheet could be injected — the browser would load and
apply it without warning. This is analogous to installing a PyPI package without
pinning its hash.

**Fix:**  
Added `crossorigin="anonymous"` to all external `<link>` tags. For Google Fonts
(which serves dynamically generated CSS), SRI hashes cannot be pre-computed, so the
mitigation is documented in a comment. Any static third-party asset (e.g. a pinned
CDN library) should include a `integrity="sha384-…"` attribute.

**Location:** `index.html`, `<head>` section

---

## Finding 5: No Content Security Policy header — Defence-in-Depth

**Risk:**  
Without a Content Security Policy, any XSS that did slip through would have full
permission to load external scripts, exfiltrate data, or redirect the user. A CSP
acts as a last line of defence.

**Fix:**  
Added a `<meta http-equiv="Content-Security-Policy">` tag to `index.html` that:
- allows scripts only from `'self'`  
- allows styles from `'self'` and Google Fonts  
- allows fetches only from the two Open-Meteo domains  
- blocks all other origins by default  

**Location:** `index.html`, `<head>` section (first `<meta>` tag)

---

## Rubric Cross-Reference

| Assignment requirement | How it is addressed in SkyPulse |
|---|---|
| SQL injection | No database — equivalent risk (URL injection) mitigated by `sanitizeInput()` and `encodeURIComponent()`; explained in Finding 3 |
| XSS / template escaping | All DOM writes use `.textContent`; no `innerHTML` on untrusted data (Finding 2) |
| CSRF token | No POST forms or server — not applicable; explained in Finding note above |
| Secret / env vars | No secrets in source; `CONFIG` object documents the rule; backend proxy pattern recommended (Finding 1) |
| ALLOWED_HOSTS / DEBUG | Client-side only — equivalent: CSP restricts which origins the page may contact (Finding 5) |
| Caching | `Cache-Control` meta tag added; browser caches weather responses for 10 minutes (see `script.js` cache layer) |
| Scalability write-up | See `README.md` — Scalability section |
