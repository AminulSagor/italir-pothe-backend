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
