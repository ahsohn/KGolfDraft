# KGolfDraft — Golf Snake Draft Web Application

## Version Management

The app version is defined in `frontend/src/lib/version.ts` and displayed on the login screen. **Every time you make changes based on a user request, increment the patch version** (e.g., 1.1.0 → 1.1.1). For larger feature additions, increment the minor version (e.g., 1.1.1 → 1.2.0).

## Project Overview

A real-time golf snake draft web application with integrated chat for a group of up to 16 friends. The app is used occasionally when a draft event is held — it is not a persistent service. A super-admin sets up drafts (player lists, participants, draft order) in the built-in Super Admin panel, starts the backend on their local machine, and participants join via the web to draft golfers in snake order. All data is stored in a Neon Postgres database, including a history of past drafts.

## Tech Stack

- **Frontend**: Next.js (React), deployed to Vercel at `golfdraft.ahsdesigns.com`
- **Backend**: Node.js with Socket.IO for real-time WebSocket communication, runs locally on the admin's machine and is exposed via Cloudflare Tunnel at `draft-api.ahsdesigns.com`
- **Data Layer**: Neon Postgres (serverless), accessed via the `pg` driver with a `DATABASE_URL` connection string
- **Styling**: Responsive design — mobile and desktop friendly

## Architecture

```
┌──────────────────┐       WebSocket (Socket.IO)       ┌───────────────────┐
│   Next.js App    │ ◄──────────────────────────────► │ Cloudflare Tunnel │
│   (Vercel)       │                                   │                   │
│  golfdraft.      │                                   │  draft-api.       │
│  ahsdesigns.com  │                                   │  ahsdesigns.com   │
└──────────────────┘                                   └─────────┬─────────┘
                                                                 │
                                                        cloudflared daemon
                                                                 │
                                                       ┌─────────▼─────────┐
                                                       │  Node.js Server   │
                                                       │  (Admin's PC)     │
                                                       │  localhost:3001   │
                                                       └─────────┬─────────┘
                                                                 │
                                                          pg (DATABASE_URL)
                                                                 │
                                                       ┌─────────▼─────────┐
                                                       │  Neon Postgres    │
                                                       │  (users, drafts,  │
                                                       │   picks, chat)    │
                                                       └───────────────────┘
```

- The **frontend** on Vercel connects to the backend via Socket.IO WebSocket through Cloudflare Tunnel.
- The **backend** manages all draft state, chat, auto-draft logic, and reads/writes Neon Postgres.
- The **backend URL** is stable: `https://draft-api.ahsdesigns.com` — the same URL works every draft session. The `cloudflared` daemon on the admin's machine routes traffic from Cloudflare to the local Node.js server.

## Database Schema (created automatically on startup)

| Table | Purpose |
|-------|---------|
| `users` | The group of friends: email (login), display name, `is_admin`, `is_super_admin`. The super-admin row is seeded from `SUPER_ADMIN_EMAIL` on startup. |
| `drafts` | One row per draft event: name, theme (`golf`/`worldcup`), format (`snake`/`thirdRoundReversal`), total rounds, status (`waiting`/`active`/`complete`), `is_current` flag, timestamps. Past drafts remain as history. |
| `draft_players` | Per-draft player pool (golfer/country name + rank for auto-draft ordering). |
| `draft_participants` | Which group users compete in a given draft, with their draft-order position. Not all group users play in every draft. |
| `picks` | Every pick: round, overall pick number, user email/name, selection. |
| `chat_messages` | Full chat log per draft (user and system messages). |

Only one draft is **current** at a time (`drafts.is_current`) — that is the draft the `/draft` page shows. The super-admin switches the current draft from the Super Admin panel. The schema is created with `CREATE TABLE IF NOT EXISTS` on every backend start, so no migration tooling is needed.

## Authentication

