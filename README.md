# KGolfDraft

A real-time golf snake draft web app with integrated chat. Built for a group of friends to draft golfers in snake order — runs occasionally when a draft event is held.

**Live at:** [golfdraft.ahsdesigns.com](https://golfdraft.ahsdesigns.com)

---

## Prerequisites

- **Node.js v18+** — [Download](https://nodejs.org/)
- **A Google account** — for Google Cloud and Google Sheets
- **A Cloudflare account** — for the tunnel (free tier is fine)
- **`cloudflared` CLI** — [Download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

---

## Setup Guide

### Step 1: Google Cloud Service Account

This allows the backend to read/write your Google Sheet programmatically.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services > Library**
4. Search for **Google Sheets API** and click **Enable**
5. Navigate to **APIs & Services > Credentials**
6. Click **Create Credentials > Service Account**
   - Give it a name (e.g., `kgolfdraft`)
   - Click **Done** (no need to grant additional roles)
7. Click on the newly created service account
8. Go to the **Keys** tab
9. Click **Add Key > Create new key > JSON**
10. Save the downloaded JSON file — you'll need it later

**Important:** Note the service account's email address (looks like `kgolfdraft@yourproject.iam.gserviceaccount.com`). You'll need it in Step 2.

### Step 2: Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. **Share the sheet** with your service account email (from Step 1) — give it **Editor** access
3. Note the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

Create three tabs with these exact names and headers:

#### Tab: `Players`

| Name | Rank |
|------|------|
| Scottie Scheffler | 1 |
| Xander Schauffele | 2 |
| Rory McIlroy | 3 |
| ... | ... |

#### Tab: `Users`

| Email | Name | Draft Order | Is Admin |
|-------|------|-------------|----------|
| you@email.com | Your Name | 1 | TRUE |
| friend1@email.com | Friend 1 | 2 | FALSE |
| friend2@email.com | Friend 2 | 3 | FALSE |
| ... | ... | ... | ... |

- **Draft Order** determines pick order (1 picks first in odd rounds, last in even rounds)
- **Is Admin** should be `TRUE` for you and anyone else who should be able to start the draft or pick on behalf of others

#### Tab: `Picks`

| Round | Pick Number | User Email | User Name | Golfer Name |
|-------|-------------|------------|-----------|-------------|

Leave the data rows empty — just add the headers. This sheet is populated automatically during the draft.

A **Chat Log** tab will also be created automatically when the draft finishes.

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

### Step 5: Backend Setup

1. Clone this repo on your computer
2. Copy the service account JSON key file into the `backend/` directory
3. Create a `.env` file in `backend/`:

```bash
PORT=3001
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
```

4. Install dependencies:

```bash
cd backend
npm install
```

---

## Running a Draft

Every time you want to run a draft, you just need to do these steps on your computer:

### 1. Start the backend server

```bash
cd backend
npm start
```

You should see:
```
Google Sheets API initialized
Initialized: X players, Y users, 0 existing picks
Server running on port 3001
```

### 2. Start the Cloudflare Tunnel

In a separate terminal:

```bash
cloudflared tunnel run kgolfdraft
```

### 3. Share the link

Tell your friends to go to **[golfdraft.ahsdesigns.com](https://golfdraft.ahsdesigns.com)** and log in with the email you put in the Users sheet.

### 4. Start the draft

Once enough people are logged in:
1. Click **Show Admin Panel**
2. Set the number of rounds
3. Click **Start Draft**

### 5. After the draft

When the last pick is made:
- The draft board shows the final results
- All picks are saved in the **Picks** tab of your Google Sheet
- The full chat log is saved in a **Chat Log** tab

To shut down, press `Ctrl+C` in both terminal windows (server and tunnel).

---

## Draft Day Checklist

- [ ] Google Sheet is populated with **Players** (name + rank) and **Users** (email, name, draft order, admin flag)
- [ ] **Picks** tab has headers only (no leftover data from a previous draft)
- [ ] Backend `.env` file has the correct `GOOGLE_SHEET_ID`
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
cp .env.example .env    # Edit with your Google Sheet ID and key path
npm install
npm run dev             # Starts on localhost:3001 with hot reload

# Terminal 2: Frontend
cd frontend
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:3001" > .env.local
npm install
npm run dev             # Starts on localhost:3000
```

---

## Troubleshooting

**"Cannot connect to draft server"** on the login page
- Make sure the backend is running (`npm start` in `backend/`)
- Make sure the Cloudflare Tunnel is running (`cloudflared tunnel run kgolfdraft`)
- Check `https://draft-api.ahsdesigns.com/health` — should return `{"status":"ok"}`

**"Email not found"** on login
- Check the Users tab in your Google Sheet — the email must match exactly (case-insensitive)
- Make sure the sheet is shared with the service account email

**Backend fails to start with a Google Sheets error**
- Verify `GOOGLE_SHEET_ID` in your `.env` is correct
- Verify the JSON key file path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` is correct
- Make sure the sheet is shared with the service account (Editor access)
- Make sure the Google Sheets API is enabled in your Google Cloud project

**Picks not saving to the Google Sheet**
- Check the backend terminal for errors
- Verify the service account has **Editor** (not Viewer) access to the sheet
