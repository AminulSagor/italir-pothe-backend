# Chat Testing Guide

This guide explains how to test the NestJS chat system you added to the project.

## 1. Install dependencies

From the project root:

```bash
npm install
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io socket.io-client
```

## 2. Create `.env`

Create a `.env` file at the project root with values similar to:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=chat_dev
JWT_SECRET=change_me_for_dev
JWT_EXPIRES_IN=1d
TYPEORM_SYNC=true
```

## 3. Start a local PostgreSQL database

Use Docker for a quick local database:

```bash
docker run --name chat-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat_dev -p 5432:5432 -d postgres:15
```

## 4. Run the server

```bash
npm run start:dev
```

The API should now be available at `http://localhost:5000`.

## 5. Create users and verify accounts

### Sign up users

Use curl or Postman to create two users.

#### User A

```bash
curl -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"User A","email":"usera@example.com","password":"Pass1234"}'
```

#### User B

```bash
curl -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"User B","email":"userb@example.com","password":"Pass1234"}'
```

### Mark users verified

For fast local testing, update users in the DB directly:

```bash
psql "postgresql://postgres:postgres@localhost:5432/chat_dev" -c "UPDATE users SET is_verified = true WHERE email IN ('usera@example.com','userb@example.com');"
```

## 6. Login and get JWTs

#### Login User A

```bash
TOKEN_A=$(curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"usera@example.com","password":"Pass1234"}' | jq -r .accessToken)
echo $TOKEN_A
```

#### Login User B

```bash
TOKEN_B=$(curl -s -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"userb@example.com","password":"Pass1234"}' | jq -r .accessToken)
echo $TOKEN_B
```

## 7. Create a direct conversation

Get User B ID from the DB:

```bash
psql "postgresql://postgres:postgres@localhost:5432/chat_dev" -c "SELECT id,email FROM users;"
```

Then create the direct conversation with User A:

```bash
CONV_ID=$(curl -s -X POST http://localhost:5000/chat/direct \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"otherUserId":"<USER_B_ID>"}' | jq -r .conversationId)
echo $CONV_ID
```

Replace `<USER_B_ID>` with the actual ID from the query.

## 8. Test the WebSocket chat flow

Create a small client file named `chat-client.js` in the repository:

```js
const { io } = require('socket.io-client');

if (process.argv.length < 4) {
  console.error('Usage: node chat-client.js <JWT> <LABEL>');
  process.exit(1);
}

const token = process.argv[2];
const label = process.argv[3];
const conversationId = process.env.CONV_ID;

const socket = io('http://localhost:3000/chat', {
  auth: { token },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log(label, 'connected', socket.id);
  if (conversationId) {
    socket.emit('join_conversation', { conversationId });
  }
});

socket.on('disconnect', () => {
  console.log(label, 'disconnected');
});

socket.on('message', (msg) => {
  console.log(label, 'received message:', msg);
});

socket.on('message_delivery', (payload) => {
  console.log(label, 'delivery event:', payload);
});

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  if (!conversationId) {
    console.log('Set CONV_ID environment variable to send messages.');
    return;
  }
  socket.emit('send_message', {
    conversationId,
    content: line,
    clientMessageId: 'cid-' + Date.now(),
  });
});
```

Run two clients in separate terminals:

```bash
export CONV_ID=$CONV_ID
node chat-client.js "$TOKEN_A" "UserA"
```

```bash
export CONV_ID=$CONV_ID
node chat-client.js "$TOKEN_B" "UserB"
```

Type text in either terminal and verify the other client receives the message.

## 9. Verify database persistence

Check message and delivery tables:

```bash
psql "postgresql://postgres:postgres@localhost:5432/chat_dev" -c "SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;"
psql "postgresql://postgres:postgres@localhost:5432/chat_dev" -c "SELECT * FROM message_delivery_jobs ORDER BY created_at DESC LIMIT 10;"
psql "postgresql://postgres:postgres@localhost:5432/chat_dev" -c "SELECT * FROM message_receipts ORDER BY created_at DESC LIMIT 10;"
```

## 10. Cleanup

Stop the server and optionally remove the Docker container:

```bash
docker rm -f chat-postgres
```

## Notes

- The WebSocket connection accepts JWT in `auth.token` or `?token=` query string.
- Messages are broadcast to the conversation room and delivery jobs are queued for receivers.
- If you want a more production-ready test, replace `TYPEORM_SYNC=true` with migrations and use a separate queue worker.
