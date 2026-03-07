# 🎮 BattleHide — Real-World Battle Royale

Real-world hide & seek, cops & robbers, infection, and full battle royale games for up to 25 people. No app install needed — works on any phone browser. Host creates a room, everyone joins with a 6-digit code.

---

## 🚀 Deploy to Railway (One-Time Setup — 10 Minutes)

### Step 1 — Create a GitHub Repository

1. Go to [github.com](https://github.com) and sign in (or create a free account).
2. Click **New Repository**.
3. Name it `battlehide`, set it to **Public**, and click **Create**.
4. On your computer, open a terminal/PowerShell in this project folder and run:

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/battlehide.git
git push -u origin main
```

*(Replace `YOUR_USERNAME` with your GitHub username)*

---

### Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) and click **Login with GitHub**.
2. Click **New Project → Deploy from GitHub repo**.
3. Select your `battlehide` repository.
4. Railway auto-detects the `railway.json` and starts building. Wait ~2 minutes.
5. Click **Settings → Networking → Generate Domain** to get a public URL like `https://battlehide-production.up.railway.app`.

That's it. **Your game is live forever.**

---

### Step 3 — Share With Friends

- Share the Railway URL in your group chat.
- You create a room → get a 6-digit code → share the code.
- Friends open the URL on their phones and enter the code.
- You hit **Start Game** when everyone's in.

---

## 🎮 How to Run Locally (For Development)

```bash
npm install --legacy-peer-deps
npm run dev:server    # starts the backend on :3001
# in a second terminal:
cd client
npm run dev           # starts frontend on :5173
```

Or to run the production build locally:

```bash
npm run build
npm start
# open http://localhost:3001
```

---

## 🕹️ Game Modes

| Mode | Description |
|------|-------------|
| 👁️ Hide & Seek | Classic. Seekers hunt hiders. |
| 🚔 Cops & Robbers | Robbers run to safety. Cops jail them. |
| 🦠 Infection | One infected must spread the disease. |
| 💀 Battle Royale | ALL mechanics enabled. Maximum chaos. |
| ⚙️ Custom | Build your own ruleset from scratch. |

---

## ⚙️ All 16 Mechanics

**Battle Royale Adaptations:**
- 📍 Shrinking Zone — Floors/sectors announced as dead zones with PA-style alert
- 📡 Location Pings — Seekers see hider sector for 10s every 5 mins (radar blip)
- 🔊 Audio Trap — Random loud ping plays on hider phones unpredictably
- 🎲 Lottery Draft — Cinematic random role reveal with siren and flash
- 🏢 Indoor Mode — NFC/QR tag checkpoints, floor-based zones
- 🌳 Outdoor Mode — GPS-based geofencing and capture radius

**Custom Features:**
- 🕵️ Traitor Mechanic — One hider secretly flips to seeker mid-game
- 📦 Supply Caches — Physical lockboxes with 3-digit codes → Jammer protection
- 🔓 Jailbreak Terminals — Hold a button 15s to free all jailed players
- 📢 Decoy Deployments — Drop Bluetooth speakers, trigger remotely
- ⭐ VIP Escort — Designated VIP can't run; protecting them scores big
- 🚨 Proximity Alarms — QR tags at key spots broadcast seeker position
- ⚡ Assassin Class — Third faction: tag the Alpha Seeker to reset everyone
- 🌑 Blackout Protocol — Alpha Seeker triggers 60s total darkness (one-time)
- 🎯 Bounty Contracts — Random hider targeted for bonus seeker points
- 😰 Paranoia Timer — Stay still too long and your screen goes bright white

---

## 📱 Physical Setup Guide

### Supply Caches
- Buy cheap combination lockboxes (Amazon, ~$8 each).
- Set the combination to the 3-digit code shown in the app before the game.
- Place them in visible but risky locations.
- Players redeem the code in the app to activate their Jammer.

### Proximity Alarms / NFC Tags / QR Checkpoints
- Print QR codes from any online generator (or use NFC tags).
- Post them in hallways, stairwells, or key areas.
- When a seeker scans one, it broadcasts their location to all hiders.

### Decoy Bluetooth Speakers
- Any cheap Bluetooth speaker works.
- Hiders drop one somewhere, then manually trigger audio from their phone.

### VIP Armband
- Grab any LED armband or blinking wristband from a dollar store.

### Zones / Floors
- Pre-label floors/areas as Zone 1-6 before the game.
- When the app announces a zone closing, referees (or the honor system) enforce it.

---

## 🏆 Scoring
- Hiders earn points per minute survived.
- Seekers earn points per player caught.
- Jailbreak earns a bonus for the rescuer.
- Bounty catches earn a big bonus.
- VIP survival earns a massive team bonus.

---

## 🛠️ Tech Stack
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** React + Vite + Framer Motion
- **Deployment:** Railway (auto-build from GitHub)
