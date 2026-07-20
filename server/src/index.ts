import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import authRoutes from './routes/authRoutes';
import folderRoutes from './routes/folderRoutes';
import fileRoutes from './routes/fileRoutes';
import shareRoutes from './routes/shareRoutes';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Middlewares
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);
app.use(express.json());
app.use(cookieParser());

// Static uploads directory (will be created on-demand for local S3-alternative storage)
import fs from 'fs';
import path from 'path';
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/shares', shareRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_workspace', (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`Socket ${socket.id} joined workspace ${workspaceId}`);
  });

  socket.on('leave_workspace', (workspaceId: string) => {
    socket.leave(workspaceId);
    console.log(`Socket ${socket.id} left workspace ${workspaceId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible in routing if needed
app.set('io', io);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
