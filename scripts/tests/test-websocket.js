import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const BACKEND_URL = process.env.TEST_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5001';

// Simple WebSocket test
function testWebSocket() {
  console.log('Testing WebSocket connection...');
  console.log('Backend URL:', BACKEND_URL);
  let hasFailure = false;

  // Create a fresh JWT token for testing. If backend overrides JWT_SECRET,
  // run this script with matching env var: JWT_SECRET=... node scripts/tests/test-websocket.js
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
  const mockToken = jwt.sign({ userId: 'test-user-123' }, jwtSecret, { expiresIn: '10m' });

  // Connect to WebSocket
  const socket = io(BACKEND_URL, {
    auth: {
      token: mockToken
    }
  });

  socket.on('connect', () => {
    console.log('✅ Connected to WebSocket server');

    // Test room creation via REST API
    fetch(`${BACKEND_URL}/api/room/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `token=${mockToken}`
      },
      body: JSON.stringify({
        subject: 'reading',
        difficulty: 'easy'
      }),
    })
    .then(async (res) => {
      const roomData = await res.json();
      if (!res.ok) {
        const msg = roomData?.error || JSON.stringify(roomData);
        throw new Error(`Room creation failed (${res.status}): ${msg}`);
      }
      return roomData;
    })
    .then(roomData => {
      const roomCode = roomData?.roomCode || roomData?.room?.roomCode || roomData?.data?.roomCode;
      if (typeof roomCode !== 'string' || roomCode.length !== 6) {
        hasFailure = true;
        console.error('❌ Room creation returned unexpected shape:', roomData);
        return;
      }

      console.log('✅ Room created:', roomCode);

      // Test joining room via WebSocket
      socket.emit('joinRoom', {
        roomCode,
        playerName: 'TestPlayer',
        classId: 'knight'
      });
    })
    .catch(err => {
      hasFailure = true;
      console.error('❌ Room creation failed:', err.message || err);
    });
  });

  socket.on('roomState', (data) => {
    console.log('📡 Room state received:', data);
  });

  socket.on('playerJoined', (player) => {
    console.log('👤 Player joined:', player.name);
  });

  socket.on('connect_error', (error) => {
    hasFailure = true;
    console.log('❌ WebSocket connection error:', error.message);
  });

  socket.on('error', (error) => {
    hasFailure = true;
    console.log('❌ WebSocket error:', error);
  });

  socket.on('disconnect', () => {
    if (hasFailure) {
      process.exitCode = 1;
    }
    console.log('🔌 Disconnected from WebSocket');
  });

  // Auto disconnect after 10 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout - disconnecting...');
    socket.disconnect();
  }, 10000);
}

// Run the test
testWebSocket();