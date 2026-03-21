<p align="center">
  <strong>Honorbot PBZ</strong>
</p>
<p align="center">
  <em>Main Honor Points Discord bot for the Phantom Blade Zero community.</em>
</p>
<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js" alt="Node" /></a>
  <a href="https://discord.js.org"><img src="https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord" alt="Discord.js" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript" /></a>
  <img src="https://img.shields.io/badge/license-ISC-green" alt="License" />
  <img src="https://img.shields.io/badge/Phantom%20Blade%20Zero-PBZ%20Ecosystem-8b0000" alt="PBZ" />
</p>

---

Button-based interactions: daily check-in, leaderboard, gambling, status log, and admin backup. All regular user interaction uses **persistent buttons** in dedicated channels; slash commands are admin-only.

## 📋 Overview

| | |
|---|---|
| **Part of** | Phantom Blade Zero (PBZ) — Discord bot ecosystem |
| **Role** | Primary user-facing Honor Points bot |
| **Stack** | TypeScript, Discord.js v14, Express.js (admin dashboard), MongoDB |

---

## ✨ Features

### User (buttons)

| Channel | Feature |
|---------|---------|
| Daily check-in | Claim 1–10 random honor points once per day |
| Profile | View points, rank, stats |
| Tasks / Status | Check daily quota and cooldown |
| Coin flip | Gamble 1–5 points (max 5 plays/day) |
| Lucky draw | Optional; 60% +5 / 40% −5; needs 5 HP min |
| Leaderboard | Auto-updated every 24h at midnight UTC |
| Status log | Real-time point distribution with action source |

### Automatic

- **Message points** — 1 point per message, once per day (silent, no reaction spam).
- **Monthly snapshot** — On the 1st, export leaderboard JSON to backup channel.

### Admin

- `/backup export` — Export DB to channel or DM.
- `/backup import <file>` — Restore from JSON.
- **Web dashboard** — `http://localhost:3000` (HTTP Basic Auth): view/edit users, leaderboard top 50.

---

## 🚀 Quick Start

```bash
cp .env.example .env   # Set DISCORD_*, MONGO_URI, all channel IDs, WEB_PASS
npm install && npm run build
npm run deploy          # Register slash commands
npm start
```

**Docker (with honor-points-service):**

```bash
# Start honor-points-service first, then:
docker compose up -d
docker compose exec app npm run deploy
```

---

## ⚙️ Environment

| Variable | Required | Description |
|----------|----------|--------------|
| `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` | Yes | Discord app |
| `MONGO_URI` | Yes | e.g. `mongodb://mongodb:27017/honorbot` |
| `DAILYCHECKING_CHANNEL_ID` … `LEADERBOARD_CHANNEL_ID` | Yes | Button channels |
| `STATUS_CHANNEL_ID` | Yes | Status log channel |
| `WEB_USER`, `WEB_PASS` | No | Dashboard auth (default admin) |
| `LUCKYDRAW_CHANNEL_ID` | No | Set to enable lucky draw |
| `BACKUP_DATABASE_CHANNEL_ID` | No | For export + scheduled backup |

See in-repo docs for full list and optional flags.

---

## 📁 Project Structure

```
honorbot-pbz/
├── src/
│   ├── commands/       # Slash (admin)
│   ├── events/         # Buttons, message points
│   ├── services/       # StatusLog, Leaderboard, Backup
│   └── dashboard/      # Web admin
├── Dockerfile
└── docker-compose.yml
```

---

## 🔗 Ecosystem

**Shadow Duel** ([`wuxia-bobozan`](../wuxia-bobozan)) uses the same MongoDB / Honor API for optional duel rewards; ladder honor totals there are separate from the main Honorbot UX unless synced by design. Full map: [`docs/README.md`](../docs/README.md).

---

## 📄 License

ISC · Part of the **Phantom Blade Zero** community ecosystem.
