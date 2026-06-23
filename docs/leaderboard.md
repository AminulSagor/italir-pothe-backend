# Leaderboard API & Frontend Implementation Guide

Last updated: 2026-06-24

## Overview

This document describes the Leaderboard module API, response shapes, available filters, and guidance for implementing a production-ready frontend UI. It covers learner-facing endpoints, admin endpoints, filters, sample requests, and TypeScript interfaces you can reuse in the frontend.

Base paths used in examples below:
- Learner APIs: `GET /leaderboard` and related routes
- Admin APIs: `GET /admin/leaderboard` and related routes

All endpoints (except public assets) are protected by JWT. Include `Authorization: Bearer <token>`.

## Table of contents

- Endpoints (learner)
- Endpoints (admin)
- Query params / filters
- Response shapes (TS interfaces)
- Frontend implementation guide
- Examples (fetch/axios)
- Admin: CSV export & rewards
- UX notes and testing suggestions

---

## Endpoints (learner)

### GET /leaderboard

- Auth: required (JWT)
- Query parameters: `scope` | `page` | `limit` | `search`
- Description: Returns leaderboard view for the authenticated user. Supports global or league-scoped views, search, pagination.

Example request:

```
GET /leaderboard?scope=my_league&page=1&limit=20&search=alice
Authorization: Bearer <token>
```

Example response (200):

```json
{
  "scope": "my_league",
  "currentUser": {
    "userId": "uuid",
    "displayName": "Alice",
    "username": "alice",
    "avatarUrl": null,
    "totalXp": 12345,
    "streakDays": 5,
    "league": {
      "key": "gold",
      "name": "Gold League",
      "minXp": 5000,
      "maxXp": 9999,
      "rangeLabel": "5,000–9,999 XP",
      "iconKey": "gold_star",
      "themeKey": "gold",
      "sortOrder": 3,
      "benefit": { "type": "xp_boost", "multiplier": 2, "durationHours": 48, "durationDays": 2 }
    },
    "isCurrentUser": true,
    "canChat": false,
    "scopeRank": 4,
    "globalRank": 120,
    "leagueRank": 4,
    "leagueParticipantCount": 1500,
    "topPercent": 1,
    "zone": "promotion",
    "zoneLabel": "Promotion Zone",
    "xpBoost": { "multiplier": 2, "expiresAt": "2026-06-25T12:34:56.789Z", "remainingSeconds": 86400 }
  },
  "podium": [ /* top 3 entries: same shape as entries plus rank */ ],
  "milestone": {
    "currentLeague": { /* league response */ },
    "nextLeague": { /* league response or null */ },
    "currentXp": 12345,
    "targetXp": 20000,
    "xpRemaining": 7655,
    "progressPercentage": 38,
    "message": "Earn 7,655 more XP to reach Diamond League!"
  },
  "entries": [ /* array of entries (ranked) */ ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Each `entry` in `podium` and `entries` has:
- `userId, displayName, username, avatarUrl, totalXp, streakDays`
- `league` (see league shape below)
- `isCurrentUser, canChat`
- `rank` (integer)

### GET /leaderboard/me

- Auth: required
- Returns the authenticated user's `LeaderboardProfile` with `milestone` and `xpBoost`.

Example response (200):

```json
{
  "userId": "uuid",
  "displayName": "Alice",
  "username": "alice",
  "avatarUrl": null,
  "totalXp": 12345,
  "streakDays": 5,
  "league": { /* league response */ },
  "milestone": { /* milestone object as above */ },
  "xpBoost": null
}
```

### GET /leaderboard/leagues

- Auth: required
- Returns league definitions, rules for promotion/demotion, and high-level notes on ways to earn XP.

### GET /leaderboard/scoring-guide

- Auth: required
- Returns a human readable scoring guide (base points, streak bonuses, mastery, speed bonuses).

### GET /leaderboard/promotions/pending

- Auth: required
- Returns pending promotion event (if any) for the user with benefit details and remaining seconds.

### POST /leaderboard/promotions/:promotionId/acknowledge

- Auth: required
- Acknowledge a promotion. Body: none. Response: { message, promotionId, isAcknowledged }

### GET /leaderboard/users/:userId/preview

- Auth: required
- Lightweight preview for profile cards. Includes `userId, displayName, username, avatarUrl, streakDays, totalXp, league, isCurrentUser, canChat, chatTargetUserId`.

---

## Endpoints (admin)

> All admin routes require `ADMIN` role and JWT.

### GET /admin/leaderboard

- Query: `page`, `limit`, `search`, `league`, `sortBy` (`rank|totalXp|displayName`), `sortOrder` (`ASC|DESC`).
- Returns `leagueCards`, `globalTopTen`, `items` (paged list) and `meta`.

### GET /admin/leaderboard/export

- Returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="leaderboard.csv"`.

