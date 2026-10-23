# Service Local Finder

A responsive local-services marketplace built with plain HTML, CSS and JavaScript (no build step), with an optional zero-dependency Node.js backend and an admin panel.

> **All providers, ratings, reviews and phone numbers are fictional demo data.** No provider is shown as "verified", and sample listings can never be called or messaged.

## Features
- Search for electricians, plumbers, tutors and repair technicians by service, locality, rating and price.
- Forgiving search: ignores filler words ("plumber near me"), understands English/Hinglish/Hindi synonyms (bijli, nal, tuition, बिजली) and small typos. Empty results suggest nearby spellings and areas.
- Provider profiles with services, prices, working hours, a map and an "Open in Maps" link.
- Leaflet + OpenStreetMap map of the filtered results, plus **Use my location** to sort by distance.
- Enquiry form with shared validation (browser and server), duplicate protection and a reference number.
- **Track** page: look up an enquiry by its reference (`LSF-XXXXXXXX`).
- **Admin panel** to manage enquiries (status, private notes, export, delete).
- Falls back to demo data and LocalStorage when the API is unreachable.

## Project structure
```
local-service-finder/
├── index.html  providers.html  provider.html  enquiry.html  track.html  login.html  admin.html
├── css/style.css
├── js/
│   ├── data.js        demo providers, categories, localities, COORDS, TEST_PHONE
│   ├── validate.js    validation rules shared by browser and server
│   ├── search.js      stopwords, synonyms, typo-tolerant matching
│   ├── app.js         shared helpers (API access, header/footer, map, contact logic)
│   ├── providers.js   results page: filters, sorting, map, geolocation
│   ├── provider.js    single profile page
│   ├── enquiry.js     enquiry form and WhatsApp follow-up
│   ├── track.js       enquiry status lookup
│   ├── login.js       customer login / sign-up
│   └── admin.js       admin panel
├── server/server.mjs  optional Node API + static file hosting
├── assets/images/     favicon (provider photos load from pravatar.cc with an initials fallback)
├── start-windows.bat  one-click server start for Windows
└── package.json  README.md
```

## Run it

