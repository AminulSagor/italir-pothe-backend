# Leaderboard API & Frontend Implementation Guide (User-facing)

Last updated: 2026-06-24

## Overview

This document covers only the user-facing (non-admin) Leaderboard APIs, response shapes, available filters, and guidance for frontend implementation.

All endpoints require JWT authentication. Include `Authorization: Bearer <token>`.

## Table of contents

- Endpoints (learner)
- Query params / filters
- Response shapes (TypeScript)
- Frontend implementation guide
- Examples (fetch/axios)
- UX notes and testing suggestions
- Where to find server code

---

## Endpoints (learner)

These endpoints are for authenticated learners.

### GET /leaderboard

- Auth: required
- Query parameters: `scope` | `page` | `limit` | `search`
- Description: Returns leaderboard view for the authenticated user. Supports global or league-scoped views, search, and pagination.

Example request:

```
GET /leaderboard?scope=my_league&page=1&limit=20&search=alice
Authorization: Bearer <token>
```

Example response (200):

```json
{
  "scope": "my_league",
  "currentUser": { /* profile + league + zone + xpBoost */ },
  "podium": [ /* top 3 ranked entries */ ],
  "milestone": { /* progress toward next league */ },
  "entries": [ /* paged ranked entries */ ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Fields of interest for each entry:
- `userId, displayName, username, avatarUrl, totalXp, streakDays`
- `league` (see league shape below)
- `isCurrentUser, canChat`
- `rank` (integer)

### GET /leaderboard/me

- Auth: required
- Returns the authenticated user's leaderboard profile including `milestone` and `xpBoost`.

### GET /leaderboard/leagues

- Auth: required
- Returns league definitions and promotion/demotion rules. Useful for rendering league badges and progress bars.

### GET /leaderboard/scoring-guide

- Auth: required
- Returns a human-readable scoring guide (base points, streak bonuses, mastery, speed bonuses) to display tips or help sections.

### GET /leaderboard/promotions/pending

- Auth: required
- Returns pending promotion event (if any) for the user with benefit details and remaining seconds.

### POST /leaderboard/promotions/:promotionId/acknowledge

- Auth: required
- Acknowledge a promotion. Body: none. Response: `{ message, promotionId, isAcknowledged }`.

### GET /leaderboard/users/:userId/preview

- Auth: required
- Lightweight preview for profile cards. Includes `userId, displayName, username, avatarUrl, streakDays, totalXp, league, isCurrentUser, canChat, chatTargetUserId`.

---

## Query params / filters (full guide)

- `scope` (string): `my_league` (default) | `global`
- `page` (integer): 1-based page, default `1`
- `limit` (integer): items per page, default `20`, max `100`
- `search` (string): case-insensitive partial search against `displayName` and `username` (trimmed)

Validation rules (mirror on frontend):
- `page` and `limit` must be integers >= 1
- `limit` <= 100
- `search` max length 160

---

## Response shapes (TypeScript)

Copy these into your frontend types file and adjust names as needed.

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

Recommended structure and patterns for a maintainable UI.

1) State model

- `LeaderboardPageState`:
  - `scope` (`'my_league'|'global'`)
  - `page`, `limit`
  - `searchTerm`
  - `loading`, `error`
  - `currentUser`, `podium`, `entries`, `meta`

2) Component suggestions

- `LeaderboardPage` — container that fetches data and manages state
- `LeagueSelector` — toggles scope
- `Podium` — top 3 display
- `LeaderboardList` — paginated list of `LeaderboardRow`
- `LeaderboardRow` — shows rank, avatar, name, xp, streak, league tag
- `UserCard` — current user's card with milestone and xp progress
- `PromotionModal` — shows pending promotion

3) Interaction notes

- Debounce search input (300–500ms) when calling `/leaderboard?search=`.
- Use `page` and `limit` from `meta` to render pagination or infinite scroll.
- On promotions: call `GET /leaderboard/promotions/pending` and show `PromotionModal` when present. Acknowledge via `POST /leaderboard/promotions/:id/acknowledge`, then refresh `GET /leaderboard` and `GET /leaderboard/me`.

4) Error handling

- 401: prompt re-authentication
- 4xx: show friendly validation errors
- 5xx: show retry option and a brief message; consider exponential backoff for retries

---

## Examples (fetch + axios)

Fetch leaderboard (fetch):

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

## UX notes & testing

- Show the Podium prominently and highlight the current user.
- Display `zoneLabel` and `topPercent` for the current user in the UserCard.
- Test concurrency by simulating simultaneous XP awards and ensure UI updates (polling or websockets).
- Accessibility: ensure elements are screen-reader friendly; include keyboard navigation for pagination and search.

---

## Where to find server code

- Module wiring: [src/module-2/leaderboard/leaderboard.module.ts](src/module-2/leaderboard/leaderboard.module.ts)
- Controller (learner): [src/module-2/leaderboard/controllers/leaderboard.controller.ts](src/module-2/leaderboard/controllers/leaderboard.controller.ts)
- Main service: [src/module-2/leaderboard/services/leaderboard.service.ts](src/module-2/leaderboard/services/leaderboard.service.ts)
- XP & promotions: [src/module-2/leaderboard/services/leaderboard-xp.service.ts](src/module-2/leaderboard/services/leaderboard-xp.service.ts)
- League config: [src/module-2/leaderboard/services/league-config.service.ts](src/module-2/leaderboard/services/league-config.service.ts)
- Profile service: [src/module-2/leaderboard/services/leaderboard-profile.service.ts](src/module-2/leaderboard/services/leaderboard-profile.service.ts)

---

File location: [docs/leaderboard.md](docs/leaderboard.md)
