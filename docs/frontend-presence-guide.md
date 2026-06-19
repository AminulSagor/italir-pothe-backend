# Frontend Presence & Persistent Socket Guide

This guide explains how to implement presence (online/offline) and a single persistent socket connection from the frontend so the app shows accurate presence and joins conversation rooms over one connection.

Target audience: frontend engineers building a SPA (React / Vue / Angular) or mobile web app that connects to this backend's `/chat` Socket.IO namespace.

---

**Overview**

- The backend exposes a Socket.IO namespace at `/chat` and supports the following socket events relevant to presence:
  - `presence:heartbeat` (client → server) — refresh presence TTL on the server
  - `user_presence_change` (server → clients) — broadcast when a user's online state changes
  - `join_conversation` / `leave_conversation` (client → server) — join conversation rooms

- The server marks a user online when a valid socket connects and updates `user_presence` with an `onlineUntil` TTL window. Heartbeats extend that TTL.

---

**Goals**

- Use one persistent socket connection per app instance (one browser tab or one mobile app instance).
- Reuse the same socket for joining multiple conversation rooms.
- Send periodic heartbeats while connected to keep presence fresh.
- Rejoin rooms and refresh presence after reconnects.
- Optionally coordinate across browser tabs to avoid duplicate sockets.

---

**Prerequisites**

- Backend running with the `ChatGateway` and `PresenceService` enabled (see [src/chat/chat.gateway.ts](src/chat/chat.gateway.ts)).
- JWT authentication available for users and a way to get the user's token in the frontend.
- Install `socket.io-client` in the frontend project.

```bash
npm install socket.io-client
```

---

**Quickstart (React example)**

Below are small, reusable building blocks you can copy into a React app. The same ideas apply to other frameworks.

1) SocketService (singleton)

Create a single module that owns the socket connection and exposes helper methods.

```ts
// src/services/socket.ts
import { io, Socket } from 'socket.io-client';

const SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private joinedConversations = new Set<string>();
  private heartbeatIntervalId: number | null = null;

  init(token: string) {
    if (this.socket) return this.socket;

    this.socket = io(`${SERVER}/chat`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      // immediately refresh presence
      this.socket!.emit('presence:heartbeat');
      // rejoin conversation rooms
      for (const id of this.joinedConversations) {
        this.socket!.emit('join_conversation', { conversationId: id });
      }
    });

    // periodic heartbeat to keep server TTL alive while connected
    this.heartbeatIntervalId = window.setInterval(() => {
      if (this.socket && this.socket.connected) this.socket.emit('presence:heartbeat');
    }, 30_000);

    return this.socket;
  }

  joinConversation(conversationId: string) {
    this.joinedConversations.add(conversationId);
    this.socket?.emit('join_conversation', { conversationId });
  }

  leaveConversation(conversationId: string) {
    this.joinedConversations.delete(conversationId);
    this.socket?.emit('leave_conversation', { conversationId });
  }

  destroy() {
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
```

2) Provide the socket via React Context

```tsx
// src/contexts/SocketProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { socketService } from '../services/socket';

const SocketContext = createContext<any>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const s = socketService.init(token);
    setSocket(s);

    return () => {
      socketService.destroy();
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
```

3) Use in a Chat component

```tsx
// src/components/Chat.tsx
import React, { useEffect } from 'react';
import { useSocket } from '../contexts/SocketProvider';

export default function Chat({ conversationId }: { conversationId: string }) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_conversation', { conversationId });

    const onMessage = (msg: any) => {
      // update UI
      console.log('message', msg);
    };

    socket.on('message', onMessage);

    return () => {
      socket.emit('leave_conversation', { conversationId });
      socket.off('message', onMessage);
    };
  }, [socket, conversationId]);

  return <div>{/* render messages */}</div>;
}
```

---

**Heartbeat and TTL**

- The backend `PresenceService` uses an `onlineUntil` window (server example uses 15 minutes by default). While the socket is connected, the client should emit `presence:heartbeat` every 20–60 seconds to refresh that TTL.
- If the socket disconnects, the server will set `onlineUntil` to now + window and the user will appear online for the TTL period (prevents flapping on brief disconnects).

Tips:
- Choose a heartbeat interval shorter than the server TTL (e.g., TTL = 15 min, heartbeat = 30s).
- Use the socket's `connect`/`reconnect` events to force an immediate heartbeat and rejoin rooms.