### Option 1: Frontend only (VS Code Live Server)
1. Open the folder in VS Code and install the **Live Server** extension.
2. Right-click `index.html` → **Open with Live Server** (usually http://127.0.0.1:5500).

Enquiries are saved in the browser's LocalStorage.

### Option 2: With the backend (Node 18+, no `npm install`)
1. In a terminal inside the project folder: `npm start` (or `node server/server.mjs`).
2. Open http://localhost:3000. You can also keep Live Server on port 5500: the frontend finds the API at `localhost:3000` automatically and CORS allows `localhost:5500` / `127.0.0.1:5500`.
3. If the API is unreachable, the site silently falls back to demo data and LocalStorage.

**Windows shortcut:** double-click `start-windows.bat`. It checks that Node.js is installed, starts the server and opens the admin page.

**Environment variables (all optional)**

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (default `3000`) |
| `ADMIN_KEY` | Admin password. Defaults to `ABHI-112` if not set |
| `ALLOWED_ORIGINS` | Extra CORS origins, comma-separated |

## API
| Method | Endpoint | Notes |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/providers` | All providers |
| GET | `/api/providers/:id` | One provider (404 if unknown) |
| POST | `/api/enquiries` | Create an enquiry. Public requests are rate-limited; with `X-Admin-Key` the enquiry is added by admin |
| GET | `/api/enquiries/:ref` | Public status lookup, returns no personal data |
| GET | `/api/enquiries` | List all enquiries (needs `X-Admin-Key`) |
| PATCH | `/api/enquiries/:ref` | Change status and/or private note (needs `X-Admin-Key`) |
| DELETE | `/api/enquiries/:ref` | Delete an enquiry (needs `X-Admin-Key`) |

Server behaviour: every enquiry is re-validated with the same `validate.js`, body size is capped, public submissions are limited to 10 per 10 minutes per IP, duplicates within a minute are refused (409), data is written atomically to `server/db.json`, and the `server/` folder, `package.json` and dotfiles are never served.

## User login (customers)
- `login.html` has **Login** and **Create account** (name, 10-digit mobile number, password of 8+ characters). It needs the Node server (`npm start`).
- Passwords are hashed with scrypt (never stored in plain text) in `server/db.json`; sessions are random tokens kept in memory for 7 days, so restarting the server logs everyone out. Login attempts are rate-limited.
- Once logged in, the header shows "Hi, <name>" and the enquiry form prefills name and mobile number. The token is stored in this browser's LocalStorage (`lsf_user`).
- API: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (token in the `X-User-Token` header).
- Not included yet: password reset, phone/OTP verification, "my enquiries" list. Add HTTPS before real use.

## Admin panel
Open http://localhost:3000/admin.html and sign in with the admin key. The link is not shown in the site menu.

1. Set your own key before starting the server (the default `ABHI-112` is only for local testing):
   - Mac/Linux: `ADMIN_KEY=your-secret npm start`
   - Windows PowerShell: `$env:ADMIN_KEY='your-secret'; npm start`
   - Windows cmd: `set ADMIN_KEY=your-secret&& npm start`
2. **Providers and Categories** are view-only with real data (they live in `js/data.js`). Turn on **Sample data** (top bar) to try add, edit and delete with confirmation dialogs; those changes exist only in the open browser tab and are never saved.
3. You can search and filter enquiries, set a status (New, Contacted, Confirmed, Completed, Cancelled), add a private note, add an enquiry manually, WhatsApp or call the customer, delete, and export CSV.
4. CSV export prefixes cells starting with `=`, `+`, `-` or `@` so spreadsheets never run them as formulas.

Notes:
- The key is kept in that browser tab only (`sessionStorage`) and wrong keys are rate-limited.
- If the Node server is not running, the sign-in page offers **local demo mode**, which shows only the enquiries saved in that browser (no key, no server). Use the server for real work.
- With the server, the panel only shows enquiries saved on the server. Enquiries saved in a visitor's own browser (no backend) are not visible.
- **Change the default key and use HTTPS before putting the site online.** Use a long random key.

## Location features
- Map tiles come from OpenStreetMap, which refuses requests without a Referer. The server therefore sends `Referrer-Policy: strict-origin-when-cross-origin`, and the map must be opened over http (Live Server or `npm start`), not by double-clicking the HTML file.
- Each locality has approximate demo coordinates (`COORDS` in `js/data.js`). The providers page shows a map of the filtered results, and each profile has its own map and an "Open in Maps" link.
- **Use my location** asks the browser for permission (works on `localhost` or HTTPS) and sorts by straight-line distance. The position is kept in memory only: it is never saved or added to the URL.

## Calling and WhatsApp (demo vs real providers)
- Sample (fictional) providers are never dialled: Call/WhatsApp buttons show a "sample listing" notice instead, because the numbers could belong to real people.
- To test the buttons, open `js/data.js` and set `TEST_PHONE` to your own 10-digit mobile number (starts with 6-9). Call/WhatsApp then go to that number for every provider.
- Real providers you add (without the `demo` flag) use their own phone number.
- `DEMO_MODE` in `js/data.js` is kept only for reference; the buttons now depend on `TEST_PHONE` and the provider's `demo` flag.

## Enquiry follow-up
- After saving an enquiry, **Open WhatsApp with this message** lets the user reach the provider. For sample listings WhatsApp opens without a recipient unless `TEST_PHONE` is set.
- **Track** (`track.html`) shows progress from the reference. It only knows what the user did (saved, opened WhatsApp), never a provider reply.
- The price limit compares per-visit and per-hour prices separately. Bookings must fall inside the provider's listed hours (IST) within the next 90 days.

## Test the full journey
1. Home → search "plumber" + locality "Beta" → results page with `?q=plumber&loc=Beta` in the URL.
2. Try "bijli", "tuition" or a typo like "plmber".
3. Combine category, locality, minimum rating and max price; change sorting; press **Clear Filters**.
4. Press **Use my location** and check that results sort by distance.
5. Open **View Profile**; try `provider.html?id=nope` for the not-found state.
6. **Enquire Now** → submit empty (inline errors) → bad phone `12345` → past date → valid enquiry → reference shown.
7. Copy the reference into `track.html` and check the status.
8. Refresh `enquiry.html`: the enquiry is listed under "Saved in this browser".
9. Submit the same enquiry twice quickly: the duplicate is refused.
10. Start the server, open `admin.html`, sign in, change a status, add a note, export CSV.
11. Narrow the window (<860px) and use the menu button; check the console for errors.

## Deploy
- **GitHub Pages** (frontend only): push the folder, *Settings → Pages → Deploy from branch → /root*. Enquiries stay in each visitor's browser.
- **Vercel**: import the repo as a *static site* (no build command, output directory `.`).
- **Backend**: host `server/server.mjs` on Render, Railway or Fly.io (start command `npm start`). Set `ADMIN_KEY` and `ALLOWED_ORIGINS` (your site URL), then in the browser console run `localStorage.lsf_api='https://your-api/api'` (or hard-code `API` in `js/app.js`). The JSON file store suits demos only.

## Limitations and next steps
- LocalStorage is per-browser, unencrypted and clearable. The JSON file store has no backups or multi-server support.
- Providers are **not notified**: nothing is emailed, texted or booked. Do not present this as a booking system.
- No customer accounts, provider onboarding or real verification.
- External resources are loaded from CDNs (Google Fonts, Lucide icons from unpkg, Leaflet/OpenStreetMap tiles, pravatar photos), so some visuals need internet access.
- Production path: replace the JSON store with PostgreSQL, add provider/admin authentication, send notifications via email/SMS/WhatsApp Business API, add CAPTCHA, a privacy policy and data-retention rules, and move reviews to real, moderated customer feedback.