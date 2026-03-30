import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes';
import characterRoutes from './routes/characterRoutes';
import questionRoutes from './routes/questionRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import shopRoutes from './routes/shopRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import roomRoutes from './routes/roomRoutes';
import aiRoutes from './routes/aiRoutes';
import { setupWebSocket } from './socketHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { getBossTeaserInfo } from './controllers/dashboardController';

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/character', characterRoutes);
app.use('/api', questionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/room', roomRoutes);
app.use('/api/ai', aiRoutes);
app.get('/api/live-boss-teaser', authMiddleware, getBossTeaserInfo);

setupWebSocket(io);

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
  });
});

app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
