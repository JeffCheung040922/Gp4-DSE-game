import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './lib/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Question interface for proper typing
interface Question {
  id: string;
  no: number;
  text: string;
  options: string[];
  correctAnswer: string;
}

// In-memory storage for multiplayer rooms (replace with database later)
interface Room {
  id: string;
  hostId: string;
  players: Player[];
  subject: string;
  difficulty: string;
  status: 'waiting' | 'playing' | 'finished';
  questions: Question[];
  currentQuestion: number;
  answers: Record<string, string>;
  currentQuestionData?: Question;
  questionTimeLimitSec: number;
  roundDeadlineTs?: number;
  roundResolved?: boolean;
  roundTimer?: NodeJS.Timeout;
  bossHp: number;
  teamHp: number;
}

interface Player {
  id: string;
  name: string;
  classId: string;
  ready: boolean;
  score: number;
  charHp: number;
}

const rooms = new Map<string, Room>();
const QUESTION_TIME_LIMIT_SEC = 15;

function normalizeDifficulty(difficulty: string): 'easy' | 'medium' | 'hard' {
  const normalized = String(difficulty || 'easy').toLowerCase();
  if (normalized.startsWith('hard')) return 'hard';
  if (normalized.startsWith('med')) return 'medium';
  return 'easy';
}

function getBattleValues(difficulty: string) {
  const normalized = normalizeDifficulty(difficulty);

  if (normalized === 'hard') {
    return { bossDamage: 18, charDamage: 14 };
  }

  if (normalized === 'medium') {
    return { bossDamage: 14, charDamage: 10 };
  }

  return { bossDamage: 10, charDamage: 7 };
}

function fallbackQuestions(subject: string): Question[] {
  const label = String(subject || 'reading').toLowerCase();
  return [
    {
      id: `${label}-fallback-1`,
      no: 1,
      text: `(${label}) Choose the best answer: "abundant" means ...`,
      options: ['A. very scarce', 'B. plentiful', 'C. impossible', 'D. broken'],
      correctAnswer: 'B',
    },
    {
      id: `${label}-fallback-2`,
      no: 2,
      text: `(${label}) Which sentence is grammatically correct?`,
      options: ['A. She go to school', 'B. She goes to school', 'C. She going school', 'D. She gone school'],
      correctAnswer: 'B',
    },
    {
      id: `${label}-fallback-3`,
      no: 3,
      text: `(${label}) Pick the synonym of "rapid".`,
      options: ['A. slow', 'B. weak', 'C. fast', 'D. late'],
      correctAnswer: 'C',
    },
  ];
}

async function loadRoomQuestions(subject: string, difficulty: string): Promise<Question[]> {
  const normalizedDifficulty = normalizeDifficulty(difficulty);

  const { data: questionSet, error: setError } = await supabaseAdmin
    .from('question_sets')
    .select('id, title, question_count')
    .ilike('subject', `%${subject}%`)
    .ilike('difficulty', `%${normalizedDifficulty}%`)
    .not('title', 'ilike', '%test%')
    .order('question_count', { ascending: false })
    .limit(1)
    .single();

  if (setError || !questionSet?.id) {
    return fallbackQuestions(subject);
  }

  const { data: rows, error: questionError } = await supabaseAdmin
    .from('questions')
    .select('id, question_no, question_text, option_a, option_b, option_c, option_d, correct_answer')
    .eq('set_id', questionSet.id)
    .order('question_no', { ascending: true });

  if (questionError || !rows || rows.length === 0) {
    return fallbackQuestions(subject);
  }

  const mapped: Question[] = rows
    .map((row) => {
      const correctRaw = String(row.correct_answer || '').trim().toUpperCase();
      const correct = ['A', 'B', 'C', 'D'].includes(correctRaw)
        ? correctRaw
        : 'A';

      return {
        id: row.id,
        no: row.question_no,
        text: row.question_text,
        options: [
          `A. ${row.option_a}`,
          `B. ${row.option_b}`,
          `C. ${row.option_c}`,
          `D. ${row.option_d}`,
        ],
        correctAnswer: correct,
      };
    })
    .filter((q) => q.text && q.options.length === 4);

  return mapped.length > 0 ? mapped : fallbackQuestions(subject);
}

function serializeRoom(roomCode: string, room: Room) {
  const activeQuestion = room.currentQuestionData
    ? {
        id: room.currentQuestionData.id,
        no: room.currentQuestion + 1,
        text: room.currentQuestionData.text,
        options: room.currentQuestionData.options,
      }
    : undefined;

  return {
    id: room.id,
    roomCode,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      classId: p.classId,
      ready: p.ready,
      score: p.score,
      charHp: p.charHp,
    })),
    subject: room.subject,
    battleSubject: room.subject,
    difficulty: room.difficulty,
    status: room.status,
    bossHp: room.bossHp,
    teamHp: room.teamHp,
    currentQuestion: room.currentQuestion,
    totalQuestions: room.questions.length,
    roundDeadlineTs: room.roundDeadlineTs,
    activeQuestion,
  };
}

