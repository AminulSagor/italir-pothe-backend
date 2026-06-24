# Presence / Persistent Socket

This project already includes server-side support for user presence via the chat gateway and a `PresenceService`.

Key points:
- The `ChatGateway` authenticates sockets using the JWT token passed in the handshake (`auth.token` or query/header).
- When a socket connects the backend marks the user as online and updates `user_presence` table (with an `onlineUntil` TTL window).
- A socket event `presence:heartbeat` is supported to refresh the user's presence TTL without calling an HTTP endpoint.
- Use a single persistent socket connection across your frontend app and reuse it for joining conversation rooms.

Browser / Frontend (short example):

1. Create one global socket instance (e.g. in an app-level provider or React context) and reuse it.

```js
import { io } from 'socket.io-client';

const socket = io('https://api.example.com/chat', {
  auth: { token: `Bearer ${YOUR_JWT}` },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('presence:heartbeat');
});

// rejoin rooms after reconnect
socket.on('reconnect', () => {
  // rejoin stored conversation ids
});

// keep presence fresh
setInterval(() => socket.emit('presence:heartbeat'), 30000);

// join conversation when user opens a chat
function openConversation(conversationId) {
  socket.emit('join_conversation', { conversationId });
}
```

Node / testing example is available at `examples/presence-client.js` in this repository.

Notes:
- Rely on one socket per active client (browser tab / mobile app instance). When the app is backgrounded or closed, the socket will disconnect and the server will set `onlineUntil` accordingly (TTL). Use `presence:heartbeat` to extend the TTL while the socket is connected.
- For multi-instance scaling use the Socket.IO Redis adapter and/or store ephemeral presence state in Redis to make presence reliable across processes.

Frontend Implementation Guide

This section shows a recommended implementation for modern single-page apps (React example). The goals are:
- Keep a single persistent socket connection per app instance.
- Reuse that socket across pages/components.
- Rejoin conversations after reconnect.
- Send periodic heartbeats to refresh server TTL.
- Optionally coordinate across browser tabs to avoid duplicate sockets.

1) Install client library

```bash
npm install socket.io-client
```

2) Create a singleton Socket service (plain JS/TS)

Example `src/services/socket.ts` (TypeScript-friendly):

```ts
import { io, Socket } from 'socket.io-client';

const SERVER = process.env.REACT_APP_API_URL || 'http://localhost:5000';

class SocketService {
  socket: Socket | null = null;
  joinedConversations = new Set<string>();
  heartbeatIntervalId: any = null;

  init(token: string) {
    if (this.socket) return this.socket;

    this.socket = io(`${SERVER}/chat`, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      // refresh presence once connected
      this.socket!.emit('presence:heartbeat');
      // rejoin conversations
      for (const id of this.joinedConversations) {
        this.socket!.emit('join_conversation', { conversationId: id });
      }
    });

    this.socket.on('disconnect', () => {
      // disconnect handled server-side via TTL/debounce
    });

    // keep periodic heartbeat
    this.heartbeatIntervalId = setInterval(() => {
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
    clearInterval(this.heartbeatIntervalId);
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
```

3) Provide socket via React Context (example)

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { socketService } from '../services/socket';

const SocketContext = createContext(null as any);

export const SocketProvider = ({ children }: any) => {
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const s = socketService.init(token);
    setSocket(s);

    return () => {
      // optional cleanup when app unmounts
      socketService.destroy();
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
```

4) Using it in components

```tsx
import { useEffect } from 'react';
import { useSocket } from './SocketProvider';

function Chat({ conversationId }: { conversationId: string }) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.emit('join_conversation', { conversationId });

    const onMessage = (msg: any) => { /* update UI */ };
    socket.on('message', onMessage);

    return () => {
      socket.emit('leave_conversation', { conversationId });
      socket.off('message', onMessage);
    };
  }, [socket, conversationId]);

  return <div>{/* chat UI */}</div>;
}
```

5) Multi-tab coordination (optional)

If you need only one socket per browser (all tabs share connection), use `BroadcastChannel` to elect a leader tab that keeps the connection alive; other tabs use the leader to receive updates via BroadcastChannel messages. This is optional and adds complexity — many apps accept one socket per tab.

6) Best practices

- Send `presence:heartbeat` every 20–60s while connected to refresh server TTL.
- On `reconnect`, rejoin previously open conversation rooms (store conversation ids in memory or sessionStorage).
- Listen for `user_presence_change` to update other users' online status in UI.
- Use server-side `onlineUntil` TTL and debounce to avoid flapping when a connection briefly drops.
- For large-scale deployments, enable Socket.IO Redis adapter and store ephemeral presence keys in Redis.

API surface summary

- Socket events (server):
  - `presence:heartbeat` (client → server): refresh presence TTL
  - `user_presence_change` (server → all): broadcast when a user's online status changes
  - `join_conversation` / `leave_conversation` (client → server): manage conversation rooms
  - `message`, `receive_message`, `new_message` (server ↔ client): message events

That's it — let me know if you want a ready-to-drop React component or a small frontend repo example that demonstrates login, opening a chat, and showing presence indicators.