### POST /admin/leaderboard/users/:userId/rewards

- Body (CreateLeaderboardRewardDto):
  - `rewardType` (enum: `physical_gift | badge | xp`)
  - `title` (string)
  - `description` (optional)
  - `rewardValue` (optional)
  - `xpAmount` (required if `rewardType` is `xp`)

- Response: `{ message, reward, xpResult }` where `xpResult` may contain the `scoring` and `leaderboard` results when XP is awarded.

### GET /admin/leaderboard/rewards

- Filters: `page`, `limit`, `status`, `rewardType`.

### PATCH /admin/leaderboard/rewards/:rewardId/status

- Body: `{ status: 'pending' | 'approved' | 'dispatched' | 'delivered' | 'cancelled' }`

---

## Query params / filters (full guide)

- `scope` (string): `my_league` (default) | `global` — controls the selection between league-scoped or global leaderboard.
- `page` (integer): 1-based page, default `1`.
- `limit` (integer): items per page, default `20`, max `100`.
- `search` (string): case-insensitive partial search against `displayName` and `username` (trimmed).
- `league` (admin only): `bronze|silver|gold|diamond` (use `LeagueKey` enum).
- `sortBy` (admin only): `rank | totalXp | displayName`.
- `sortOrder` (admin only): `ASC | DESC`.

Validation rules on server side (frontend must mirror):
- `page` and `limit` coerced to numbers, must be integers >= 1.
- `limit` <= 100.
- `search` max length 160.

---

## Response shapes (TypeScript interfaces)

Copy these into your frontend types file and adjust naming if needed.

```ts
type League = {
  key: 'bronze'|'silver'|'gold'|'diamond';
  name: string;
  minXp: number;
  maxXp: number | null;
  rangeLabel: string;
  iconKey: string;
  themeKey: string;
  sortOrder: number;
  benefit: null | { type: 'xp_boost'; multiplier: number; durationHours: number; durationDays: number };
};

type Profile = {
  userId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  totalXp: number;
  streakDays: number;
  league: League;
  isCurrentUser: boolean;
  canChat: boolean;
};

type RankedProfile = Profile & { rank: number };

type XpBoost = { multiplier: number; expiresAt: string; remainingSeconds: number } | null;

type LeaderboardResponse = {
  scope: string;
  currentUser: Profile & {
    scopeRank?: number | null;
    globalRank?: number | null;
    leagueRank?: number | null;
    leagueParticipantCount: number;
    topPercent?: number | null;
    zone?: 'promotion' | 'safe' | 'demotion';
    zoneLabel?: string;
    xpBoost?: XpBoost;
  };
  podium: RankedProfile[];
  milestone: Record<string, unknown>;
  entries: RankedProfile[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
```

---

## Frontend implementation guide

This section provides recommended data flow, components and sample fetch functions for a production frontend.

1) Data model & state

- `LeaderboardPageState`:
  - `scope` (`'my_league'|'global'`)
  - `page`, `limit`
  - `searchTerm`
  - `loading`, `error`
  - `currentUser`, `podium`, `entries`, `meta`

2) Component structure (suggested)

- `LeaderboardPage` — container: fetches data, holds state
- `LeagueSelector` — toggles scope or allows picking a league (for admin)
- `Podium` — render top 3 with special styles
- `LeaderboardList` — paginated list of `LeaderboardRow`
- `LeaderboardRow` — single entry UI (rank, avatar, name, xp, streak, league tag)
- `UserCard` — current user's card (milestone, xpProgress, zone badge)
- `PromotionModal` — shows pending promotion with acknowledge action

3) UI mapping notes

- `LeaderboardRow` props example:
  - `rank`, `displayName`, `username`, `avatarUrl`, `totalXp`, `streakDays`, `league`, `isCurrentUser`, `canChat`