function clearRoundTimer(room: Room) {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = undefined;
  }
}

function readCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const tokenEntry = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('token='));
  if (!tokenEntry) return null;
  return decodeURIComponent(tokenEntry.slice('token='.length));
}

export function setupWebSocket(io: SocketServer) {
  const emitRoomState = (roomCode: string, room: Room) => {
    io.to(roomCode).emit('roomState', serializeRoom(roomCode, room));
  };

  const emitQuestionRoundToRoom = (roomCode: string, room: Room, q: Question) => {
    io.to(roomCode).emit('questionRound', {
      roomCode,
      question: {
        id: q.id,
        no: room.currentQuestion + 1,
        text: q.text,
        options: q.options,
      },
      timeLimitSec: room.questionTimeLimitSec,
      deadlineTs: room.roundDeadlineTs,
      totalQuestions: room.questions.length,
    });
  };

  const emitCurrentRoundToSocket = (socket: Socket, roomCode: string, room: Room) => {
    if (room.status !== 'playing' || !room.currentQuestionData || !room.roundDeadlineTs) {
      return;
    }

    const q = room.currentQuestionData;
    socket.emit('questionRound', {
      roomCode,
      question: {
        id: q.id,
        no: room.currentQuestion + 1,
        text: q.text,
        options: q.options,
      },
      timeLimitSec: room.questionTimeLimitSec,
      deadlineTs: room.roundDeadlineTs,
      totalQuestions: room.questions.length,
    });
  };

  const finishRoom = (roomCode: string, room: Room, reason: string) => {
    room.status = 'finished';
    clearRoundTimer(room);
    io.to(roomCode).emit('gameFinished', {
      reason,
      room: serializeRoom(roomCode, room),
    });
    emitRoomState(roomCode, room);

    setTimeout(() => {
      rooms.delete(roomCode);
      console.log(`Cleaned up finished room: ${roomCode}`);
    }, 300000);
  };

  const evaluateRound = (roomCode: string, room: Room) => {
    if (room.status !== 'playing' || !room.currentQuestionData || room.roundResolved) {
      return;
    }

    room.roundResolved = true;
    clearRoundTimer(room);

    const currentQuestion = room.currentQuestionData;
    const { bossDamage, charDamage } = getBattleValues(room.difficulty);
    let totalBossDamage = 0;
    let totalTeamDamage = 0;

    const verdicts = room.players.map((player) => {
      const answer = String(room.answers[player.id] || '').trim().toUpperCase();
      const isCorrect = answer === currentQuestion.correctAnswer;
      const dealtBossDamage = isCorrect ? bossDamage : 0;
      const dealtCharDamage = isCorrect ? 0 : charDamage;

      if (isCorrect) {
        player.score += 10;
        totalBossDamage += dealtBossDamage;
      } else {
        totalTeamDamage += dealtCharDamage;
      }

      return {
        playerId: player.id,
        answer,
        isCorrect,
        bossDamage: dealtBossDamage,
        charDamage: dealtCharDamage,
      };
    });

    room.bossHp = Math.max(0, room.bossHp - totalBossDamage);
    room.teamHp = Math.max(0, room.teamHp - totalTeamDamage);
    room.players.forEach((p) => {
      p.charHp = room.teamHp;
    });

    io.to(roomCode).emit('battleUpdate', {
      roomCode,
      questionId: currentQuestion.id,
      questionNo: room.currentQuestion + 1,
      correctAnswer: currentQuestion.correctAnswer,
      verdicts,
      bossHp: room.bossHp,
      teamHp: room.teamHp,
      players: room.players.map((p) => ({ id: p.id, charHp: p.charHp, score: p.score })),
    });

    emitRoomState(roomCode, room);

    const allPlayersDown = room.teamHp <= 0;
    if (room.bossHp <= 0) {
      finishRoom(roomCode, room, 'boss_defeated');
      return;
    }
    if (allPlayersDown) {
      finishRoom(roomCode, room, 'players_defeated');
      return;
    }

    room.currentQuestion += 1;
    room.currentQuestionData = undefined;
    room.answers = {};
    room.roundDeadlineTs = undefined;

    if (room.currentQuestion >= room.questions.length) {
      finishRoom(roomCode, room, 'questions_exhausted');
      return;
    }

    setTimeout(() => {
      const q = room.questions[room.currentQuestion];
      if (!q || room.status !== 'playing') {
        return;
      }

      room.currentQuestionData = q;
      room.answers = {};
      room.roundResolved = false;
      room.roundDeadlineTs = Date.now() + room.questionTimeLimitSec * 1000;

      emitQuestionRoundToRoom(roomCode, room, q);

      emitRoomState(roomCode, room);
      clearRoundTimer(room);
      room.roundTimer = setTimeout(() => evaluateRound(roomCode, room), room.questionTimeLimitSec * 1000 + 80);
    }, 1600);
  };

  const startQuestionRound = (roomCode: string, room: Room) => {
    const q = room.questions[room.currentQuestion];
    if (!q) {
      finishRoom(roomCode, room, 'questions_exhausted');
      return;
    }

    room.currentQuestionData = q;
    room.answers = {};
    room.roundResolved = false;
    room.roundDeadlineTs = Date.now() + room.questionTimeLimitSec * 1000;

    emitQuestionRoundToRoom(roomCode, room, q);

    emitRoomState(roomCode, room);

    // Rebroadcast shortly after start to cover navigation/listener race on round 1.
    setTimeout(() => {
      const latest = rooms.get(roomCode);
      if (!latest || latest.status !== 'playing' || latest.currentQuestion !== room.currentQuestion || latest.roundResolved) {
        return;
      }
      if (!latest.currentQuestionData || latest.currentQuestionData.id !== q.id) {
        return;
      }

      emitQuestionRoundToRoom(roomCode, latest, latest.currentQuestionData);
      emitRoomState(roomCode, latest);
    }, 900);

    clearRoundTimer(room);
    room.roundTimer = setTimeout(() => evaluateRound(roomCode, room), room.questionTimeLimitSec * 1000 + 80);
  };

  // Middleware for authentication
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || readCookieToken(socket.handshake.headers.cookie);
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`User ${socket.data.userId} connected`);

    // Join room
    socket.on('joinRoom', (data: { roomCode: string; playerName: string; classId: string }) => {
      const { roomCode, playerName, classId } = data;
      const userId = socket.data.userId;

      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if player already in room
      const existingPlayer = room.players.find(p => p.id === userId);
      if (existingPlayer) {
        socket.join(roomCode);
        socket.emit('roomState', serializeRoom(roomCode, room));
        emitCurrentRoundToSocket(socket, roomCode, room);
        return;
      }

      // Add player to room
      const player: Player = {
        id: userId,
        name: playerName,
        classId,
        ready: false,
        score: 0,
        charHp: room.teamHp,
      };

      room.players.push(player);
      socket.join(roomCode);

      // Notify all players in room
      emitRoomState(roomCode, room);
      io.to(roomCode).emit('playerJoined', player);
      emitCurrentRoundToSocket(socket, roomCode, room);
    });

    // Leave room
    socket.on('leaveRoom', () => {
      const userId = socket.data.userId;

      // Find room containing this player
      for (const [roomCode, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === userId);
        if (playerIndex !== -1) {
          const player = room.players[playerIndex];
          room.players.splice(playerIndex, 1);

          socket.leave(roomCode);

          // If room is empty, delete it
          if (room.players.length === 0) {
            clearRoundTimer(room);
            rooms.delete(roomCode);
          } else {
            // If host left, assign new host
            if (room.hostId === userId && room.players.length > 0) {
              room.hostId = room.players[0].id;
            }

            // Notify remaining players
            emitRoomState(roomCode, room);
            io.to(roomCode).emit('playerLeft', player);
          }
          break;
        }
      }
    });

    // Player ready
    socket.on('ready', () => {
      const userId = socket.data.userId;

      for (const [roomCode, room] of rooms.entries()) {
        const player = room.players.find(p => p.id === userId);
        if (player) {
          player.ready = true;

          // Check if all players are ready
          const allReady = room.players.every(p => p.ready);
          if (allReady && room.players.length >= 2) {
            room.status = 'playing';
            // Start game logic here
            io.to(roomCode).emit('gameStarted', room);
          }

          emitRoomState(roomCode, room);
          io.to(roomCode).emit('playerReady', player);
          break;
        }
      }
    });

    // Host starts battle for the whole room
    socket.on('startBattle', async (data: { roomCode: string }) => {
      const userId = socket.data.userId;
      const roomCode = String(data?.roomCode || '').trim().toUpperCase();

      if (!roomCode || typeof roomCode !== 'string') {
        socket.emit('battleStartError', { message: 'Room code required.' });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('battleStartError', { message: 'Room not found.' });
        return;
      }

      if (room.hostId !== userId) {
        socket.emit('battleStartError', { message: 'Only the host can start the battle.' });
        return;
      }

      if (room.players.length < 2) {
        socket.emit('battleStartError', { message: 'Need at least 2 players to start.' });
        return;
      }

      if (!room.questions || room.questions.length === 0) {
        room.questions = await loadRoomQuestions(room.subject, room.difficulty);
      }
      if (!room.questions || room.questions.length === 0) {
        socket.emit('battleStartError', { message: 'No questions available for this room.' });
        return;
      }

      room.players.forEach((player) => {
        player.charHp = 100;
        player.score = 0;
      });

      room.bossHp = 100;
      room.teamHp = 100;
      room.players.forEach((player) => {
        player.charHp = room.teamHp;
      });
      room.currentQuestion = 0;
      room.answers = {};
      room.currentQuestionData = undefined;
      room.roundDeadlineTs = undefined;
      room.roundResolved = false;
      room.questionTimeLimitSec = QUESTION_TIME_LIMIT_SEC;
      clearRoundTimer(room);

      room.status = 'playing';

      io.to(roomCode).emit('battleStarted', {
        roomCode,
        hostId: room.hostId,
        subject: room.subject,
        difficulty: room.difficulty,
        questionTimeLimitSec: room.questionTimeLimitSec,
      });
      emitRoomState(roomCode, room);
      setTimeout(() => {
        const latest = rooms.get(roomCode);
        if (!latest || latest.status !== 'playing') return;
        startQuestionRound(roomCode, latest);
      }, 650);
    });

    // Submit answer
    socket.on('submitAnswer', (data: { roomCode: string; answer: string }) => {
      const userId = socket.data.userId;
      const answer = String(data?.answer || '').trim().toUpperCase();
      const roomCodeFromClient = String(data?.roomCode || '').trim().toUpperCase();

      // Validate answer input
      if (!['A', 'B', 'C', 'D'].includes(answer)) {
        socket.emit('error', { message: 'Invalid answer format' });
        return;
      }

      const directRoom = roomCodeFromClient ? rooms.get(roomCodeFromClient) : undefined;
      const roomEntry = directRoom
        ? [roomCodeFromClient, directRoom] as const
        : [...rooms.entries()].find(([, room]) => room.players.some((p) => p.id === userId));

      if (!roomEntry) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const [roomCode, room] = roomEntry;
      const player = room.players.find((p) => p.id === userId);

      if (!player || room.status !== 'playing' || !room.currentQuestionData) {
        socket.emit('error', { message: 'No active battle round.' });
        return;
      }

      if (room.answers[userId]) {
        socket.emit('answerAccepted', { answer, alreadySubmitted: true });
        return;
      }

      room.answers[userId] = answer;
      socket.emit('answerAccepted', { answer });

      const allAnswered = room.players.every((p) => Boolean(room.answers[p.id]));
      if (allAnswered) {
        evaluateRound(roomCode, room);
      } else {
        emitRoomState(roomCode, room);
      }
    });

    // Get room state
    socket.on('getRoomState', (data: { roomCode: string }) => {
      const roomCode = String(data?.roomCode || '').trim().toUpperCase();
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (room) {
        socket.emit('roomState', serializeRoom(roomCode, room));
        emitCurrentRoundToSocket(socket, roomCode, room);
      } else {
        socket.emit('error', { message: 'Room not found' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.data.userId} disconnected`);
      // Handle player leaving on disconnect - CRITICAL: prevent memory leaks
      const userId = socket.data.userId;

      // Safely validate userId
      if (!userId || typeof userId !== 'string') {
        console.warn('Disconnect event with invalid userId');
        return;
      }

      // Find room containing this player
      for (const [roomCode, room] of rooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === userId);
        if (playerIndex !== -1) {
          const player = room.players[playerIndex];
          room.players.splice(playerIndex, 1);

          // If room is empty, delete it to prevent memory leaks
          if (room.players.length === 0) {
            clearRoundTimer(room);
            console.log(`Deleted empty room: ${roomCode}`);
            rooms.delete(roomCode);
          } else {
            // If host left, assign new host
            if (room.hostId === userId && room.players.length > 0) {
              room.hostId = room.players[0].id;
              console.log(`New host assigned in room ${roomCode}`);
            }

            // Notify remaining players
            emitRoomState(roomCode, room);
            io.to(roomCode).emit('playerLeft', player);
          }
          break;
        }
      }
    });
  });
}

// Helper function to create room (called from REST API)
export function createRoom(roomCode: string, hostId: string, subject: string, difficulty: string, hostName: string = 'Player', hostClassId: string = 'knight') {
  const room: Room = {
    id: roomCode,
    hostId,
    players: [{ id: hostId, name: hostName, classId: hostClassId, ready: false, score: 0, charHp: 100 }],
    subject,
    difficulty,
    status: 'waiting',
    questions: [],
    currentQuestion: 0,
    answers: {},
    questionTimeLimitSec: QUESTION_TIME_LIMIT_SEC,
    bossHp: 100,
    teamHp: 100,
  };

  rooms.set(roomCode, room);
  return room;
}

// Helper function to get room
export function getRoom(roomCode: string) {
  return rooms.get(roomCode);
}