- **Email-only login** for regular users — no passwords; the backend validates the email against the `users` table
- **Super-admin (ahsohn@gmail.com)** additionally enters a PIN after their email. The PIN is set via the `SUPER_ADMIN_PIN` env var on the backend; the super-admin account is seeded from `SUPER_ADMIN_EMAIL` (default `ahsohn@gmail.com`)
- Session is managed via a simple token stored in the browser
- Roles: **super-admin** (full control: manage drafts, users, undo picks) > **admin** (start draft, pick on behalf of users, toggle anyone's auto-draft) > participant

## Super Admin Panel (`/super-admin`)

Only accessible to the super-admin. Capabilities:

- **Create drafts** (name, theme, format, rounds) and edit their settings while still in `waiting`
- **Player lists**: paste/edit `Name, Rank` lines per draft (locked once picks exist)
- **Participants & draft order**: choose which group users compete and assign order positions (unique, starting at 1; locked once the draft starts)
- **Group users**: add/rename/remove users, grant or revoke regular-admin
- **Make Current**: choose which draft the `/draft` page shows
- **History**: all past drafts remain listed with their results
- **Download CSV** of any draft's results (also available to admins in the draft-page admin panel)
- **Undo Last Pick** during an active (or just-completed) draft — restores the player, puts the picker back on the clock, and disables their auto-draft so the pick isn't instantly re-made

## Draft Mechanics

### Snake Draft Order
- Odd rounds: pick order goes 1 → N (ascending by draft order)
- Even rounds: pick order goes N → 1 (descending — the "snake" reversal)
- Draft order position (1 through N) is set per participant in the Super Admin panel
- The app handles the snake reversal automatically
- **3rd Round Reversal format** (selectable per draft): a fixed 6-round, 48-pick order for 8 teams that includes compensatory picks for teams 7 and 8. Rounds have varying lengths, so the order is defined explicitly (by draft-order position) rather than computed:
  - R1: 1, 2, 3, 4, 5, 6, 7, 8
  - R2: 8, 7, 6, 5, 4, 3, 8, 7, 2, 1 (teams 8 and 7 each get a compensatory pick)
  - R3: 8, 7, 6, 5, 4, 3, 2, 1
  - R4: 1, 2, 3, 4, 5, 6, 7, 8
  - R5: 8, 7, 6, 5, 4, 3, 2, 1
  - R6: 1, 2, 3, 4, 5, 6 (teams 7 and 8 have no pick)

  When this format is selected, the total rounds setting is ignored and fixed at 6.

### Draft Flow
1. Super-admin creates a draft in the Super Admin panel: players, participants, draft order, theme, format
2. Super-admin makes it the **current** draft
3. Users log in with their email
4. An admin starts the draft when enough players are present
5. Each user picks a golfer when it's their turn
6. Picks are recorded to Postgres and announced in chat
7. When all rounds finish the draft is marked complete and stays in history

If the backend restarts mid-draft, it reloads the current draft (including picks and chat) from Postgres and resumes where it left off.

### Pick Rules
- **No time limit** on individual picks
- **Admin override**: Admins can make a pick on behalf of any user who is taking too long
- **Auto-draft**: Users can toggle auto-draft for themselves, which automatically picks the highest-ranked remaining golfer when it's their turn
- **Non-logged-in users** are NOT set to auto-draft by default
- **Admin auto-draft control**: Admins can toggle auto-draft on/off for any user, whether that user is logged in or not
- **Undo**: The super-admin can undo the most recent pick at any point during an active draft

## Chat

- Real-time chat via Socket.IO, visible to all logged-in users
- Draft picks are automatically posted as system messages in the chat (e.g., "Alice picked Tiger Woods with pick #5")
- Chat is persisted to Postgres per draft, so history survives server restarts

## Post-Draft

- Display a summary page showing each participant's drafted team
- Results live permanently in Postgres and are downloadable as CSV from the Super Admin panel or the draft-page admin panel

## Deployment & Setup

### Neon Setup (one-time)
1. Create a project at https://neon.tech
2. Copy the connection string (Dashboard → Connect) into `DATABASE_URL` in `backend/.env`
3. Tables are created automatically the first time the backend starts

### Cloudflare DNS Setup (if not already done)
1. Sign up for a free Cloudflare account at https://dash.cloudflare.com
2. Add `ahsdesigns.com` to Cloudflare
3. Cloudflare will provide two nameservers — update the nameservers at your domain registrar to point to Cloudflare
4. Wait for DNS propagation (can take up to 24 hours, usually much faster)
5. Verify the domain is active in the Cloudflare dashboard
6. Re-create any existing DNS records (e.g., Squarespace site records) in Cloudflare

### Cloudflare Tunnel Setup (one-time)
1. Install `cloudflared` on the admin's machine: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Authenticate: `cloudflared tunnel login` (opens browser to authorize)
3. Create the tunnel: `cloudflared tunnel create kgolfdraft`
4. Route DNS to the tunnel: `cloudflared tunnel route dns kgolfdraft draft-api.ahsdesigns.com`
5. Create a config file at `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: kgolfdraft
   credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: draft-api.ahsdesigns.com
       service: http://localhost:3001
     - service: http_status:404
   ```

### Vercel Deployment (Frontend)
1. Connect the repository to Vercel
2. Set the custom domain to `golfdraft.ahsdesigns.com`
3. In Cloudflare DNS, add a CNAME record: `golfdraft` → `cname.vercel-dns.com` (set to DNS-only / gray cloud, not proxied)
4. Set environment variable in Vercel: `NEXT_PUBLIC_BACKEND_URL=https://draft-api.ahsdesigns.com`

### Backend (Admin's Computer)
1. Install Node.js (v18+)
2. Create `backend/.env` (see `backend/.env.example`) with:
   - `DATABASE_URL` — Neon connection string
   - `SUPER_ADMIN_PIN` — PIN the super-admin enters at login (super-admin login is disabled if unset)
   - `SUPER_ADMIN_EMAIL` — optional, defaults to `ahsohn@gmail.com`
   - `PORT=3001`
3. Run the server: `npm start`
4. Start the Cloudflare Tunnel: `cloudflared tunnel run kgolfdraft`
5. The backend is now accessible at `https://draft-api.ahsdesigns.com`

## Development Commands

```bash
# Frontend (Next.js)
cd frontend
npm install
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run lint         # Lint code

# Backend (Node.js)
cd backend
npm install
npm start            # Start server on localhost:3001
npm run dev          # Start with hot reload (nodemon)
npm test             # Run draft state machine tests (node --test, db stubbed)
```

For local development, create a `.env` file in `backend/` (see `backend/.env.example`) and a `.env.local` file in `frontend/` with `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`.

## Project Structure

```
KGolfDraft/
├── frontend/                     # Next.js application (TypeScript)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── page.tsx          # Login page (email + super-admin PIN)
│   │   │   ├── globals.css       # Tailwind CSS imports
│   │   │   ├── draft/
│   │   │   │   └── page.tsx      # Main draft page
│   │   │   └── super-admin/
│   │   │       └── page.tsx      # Super Admin panel (drafts, players, users)
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx    # Admin controls (start draft, manage users, undo, CSV)
│   │   │   ├── Chat.tsx          # Real-time chat
│   │   │   ├── DraftBoard.tsx    # Grid showing all picks by round
│   │   │   ├── MyTeam.tsx        # Current user's drafted team
│   │   │   └── PlayerList.tsx    # Available golfers to pick
│   │   └── lib/
│   │       ├── socket.ts         # Socket.IO client singleton
│   │       ├── themes.ts         # Golf / World Cup theme configs
│   │       └── types.ts          # Shared TypeScript types
│   ├── .env.example
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json
├── backend/                      # Node.js + Socket.IO server
│   ├── server.js                 # Entry point — Express, Socket.IO, event handlers, CSV export
│   ├── db.js                     # Neon Postgres data layer (schema + queries)
│   ├── draft.js                  # Draft state machine (snake order, auto-draft, undo)
│   ├── test/
│   │   └── draft.test.js         # State machine tests (db module stubbed)
│   ├── .env.example
│   └── package.json
├── .gitignore
└── CLAUDE.md                     # This file — project documentation
```

## Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `login` | `{ email, pin?, token? }` | Authenticate with email or session token. Super-admin logins get `{ requiresPin: true }` back until the correct `pin` is supplied |
| `start-draft` | `{ totalRounds, draftFormat }` | Admin starts the current draft (`draftFormat`: `"snake"` or `"thirdRoundReversal"`) |
| `make-pick` | `{ golferName }` | Current picker selects a golfer |
| `admin-pick` | `{ userEmail, golferName }` | Admin picks on behalf of a user |
| `toggle-auto-draft` | `{ enabled }` | Toggle self auto-draft |
| `admin-toggle-auto-draft` | `{ userEmail, enabled }` | Admin toggles auto-draft for any user |
| `chat-message` | `{ text }` | Send a chat message |

### Client → Server (super-admin only, `sa-` prefix)
| Event | Payload | Description |
|-------|---------|-------------|
| `sa-get-overview` | `{}` | Returns all group users and all drafts |
| `sa-save-user` | `{ id?, email, name, isAdmin }` | Add or update a group user |
| `sa-delete-user` | `{ id }` | Remove a group user (super-admin row cannot be deleted) |
| `sa-create-draft` | `{ name, theme, draftFormat, totalRounds }` | Create a new draft (status `waiting`) |
| `sa-update-draft` | `{ id, name, theme, draftFormat, totalRounds }` | Edit settings of a `waiting` draft |
| `sa-delete-draft` | `{ id }` | Delete a draft (blocked for the current active draft) |
| `sa-set-current-draft` | `{ id }` | Make a draft the one shown on `/draft` |
| `sa-get-draft-detail` | `{ id }` | Returns draft, players, participants, picks |
| `sa-set-players` | `{ draftId, players: [{name, rank}] }` | Replace a draft's player list (blocked once picks exist) |
| `sa-set-participants` | `{ draftId, participants: [{email, draftOrder}] }` | Set who competes and their order (blocked once started) |
| `sa-undo-pick` | `{}` | Undo the most recent pick of the current draft |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `draft-started` | `DraftState` | Draft has begun |
| `pick-made` | `{ pick, draftState }` | A pick was made |
| `draft-complete` | `DraftState` | All rounds finished |
| `draft-state` | `{ draftState, chatHistory? }` | Full state push (current-draft switch, undo, config change) |
| `chat-message` | `ChatMessage` | New chat message |
| `auto-draft-updated` | `{ email, enabled }` | Auto-draft status changed |
| `user-online` | `{ email, name, onlineUsers }` | User connected |
| `user-offline` | `{ email, name, onlineUsers }` | User disconnected |

### HTTP Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Status, current draft status/theme/name |
| `GET /api/drafts/:id/export.csv?token=...` | Download a draft's results as CSV (requires an admin or super-admin session token) |
