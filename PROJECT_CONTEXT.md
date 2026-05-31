# Electronic Raffle App — Project Context

> **Living document.** Update this after every session and upload to the project container so Claude has full context on resume.

---

## App Identity
- **Name:** Electronic Raffle
- **Purpose:** Tournament raffle management system for SFGGC — replaces Excel-based system
- **Live URL:** Deployed on Vercel (Allison Laureano's Hobby project)
- **GitHub:** `StarlightEnt/electronic-raffle`
- **Stack:** Next.js 14, PostgreSQL (Neon), Vercel, Google Workspace email

---

## Credentials & Config

### Neon Database
- **Host:** `ep-crimson-sea-apft3pb3-pooler.c-7.us-east-1.aws.neon.tech`
- **Connection string:** `postgresql://neondb_owner:npg_gdMbq09LElSt@ep-crimson-sea-apft3pb3-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

### Admin Auth
- **Password:** BowlingFishBalls
- **Hash (colon-encoded):** `2a:10:CmThqBYjn.bYYwE/Yu2p..l.mg6RAzDCaKYwkX6pzxyrhOr01V7uq`
- **Session secret:** `e9766cf92a7be042b1d212f73c6da09d0f8bf47483e45f53cc7151e3bb4a9916`

### Vercel Environment Variables
| Variable | Value |
|---|---|
| `ADMIN_PASSWORD_HASH` | `2a:10:CmThqBYjn.bYYwE/Yu2p..l.mg6RAzDCaKYwkX6pzxyrhOr01V7uq` |
| `ADMIN_SESSION_SECRET` | `e9766cf92a7be042b1d212f73c6da09d0f8bf47483e45f53cc7151e3bb4a9916` |
| `DATABASE_URL` | (Neon connection string above) |
| `EMAIL_MODE` | `smtp` (when configured) |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | `raffle@goldengateclassic.org` |
| `EMAIL_PASS` | (Google Workspace app password — not yet configured) |
| `EMAIL_FROM_NAME` | `SFGGC Raffle` |

---

## Local Dev Setup

```powershell
git clone https://github.com/StarlightEnt/electronic-raffle.git
cd electronic-raffle
npm install
```

Create `start-dev.ps1` (gitignored):
```powershell
$env:ADMIN_PASSWORD_HASH = '2a:10:CmThqBYjn.bYYwE/Yu2p..l.mg6RAzDCaKYwkX6pzxyrhOr01V7uq'
$env:ADMIN_SESSION_SECRET = 'e9766cf92a7be042b1d212f73c6da09d0f8bf47483e45f53cc7151e3bb4a9916'
$env:DATABASE_URL = 'postgresql://neondb_owner:npg_gdMbq09LElSt@ep-crimson-sea-apft3pb3-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
npm run dev
```

DB is already initialized on Neon — do NOT run `create-tables.js` again against production.

---

## Architecture

### Ticket Number System
- **6-digit default** (configurable to 7-digit in settings before inventory generation)
- Each 2-digit seed owns a range of 10,000 tickets (seed 39 → 390000–399999)
- **Overflow threshold: 9,999 tickets per color per tier** (not 999 — this was a bug that was fixed)
- **Minimum gap of 7** between same-color tier seeds (prevents pack size guessing)
- Cross-color proximity is immaterial — color is printed on physical card
- Pack serial format: `030 1001`, `120 1001`, etc.

### Draw Engine
- CSPRNG: `crypto.randomBytes(4)` with rejection sampling (no modulo bias)
- Pool = mathematical ranges of sold tickets (not expanded in memory)
- Drawn numbers permanently discarded — one and done
- Re-draw picks new number; old number still gone ("it has to hurt")

### Ticket Tracker Card — Final Design
- **Format:** Landscape half-letter (8.5×5.5"), PDFKit
- **Ticket strip anchored at y=188** (just above vertical midline)
- **Logo:** top-left, 40% card height, aspect ratio 281/323
- **"[N] Tickets":** Nunito Bold 46pt, #87CEEB→#1565C0 gradient
- **"TICKET TRACKER":** Copperplate Gothic Bold 36pt, 4-layer 3D shadow:
  - Layers 3-4: lavender `#C9A0DC`
  - Layer 2: light lavender `#DEC4EC`
  - Layer 1: near-white `#F2EEEE`
  - Top: main purple `#8B2FC9`
  - Offset: 0.9pts per layer
- **Price badge:** Nunito Bold, peach `#F4A460`, rotated -8°, **dynamically sized** via `doc.widthOfString()` (62pt max)
- **Ticket stubs:** Actual JPEG images from original Word doc, 3 rows × 6 colors at natural aspect ratio (256×132px), 4pt row gap
- **Header labels:** Constantia 9pt black, vertically centered in stub
- **Numbers:** Constantia 10-12pt, ticket color, 0.25pt black hairline outline
- **START/END labels:** Constantia 8pt bold purple (stroke+fill, lineWidth 0.4)
- **Footer:** Constantia 8pt — name centered purple, serial right gray; duplicate year stripped

### Assets
```
public/
  ticket_red.jpg
  ticket_orange.jpg
  ticket_yellow.jpg
  ticket_green.jpg
  ticket_blue.jpg
  ticket_purple.jpg
  fonts/
    COPRGTB.TTF       — Copperplate Gothic Bold
    CONSTAN.TTF       — Constantia
    Nunito-Bold.ttf   — Nunito Bold
```

---

## File Structure

```
src/
  pages/
    index.js                  → redirect to /admin/dashboard
    admin/
      login.js
      dashboard.js            — tournament list + create
      setup.js                — tiers (inline edit), inventory, logo upload, import, sales toggle
      inventory.js            — pack browser, void, email cards
      pos.js                  — POS: buyer lookup, cart, sale
      prizes.js               — prize CRUD, drag-to-reorder, sessions
      draw.js                 — draw control, animated draw, display launcher
    display/
      [id].js                 — 1080p public display (postMessage + 3s poll)
    api/admin/
      auth.js                 — login/logout (colon-encoded hash reconstruction)
      tournament.js           — CRUD + sales/draw toggle
      pack-tiers.js           — CRUD, validates % 6
      packs.js                — generate inventory, reset
      sales.js                — sell, void, lookup, summary
      import.js               — CSV roster + pre-buy
      prizes.js               — CRUD + bulk reorder
      draw.js                 — CSPRNG draw, skip, claim (fixed JSONB path)
      cards.js                — single/bulk PDF, email (native fetch)
  utils/
    db.js
    session.js
    prefixGen.js              — gap=7, seed owns 10k tickets, overflow at 9999
    drawEngine.js             — CSPRNG, rejection sampling
    email.js                  — Nodemailer SMTP/OAuth2
    cardGenerator.js          — FINAL DESIGN (see above)
  components/
    Nav.js
  styles/
    globals.css               — dark theme, gold accent HARDCODED (bug — see below)
create-tables.js
```

---

## Known Bugs (next session)

### Bug 1: Accent color not applied to UI
- `primary_color` is saved to `tournament_settings` DB table
- But `globals.css` has `--gold: #f59e0b` hardcoded
- Nav, buttons, badges all use this hardcoded value regardless of tournament setting
- **Fix needed:** Inject tournament's `primary_color` as a CSS variable at runtime (via `_app.js` or a style tag in the layout)

### Bug 2: Double year in setup subtitle
- Setup page subtitle shows "San Francisco Golden Gate Classic Invitational 2027 2027"
- The `tournament.name` already contains the year, and `tournament.year` is appended separately
- **Fix needed:** In `setup.js` subtitle line, just show `tournament.name` without appending `tournament.year`
- Note: card footer already has this fixed via regex

### Bug 3: tournamentName year doubling in cards.js
- In `cards.js`, `tournamentName` is built as `tournament.name + " " + tournament.year`
- If the name already contains the year this doubles it
- **Fix needed:** Check if name already ends with the year before appending

---

## Completed Features

- ✅ Tournament CRUD + settings (name, year, location, dates, logo, accent color, digit mode)
- ✅ Logo upload (base64 file upload + URL fallback, with preview thumbnail)
- ✅ Pack tier CRUD with inline editing (name, ticket count, price, qty)
- ✅ Overflow detection correctly at 9,999 per seed
- ✅ Pack inventory generation (prefix algorithm, gap enforcement, collision check)
- ✅ CSV roster import with pre-buy pack assignment
- ✅ Sales toggle (open/closed)
- ✅ POS sales with buyer typeahead, cart, sale result + print/email
- ✅ Inventory browser with void, email, tier/status filter
- ✅ Prize CRUD with drag-to-reorder and session labels
- ✅ CSPRNG draw engine with permanent discard
- ✅ Re-draw and skip buttons
- ✅ 1080p live display with postMessage + polling
- ✅ Ticket Tracker card — final design (all 4 tiers)
- ✅ Bulk PDF download by tier or all tiers

---

## Pending / Future

- ⬜ **Accent color applied to UI** (Bug 1 above)
- ⬜ **Email configuration** — Google Workspace app password not yet set in Vercel
- ⬜ **Draw flow end-to-end test** — display window + postMessage not yet tested live
- ⬜ **Quadrant zoom / TV auto-rotate** on display (future)
- ⬜ **SFGGC portal auth integration** (future)

---

## Session Log

### Session 1 (2026-05-30/31)
- Full system design and spec (ticket number algorithm, pack tiers, draw engine, display)
- Built all 28 files (~4,200 lines)
- Deployed to Vercel + Neon
- Fixed overflow threshold bug (999→9999)
- Built Ticket Tracker card through many preview iterations to final approved design
- Extracted ticket stub images and fonts from original Word document
- Implemented dynamic price badge sizing via `doc.widthOfString()`
