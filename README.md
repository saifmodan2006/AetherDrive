# AetherDrive: File Sharing & Collaboration Platform

A lightweight, secure, and fast web application where teams can upload, organize, and share files.

## Project Architecture
- **Frontend**: Next.js (App Router, Tailwind CSS, Lucide React, Zustand, Axios, Socket.io-client)
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Socket.io
- **Database**: SQLite (dev) / PostgreSQL (prod ready)
- **Storage**: Local directory (dev) / S3-compatible (prod ready)

---

## Getting Started

### Prerequisites
Make sure you have Node.js (v18+) and npm installed.

### Setup Instructions

1. **Clone & Install Dependencies**
   Run the following command at the root directory of the project to install all dependencies for both workspace directories:
   ```bash
   npm install
   ```

2. **Initialize the Database**
   The backend uses Prisma. Run the migrations to set up the SQLite database and generate the Prisma Client:
   ```bash
   npm run prisma:migrate --workspace=server
   ```

3. **Start Development Servers**
   To start the backend (listening on port 5000) and frontend (listening on port 3000) concurrently, run:
   ```bash
   npm run dev
   ```

---

## Monorepo Layout

- `/client` - Next.js React frontend.
- `/server` - Express Node.js API and WebSocket server.
- `/server/prisma` - Database schema and migration logs.
- `/server/uploads` - Local storage directory for file uploads (created dynamically).
