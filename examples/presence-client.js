/**
 * Simple Node example that keeps a persistent Socket.IO connection
 * Usage: node examples/presence-client.js <JWT_TOKEN> [conversationId]
 *
 * Requires: `npm install socket.io-client`
 */
const { io } = require('socket.io-client');

const token = process.argv[2];
const conversationId = process.argv[3] || null;

if (!token) {
  console.error('Usage: node examples/presence-client.js <JWT_TOKEN> [conversationId]');
  process.exit(1);
}

const SERVER = process.env.SOCKET_SERVER || 'http://localhost:5000';
const NAMESPACE = '/chat';

const socket = io(`${SERVER}${NAMESPACE}`, {
  auth: { token: `Bearer ${token}` },
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket'],
});

const joinedConversations = new Set();

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('presence:heartbeat');
  if (conversationId) joinConversation(conversationId);
});

socket.on('reconnect', (attempt) => {
  console.log('Reconnected:', attempt);
  for (const id of joinedConversations) {
    joinConversation(id);
  }
  socket.emit('presence:heartbeat');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('user_presence_change', (data) => {
  console.log('Presence change:', data);
});

socket.on('message', (msg) => {
  console.log('Message:', msg);
});

// periodic heartbeat to refresh server-side TTL
const HEARTBEAT_INTERVAL_MS = 30_000;
const heartbeat = setInterval(() => {
  if (socket.connected) socket.emit('presence:heartbeat');
}, HEARTBEAT_INTERVAL_MS);

function joinConversation(id) {
  socket.emit('join_conversation', { conversationId: id }, (res) => {
    console.log('join conversation response', res);
    joinedConversations.add(id);
  });
}

function leaveConversation(id) {
  socket.emit('leave_conversation', { conversationId: id }, (res) => {
    console.log('leave conversation response', res);
    joinedConversations.delete(id);
  });
}

process.on('SIGINT', () => {
  console.log('Shutting down...');
  clearInterval(heartbeat);
  socket.disconnect();
  process.exit(0);
});

module.exports = { socket, joinConversation, leaveConversation };