---

**Multi-tab coordination (optional)**

By default each browser tab has its own socket. This is acceptable for many apps. If you prefer a single socket for all tabs, coordinate via `BroadcastChannel` and elect a leader tab to hold the socket.

Simple pattern (leader tab):

1. Each tab opens a `BroadcastChannel('presence')` and announces a short `hello` message with a generated `tabId`.
2. The first tab to create a socket becomes the leader and publishes `leader` messages.
3. Non-leader tabs forward operations (e.g., join conversation) to the leader via BroadcastChannel messages; the leader executes them on the single socket and broadcasts results.

Example outline (not production-ready):

```ts
const bc = new BroadcastChannel('presence');
const tabId = Math.random().toString(36).slice(2);
let isLeader = false;

bc.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'leader:announce') {
    // there's a leader
  }
  if (msg.type === 'request:join' && isLeader) {
    socketService.joinConversation(msg.conversationId);
  }
};

// to request a join from non-leader
bc.postMessage({ type: 'request:join', conversationId });
```

Notes: leader-election requires robust edge-case handling (tab close, leader crash). Use an established library or keep the per-tab sockets approach unless strict single-socket behavior is required.

---

**Security**

- Always pass the JWT through the socket handshake `auth` field (do not embed long-lived tokens in query strings). Example:

```ts
const socket = io('/chat', { auth: { token: `Bearer ${token}` } });
```

- The backend verifies the token on connect and disconnects unauthorized clients. Ensure tokens are refreshed in the frontend and reinitialize the socket after token refresh.

---

**Reconnection & room rejoin**

- Use Socket.IO's built-in reconnect. On `reconnect` event, re-emit `presence:heartbeat` and rejoin any previously-open conversation rooms (the SocketService stores them in `joinedConversations`).
- If you store open conversation IDs in sessionStorage you can rejoin even after a full page reload.

---

**UI considerations**

- Only show `online` when the server indicates `isOnline=true` (the server value is authoritative).
- The server broadcasts `user_presence_change` events when a user goes online/offline; update the contact list UI when you receive those events.
- When offline, show `lastSeen` using `last_seen_at` from your presence query or the presence payload.
- Avoid updating presence UI too frequently; debounce UI updates when many presence events arrive.

Example presence indicator style:

```css
.presence-dot { width: 10px; height: 10px; border-radius: 50%; }
.presence-dot.online { background: #3ad55a; }
.presence-dot.offline { background: #bdbdbd; }
```

---

**Testing**

Manual test steps:

1. Start backend: `npm run start:dev` (see repo root).
2. Start frontend dev server and open app in a browser.
3. Log in and ensure `SocketProvider` initializes the socket. Inspect network to see websocket frames.
4. Open a second tab with the same user and confirm server shows multiple sockets (user remains online).
5. Close all tabs for a user and confirm the `user_presence_change` event marks offline after the TTL / server debounce.

You can also use the included Node example client at `examples/presence-client.js` to simulate a persistent connection from a machine.

---

**Scaling / Production**

- For multi-process or multi-host deployments, enable a Redis-based adapter for Socket.IO so rooms and socket presence are synchronized between server instances. Example server setup (Node):

```ts
// bootstrap code (main.ts / socket init)
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();
io.adapter(createAdapter(pubClient, subClient));
```

- Also consider storing ephemeral presence keys in Redis (e.g., `presence:{userId}` with EXPIRE) to make presence queries fast and independent from a single server's memory.

---

**Troubleshooting**

- If sockets never connect: check CORS in `main.ts`, ensure the frontend origin is allowed.
- If auth fails: verify token prefix `Bearer ` and token validity.
- If presence doesn't update: confirm `presence:heartbeat` events are emitted and the backend `PresenceService` logs heartbeats.
- If messages are not delivered to a user: make sure you're emitting to the user's personal room `user:{userId}` (server already exposes `sendToUser`).

---

**References**

- Server gateway: [src/chat/chat.gateway.ts](src/chat/chat.gateway.ts)
- Presence notes: [docs/presence.md](docs/presence.md)
- Node example client: [examples/presence-client.js](examples/presence-client.js)

---

If you want, I can:

- Add a small runnable frontend example (React) that logs in, connects, and shows presence indicators.
- Implement Redis-based presence and Socket.IO Redis adapter on the backend and wire up a presence query endpoint.
