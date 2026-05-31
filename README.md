# Electronic Raffle

A tournament raffle management system with cryptographically random draws, rainbow ticket tracker cards, and a 1080p live display screen. Built for the **San Francisco Golden Gate Classic** (SFGGC) but generic enough for any event.

**Stack:** Next.js 14 · PostgreSQL (Neon) · Vercel · Google Workspace email

---

## What It Does

- **Ticket Tracker Cards** — half-letter (5.5×8.5") PDF cards with 6-color rainbow ticket strips; replaces physical ticket book stubs
- **Pack Tiers** — configurable denominations ($5/30-ticket, $20/120-ticket, etc.)
- **Roster Import** — CSV import from your registration portal with pre-buy pack assignment
- **POS Sales** — volunteer laptop at the door; bowler name lookup, cart-style pack selection
- **Prize Inventory** — drag-to-reorder prize list with session grouping (Tournament / Awards Ceremony)
- **CSPRNG Draw Engine** — cryptographically secure random draws with rejection sampling (no modulo bias); drawn numbers permanently discarded
- **Live 1080p Display** — dual-screen display window with color-coded ticket reveal, winner name, scrolling winner ticker
- **Google Workspace Email** — send tracker cards to buyers on sale or on demand

---

## Prerequisites

- Node.js 18+
- [Neon](https://neon.tech) PostgreSQL account (free tier works)
- [Vercel](https://vercel.com) account (free tier works)
- Google Workspace account for email (optional but recommended)

---

## Local Setup

### 1. Clone and install

```powershell
git clone https://github.com/YOUR_ORG/electronic-raffle.git
cd electronic-raffle
npm install
```

### 2. Create Neon database

1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a new project
3. Copy the connection string — looks like:
   `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

### 3. Generate admin password hash

```powershell
# Create a helper script
Set-Content -Path "makehash.js" -Value "const b = require('bcryptjs'); b.hash('YourPasswordHere', 10).then(h => { require('fs').writeFileSync('newhash.txt', h); console.log('Done'); });" -Encoding ASCII
node makehash.js
type newhash.txt
# Output: $2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Convert the hash for storage — replace the **first two `$`** signs with nothing and colons:
```
$2b$10$abc...   →   2b:10:abc...
```
(The app reconstructs the full hash at runtime. This encoding avoids `$` stripping in some env systems.)

### 4. Generate session secret

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Create startup script

Create `start-dev.ps1` (this file is gitignored — never commit it):

```powershell
$env:ADMIN_PASSWORD_HASH = '2b:10:your-encoded-hash-here'
$env:ADMIN_SESSION_SECRET = 'your-64-char-hex-string'
$env:DATABASE_URL = 'postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require'

# Email (optional — see Email Setup below)
$env:EMAIL_MODE = 'smtp'
$env:EMAIL_HOST = 'smtp.gmail.com'
$env:EMAIL_PORT = '587'
$env:EMAIL_USER = 'raffle@yourdomain.org'
$env:EMAIL_PASS = 'your-google-app-password'
$env:EMAIL_FROM_NAME = 'SFGGC Raffle'

npm run dev
```

### 6. Initialize the database

```powershell
# Start dev server to load env vars first
.\start-dev.ps1

# In a new terminal:
node create-tables.js
```

This creates all tables and inserts a default tournament with the four standard pack tiers.

### 7. Run

```powershell
.\start-dev.ps1
# Open http://localhost:3000
```

---

## Email Setup (Google Workspace)

### Option A: App Password (simpler)

1. Go to your Google account → Security → 2-Step Verification → App passwords
2. Create an app password for "Mail"
3. Use in `start-dev.ps1`:
   ```powershell
   $env:EMAIL_MODE = 'smtp'
   $env:EMAIL_HOST = 'smtp.gmail.com'
   $env:EMAIL_PORT = '587'
   $env:EMAIL_USER = 'raffle@yourdomain.org'
   $env:EMAIL_PASS = 'xxxx xxxx xxxx xxxx'   # 16-char app password
   ```

### Option B: OAuth2 (recommended for production)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable Gmail API
3. OAuth 2.0 credentials → Desktop app
4. Get refresh token via [OAuth Playground](https://developers.google.com/oauthplayground)
   - Scope: `https://mail.google.com/`
5. Use in env:
   ```powershell
   $env:EMAIL_MODE = 'oauth2'
   $env:EMAIL_USER = 'raffle@yourdomain.org'
   $env:EMAIL_CLIENT_ID = '...'
   $env:EMAIL_CLIENT_SECRET = '...'
   $env:EMAIL_REFRESH_TOKEN = '...'
   ```

---

## Vercel Deployment

### 1. Push to GitHub

```powershell
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_ORG/electronic-raffle.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your repo → Framework: Next.js → Deploy

### 3. Set environment variables in Vercel

In your Vercel project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD_HASH` | `2b:10:your-encoded-hash` |
| `ADMIN_SESSION_SECRET` | your 64-char hex string |
| `DATABASE_URL` | your Neon connection string |
| `EMAIL_MODE` | `smtp` or `oauth2` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | `raffle@yourdomain.org` |
| `EMAIL_PASS` | your app password (if smtp mode) |
| `EMAIL_FROM_NAME` | `SFGGC Raffle` |

### 4. Redeploy

```powershell
git push   # Vercel auto-deploys on push
```

---

## Workflow

### Pre-Tournament (weeks out)

1. **Setup** → create tournament, configure pack tiers, set pack quantities
2. **Setup** → Generate Pack Inventory (assigns all ticket number ranges)
3. **Setup** → Import CSV roster from SFGGC portal (assigns pre-bought packs)
4. **Inventory** → Download All Cards PDF → print on half-letter cardstock → mail to pre-buyers

### Tournament Day 1+

5. **Setup** → enable Sales Open toggle
6. **POS** → volunteer at laptop; look up bowler or enter guest name; select pack tiers; Complete Sale → print/email tracker card on the spot
7. **Prizes** → configure prize list, drag to reorder, set session labels

### Draw

8. **Setup** → close sales (disable Sales Open)
9. **Draw** → Open Display Window on second screen / projector
10. **Draw** → Select prize → click DRAW → confirm winner claims → CLAIMED → repeat
11. Re-draw button available at any time; drawn numbers permanently discarded either way
12. Skip button for no-shows; restore skipped prizes from sidebar

---

## Ticket Number System

- **6-digit default** (change to 7-digit in tournament settings for large events)
- Each pack gets a 3-digit prefix + 3-digit sequence per color
- 6 colors (Red, Orange, Yellow, Green, Blue, Purple) — all draw from one unified pool
- Prefixes assigned with a **minimum gap of 7** between same-color tiers (prevents guessing pack sizes)
- Cross-color collisions are fine — color is printed on the physical card

**Ticket Tracker Card format:**
```
[Start Number]  ←→  [End Number]
per color, printed as a rainbow strip on the card
```

---

## File Structure

```
src/
  pages/
    index.js                  → redirects to /admin/dashboard
    admin/
      login.js                → admin login
      dashboard.js            → tournament list + create
      setup.js                → pack tiers, inventory generation, sales toggle, import
      inventory.js            → full pack browser, void sales, email cards
      pos.js                  → point-of-sale: buyer lookup, cart, sale
      prizes.js               → prize CRUD, drag-to-reorder, sessions
      draw.js                 → draw control: prize selector, animated draw, display launcher
    display/
      [id].js                 → 1080p public draw display (auto-polls + postMessage)
    api/admin/
      auth.js                 → login/logout/check
      tournament.js           → tournament CRUD + sales toggle
      pack-tiers.js           → tier CRUD
      packs.js                → inventory generation + reset
      sales.js                → sell, void, buyer lookup, summary
      import.js               → CSV roster + pre-buy import
      prizes.js               → prize CRUD + bulk reorder
      draw.js                 → CSPRNG draw, skip, claim
      cards.js                → single/bulk PDF, email
  utils/
    db.js                     → PostgreSQL connection pool
    session.js                → iron-session admin auth
    prefixGen.js              → prefix generation algorithm (gap=7, CSPRNG)
    drawEngine.js             → CSPRNG draw pool + rejection sampling
    email.js                  → Nodemailer Google Workspace
    cardGenerator.js          → PDFKit half-letter tracker card
  components/
    Nav.js                    → sticky admin navigation
  styles/
    globals.css               → dark tournament theme
create-tables.js              → DB init script
```

---

## Notes

- **Draw numbers are permanent.** A drawn ticket number is discarded even if you re-draw. The "Re-draw" button picks a fresh winner for the same prize; the old number is gone forever (by design — "it has to hurt").
- **Void sales before drawing begins.** Once `draw_active` is true, voids are blocked.
- **PDF card generation** uses PDFKit server-side. The logo is fetched from its URL at generation time — make sure it's publicly accessible.
- **Display window** communicates via `postMessage` for instant updates, with 3-second polling as fallback. Open it with the "Open Display Window" button on the Draw page to get the correct origin reference.
- **Digit mode** (6 vs 7) is locked once inventory is generated. Change it in Settings before generating packs.