- Display text suggestions:
  - Subtitle: `${entry.league.name} • ${entry.totalXp.toLocaleString()} XP • ${entry.streakDays}d`.
  - For the current user show `zoneLabel` and `topPercent` prominently.

4) Search & debounce

- Debounce input (300–500ms) before calling `/leaderboard?search=...`.
- Use `encodeURIComponent` and avoid requests for empty/whitespace-only queries (unless user clears search).

5) Pagination

- Use `page` and `limit` params and the `meta` block to render page numbers or an infinite scroll trigger.

6) Promotions (UX)

- Call `GET /leaderboard/promotions/pending` on page load to display any promotion modal.
- On user click `Acknowledge`, POST to `/leaderboard/promotions/:id/acknowledge`, then refresh `/leaderboard` and `/leaderboard/me`.

7) Acknowledgement flow (example):

```ts
async function acknowledgePromotion(promotionId: string, token: string) {
  const res = await fetch(`/leaderboard/promotions/${promotionId}/acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

8) Download CSV (admin)

```ts
async function downloadLeaderboardCsv(query: string, token: string) {
  const res = await fetch(`/admin/leaderboard/export?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leaderboard.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

9) Creating a reward (admin UI)

Client-side validation: if `rewardType === 'xp'` ensure `xpAmount` is integer >= 1 before submitting.

```ts
async function createReward(userId: string, dto: any, token: string) {
  const res = await fetch(`/admin/leaderboard/users/${userId}/rewards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

10) Error handling & retries

- Show friendly messages for 4xx errors; for 401 prompt re-login.
- For intermittent 5xx, consider exponential backoff and a toast message.

---

## Examples (fetch + axios)

Basic leaderboard fetch (JS/TS, fetch):

```ts
async function fetchLeaderboard({ scope = 'my_league', page = 1, limit = 20, search = '' }, token) {
  const params = new URLSearchParams();
  if (scope) params.append('scope', scope);
  params.append('page', String(page));
  params.append('limit', String(limit));
  if (search) params.append('search', search);

  const res = await fetch(`/leaderboard?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Axios example:

```ts
import axios from 'axios';

const api = axios.create({ baseURL: process.env.API_BASE_URL });

async function fetchLeaderboardAxios(opts, token) {
  const res = await api.get('/leaderboard', { params: opts, headers: { Authorization: `Bearer ${token}` } });
  return res.data; 
}
```

---

## Admin: reward history & status changes

- Use `GET /admin/leaderboard/rewards` with filters to display a paged table.
- Use `PATCH /admin/leaderboard/rewards/:id/status` to update reward lifecycle.

---

## UX notes & testing

- Show the Podium prominently with 1/2/3 trophies.
- Highlight the current user card with promotion/demotion badges and `xpBoost` countdown.
- Test concurrency by simulating simultaneous XP awards and ensure the UI reflects new totals after polling or websocket notification.
- Accessibility: ensure rank numbers, names and XP are readable by screen readers; provide skip-to-filter controls.

---

## Where to find server code (references)

- Module wiring: [src/module-2/leaderboard/leaderboard.module.ts](src/module-2/leaderboard/leaderboard.module.ts)
- Controller (learner): [src/module-2/leaderboard/controllers/leaderboard.controller.ts](src/module-2/leaderboard/controllers/leaderboard.controller.ts)
- Controller (admin): [src/module-2/leaderboard/controllers/admin-leaderboard.controller.ts](src/module-2/leaderboard/controllers/admin-leaderboard.controller.ts)
- Main service logic: [src/module-2/leaderboard/services/leaderboard.service.ts](src/module-2/leaderboard/services/leaderboard.service.ts)
- XP & promotions: [src/module-2/leaderboard/services/leaderboard-xp.service.ts](src/module-2/leaderboard/services/leaderboard-xp.service.ts)
- League config: [src/module-2/leaderboard/services/league-config.service.ts](src/module-2/leaderboard/services/league-config.service.ts)

---

If you want, I can:

- commit this file to the repository and push it (I will),
- open a PR from `sifat` → `main` with this doc included, or
- generate a concise frontend component scaffold (React + TypeScript) wired to these endpoints.

Requested file location: [docs/leaderboard.md](docs/leaderboard.md)
