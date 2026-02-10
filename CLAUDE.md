# KGolfDraft — Golf Snake Draft Web Application

## Project Overview

A real-time golf snake draft web application with integrated chat for a group of up to 16 friends. The app is used occasionally when a draft event is held — it is not a persistent service. An admin sets up a Google Sheet with player data and user info, starts the backend on their local machine, and participants join via the web to draft golfers in snake order.

## Tech Stack

- **Frontend**: Next.js (React), deployed to Vercel at `golfdraft.ahsdesigns.com`
- **Backend**: Node.js with Socket.IO for real-time WebSocket communication, runs locally on the admin's machine and is exposed via Cloudflare Tunnel at `draft-api.ahsdesigns.com`
- **Data Layer**: Google Sheets API with a Google Service Account for authentication
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
                                                        Google Sheets API
                                                                 │
                                                       ┌─────────▼─────────┐
                                                       │  Google Sheet     │
                                                       │  (Players,        │
                                                       │   Users, Picks)   │
                                                       └───────────────────┘
```

- The **frontend** on Vercel connects to the backend via Socket.IO WebSocket through Cloudflare Tunnel.
- The **backend** manages all draft state, chat, auto-draft logic, and reads/writes Google Sheets.
- The **backend URL** is stable: `https://draft-api.ahsdesigns.com` — the same URL works every draft session. The `cloudflared` daemon on the admin's machine routes traffic from Cloudflare to the local Node.js server.

## Google Sheets Structure

The admin creates a Google Sheet with three sheets (tabs):

### Players Sheet
| Column | Description |
|--------|-------------|
| Name   | Golfer's name |
| Rank   | Golfer's ranking/seed (used for auto-draft ordering) |

### Users Sheet
| Column      | Description |
|-------------|-------------|
| Email       | User's email address (used for login) |
| Name        | Display name |
| Draft Order | Position in the draft (1 through N) |
| Is Admin    | TRUE/FALSE — whether this user has admin privileges |

### Picks Sheet (populated during the draft)
| Column      | Description |
|-------------|-------------|
| Round       | Round number |
| Pick Number | Overall pick number |
| User Email  | Email of the user who made the pick |
| User Name   | Display name of the user |
| Golfer Name | Name of the golfer selected |

### Chat Log Sheet (auto-created when draft completes)
| Column    | Description |
|-----------|-------------|
| Timestamp | Date/time of the message |
| Sender    | User name or "System" |
| Message   | Message text |
| Type      | "system" (pick announcements, joins) or "user" (chat) |

## Authentication

- **Email-only login** — no passwords required
- Users enter their email address; the backend validates it against the Users sheet
- If the email is found, the user is logged in and identified by their name and admin status
- Session is managed via a simple token stored in the browser

## Draft Mechanics

### Snake Draft Order
- Odd rounds: pick order goes 1 → N (ascending by draft order)
- Even rounds: pick order goes N → 1 (descending — the "snake" reversal)
- Draft order position (1 through N) is set per user in the Google Sheet
- The app handles the snake reversal automatically

### Draft Flow
1. Admin configures the Google Sheet ID and starts the backend server
2. Users log in with their email
3. Admin starts the draft when enough players are present (quorum)
4. Each user picks a golfer when it's their turn
5. Picks are recorded to the Picks sheet and announced in chat
6. Draft continues for 7–10 rounds (configurable, determined by admin)

### Pick Rules
- **No time limit** on individual picks
- **Admin override**: Admins can make a pick on behalf of any user who is taking too long
- **Auto-draft**: Users can toggle auto-draft for themselves, which automatically picks the highest-ranked remaining golfer when it's their turn
- **Non-logged-in users** are NOT set to auto-draft by default
- **Admin auto-draft control**: Admins can toggle auto-draft on/off for any user, whether that user is logged in or not

## Chat

- Real-time chat via Socket.IO, visible to all logged-in users
- Draft picks are automatically posted as system messages in the chat (e.g., "Alice picked Tiger Woods with pick #5")
- Standard text chat between participants

## Post-Draft

- Display a summary page showing each participant's drafted team
- Final results are saved/exported to the Google Sheet (Picks sheet)

## Deployment & Setup

### Google Cloud Setup
1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a Service Account and download the JSON key file
4. Share the Google Sheet with the service account email (Editor access)

### Google Sheet Setup
1. Create a new Google Sheet
2. Add three tabs: `Players`, `Users`, `Picks`
3. Populate the `Players` tab with golfer names and rankings
4. Populate the `Users` tab with participant emails, names, draft order, and admin flags
5. Leave the `Picks` tab empty (headers only) — it will be filled during the draft

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
2. Place the Google Service Account JSON key file in the backend directory
3. Set environment variables: `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `PORT=3001`
4. Run the server: `npm start`
5. Start the Cloudflare Tunnel: `cloudflared tunnel run kgolfdraft`
6. The backend is now accessible at `https://draft-api.ahsdesigns.com`

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
```

For local development, create a `.env` file in `backend/` (see `backend/.env.example`) and a `.env.local` file in `frontend/` with `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`.

## Project Structure

```
KGolfDraft/
├── frontend/                     # Next.js application (TypeScript)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── page.tsx          # Login page
│   │   │   ├── globals.css       # Tailwind CSS imports
│   │   │   └── draft/
│   │   │       └── page.tsx      # Main draft page
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx    # Admin controls (start draft, manage users)
│   │   │   ├── Chat.tsx          # Real-time chat
│   │   │   ├── DraftBoard.tsx    # Grid showing all picks by round
│   │   │   ├── MyTeam.tsx        # Current user's drafted team
│   │   │   └── PlayerList.tsx    # Available golfers to pick
│   │   └── lib/
│   │       ├── socket.ts         # Socket.IO client singleton
│   │       └── types.ts          # Shared TypeScript types
│   ├── .env.example
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json
├── backend/                      # Node.js + Socket.IO server
│   ├── server.js                 # Entry point — Express, Socket.IO, event handlers
│   ├── sheets.js                 # Google Sheets API read/write
│   ├── draft.js                  # Draft state machine (snake order, auto-draft)
│   ├── .env.example
│   └── package.json
├── .gitignore
└── CLAUDE.md                     # This file — project documentation
```

## Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `login` | `{ email, token }` | Authenticate with email or session token |
| `start-draft` | `{ totalRounds }` | Admin starts the draft |
| `make-pick` | `{ golferName }` | Current picker selects a golfer |
| `admin-pick` | `{ userEmail, golferName }` | Admin picks on behalf of a user |
| `toggle-auto-draft` | `{ enabled }` | Toggle self auto-draft |
| `admin-toggle-auto-draft` | `{ userEmail, enabled }` | Admin toggles auto-draft for any user |
| `chat-message` | `{ text }` | Send a chat message |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `draft-started` | `DraftState` | Draft has begun |
| `pick-made` | `{ pick, draftState }` | A pick was made |
| `draft-complete` | `DraftState` | All rounds finished |
| `chat-message` | `ChatMessage` | New chat message |
| `auto-draft-updated` | `{ email, enabled }` | Auto-draft status changed |
| `user-online` | `{ email, name, onlineUsers }` | User connected |
| `user-offline` | `{ email, name, onlineUsers }` | User disconnected |
