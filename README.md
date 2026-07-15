# KGolfDraft

A real-time golf snake draft web app with integrated chat. Built for a group of friends to draft golfers in snake order — runs occasionally when a draft event is held. All data (users, drafts, picks, chat, history) lives in a Neon Postgres database.

**Live at:** [golfdraft.ahsdesigns.com](https://golfdraft.ahsdesigns.com)

---

## Prerequisites

- **Node.js v18+** — [Download](https://nodejs.org/)
- **A Neon account** — free serverless Postgres at [neon.tech](https://neon.tech)
- **A Cloudflare account** — for the tunnel (free tier is fine)
- **`cloudflared` CLI** — [Download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

---

## Setup Guide

### Step 1: Neon Database

1. Go to [neon.tech](https://neon.tech) and create a project (e.g., `kgolfdraft`)
2. On the project dashboard, click **Connect** and copy the **connection string** (looks like `postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require`)
3. That's it — the backend creates all tables automatically on first start, and seeds the super-admin account

### Step 2: Backend Setup

1. Clone this repo on your computer
2. Create a `.env` file in `backend/` (see `backend/.env.example`):

```bash
PORT=3001
DATABASE_URL=postgresql://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require
SUPER_ADMIN_PIN=your-secret-pin
SUPER_ADMIN_EMAIL=ahsohn@gmail.com
```

3. Install dependencies:

```bash
cd backend
npm install
```

### Step 3: Cloudflare Tunnel (one-time setup)

This exposes your local backend to the internet at a stable URL.

**If you haven't added your domain to Cloudflare yet:**

1. Sign up at [Cloudflare](https://dash.cloudflare.com)
2. Add `ahsdesigns.com` (or your domain)
3. Update nameservers at your domain registrar to point to Cloudflare's nameservers
4. Re-create any existing DNS records (e.g., for your Squarespace site) in the Cloudflare dashboard
5. Wait for DNS propagation

**Create the tunnel:**

```bash
# Authenticate (opens browser)
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create kgolfdraft

# Route your subdomain to the tunnel
cloudflared tunnel route dns kgolfdraft draft-api.ahsdesigns.com
```

**Create the config file** at `~/.cloudflared/config.yml`:

```yaml
tunnel: kgolfdraft
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: draft-api.ahsdesigns.com
    service: http://localhost:3001
  - service: http_status:404
```

Replace `<TUNNEL_ID>` with the ID printed when you created the tunnel (also visible in `~/.cloudflared/` as a `.json` file).

### Step 4: Vercel Deployment (one-time setup)

1. Push this repo to GitHub
2. Go to [Vercel](https://vercel.com) and import the repository
3. Set the **Root Directory** to `frontend`
4. Add the environment variable:
   - `NEXT_PUBLIC_BACKEND_URL` = `https://draft-api.ahsdesigns.com`
5. Deploy
6. In the Vercel project settings, add the custom domain: `golfdraft.ahsdesigns.com`
7. In Cloudflare DNS, add a CNAME record:
   - **Name:** `golfdraft`
   - **Target:** `cname.vercel-dns.com`
   - **Proxy status:** DNS only (gray cloud, NOT proxied)

---

## Setting Up a Draft (Super Admin)

1. Start the backend and tunnel (see below), then log in at [golfdraft.ahsdesigns.com](https://golfdraft.ahsdesigns.com) with the super-admin email — you'll be asked for your PIN
2. Click **Super Admin** in the header to open the Super Admin panel
3. In **Group Users**, add your friends (email + display name); check **Admin** for anyone who should be able to start the draft or pick on behalf of others
4. In **Drafts**, create a new draft (name, theme, format, rounds)
5. Select the draft, paste the **player list** (`Name, Rank` — one per line), and pick the **participants** and their draft order (not everyone in the group has to play in every draft)
6. Click **Make Current** — the draft is now what everyone sees at the site

Past drafts stay in the Drafts list forever, with results viewable and downloadable as CSV.

## Running a Draft

Every time you want to run a draft, you just need to do these steps on your computer:

### 1. Start the backend server

```bash
cd backend
npm start
```

You should see:
```
Postgres (Neon) initialized
Loaded draft "..." (#N): X players, Y participants, 0 picks, status=waiting
Server running on port 3001
```

### 2. Start the Cloudflare Tunnel

In a separate terminal:

```bash
cloudflared tunnel run kgolfdraft
```

### 3. Share the link

Tell your friends to go to **[golfdraft.ahsdesigns.com](https://golfdraft.ahsdesigns.com)** and log in with the email you added them with.

### 4. Start the draft

Once enough people are logged in:
1. Click **Show Admin Panel**
2. Confirm rounds/format (pre-filled from the draft's settings)
3. Click **Start Draft**

### 5. During and after the draft

- Every pick is saved to Postgres immediately — if the backend restarts, it resumes right where it left off
- The super-admin can **Undo Last Pick** (admin panel on the draft page, or the Super Admin panel) if someone mis-picks
- When the last pick is made, the draft is marked complete and its results stay in the history
- **Download Results CSV** from the admin panel or the Super Admin panel

To shut down, press `Ctrl+C` in both terminal windows (server and tunnel).

---

## Draft Day Checklist

- [ ] Draft created in the Super Admin panel with players, participants, and draft order
- [ ] Draft is set as **Current**
- [ ] Backend `.env` has `DATABASE_URL` and `SUPER_ADMIN_PIN`
- [ ] Run `npm start` in the `backend/` directory
- [ ] Run `cloudflared tunnel run kgolfdraft` in a separate terminal
- [ ] Verify the server is reachable: visit `https://draft-api.ahsdesigns.com/health` in a browser
- [ ] Share the link with your group: `https://golfdraft.ahsdesigns.com`
- [ ] Log in and start the draft when everyone's ready

---

## Local Development

For developing/testing without Cloudflare Tunnel:

```bash
# Terminal 1: Backend
cd backend
cp .env.example .env    # Edit with your Neon DATABASE_URL and PIN
npm install
npm run dev             # Starts on localhost:3001 with hot reload

# Terminal 2: Frontend
cd frontend
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:3001" > .env.local
npm install
npm run dev             # Starts on localhost:3000
```

Run the backend's draft-logic tests (no database needed) with `npm test` in `backend/`.

---

## Troubleshooting

**"Cannot connect to draft server"** on the login page
- Make sure the backend is running (`npm start` in `backend/`)
- Make sure the Cloudflare Tunnel is running (`cloudflared tunnel run kgolfdraft`)
- Check `https://draft-api.ahsdesigns.com/health` — should return `{"status":"ok"}`

**"Email not found"** on login
- Add the user in the Super Admin panel (Group Users tab) — the email must match (case-insensitive)

**"SUPER_ADMIN_PIN is not configured on the server"**
- Set `SUPER_ADMIN_PIN` in `backend/.env` and restart the backend

**Backend fails to start with a database error**
- Verify `DATABASE_URL` in your `.env` is the full Neon connection string (including `?sslmode=require`)
- Check that the Neon project is active (free-tier projects suspend when idle but wake automatically — the first connection can take a few seconds)

**Users see "No draft is set up yet"**
- Open the Super Admin panel and click **Make Current** on the draft you want to run
