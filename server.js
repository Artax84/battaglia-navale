// ============================================================
// BATTAGLIA NAVALE — Server Multiplayer
// © Girolamo Artale
// Server autoritativo: valida mosse, gestisce turni, anti-cheat
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files from root directory
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const DEBUG = process.env.DEBUG === '1' || process.env.NODE_ENV !== 'production';
function log(...args) { if (DEBUG) console.log(...args); }

// --- ROOM TTL: drop rooms idle for more than this (ms) ---
const ROOM_IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// --- INPUT SANITIZATION ---
function sanitizeRoomCode(s) {
  return String(s == null ? '' : s).trim().toUpperCase().slice(0, 8);
}
function sanitizePlayerName(s) {
  return String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9 _\-]/g, '').slice(0, 16);
}

// --- GAME ROOMS ---
const rooms = new Map();
let roomCounter = 1;

// Ship definitions
const SHIP_DEFS = [
  { name: 'Portaerei', size: 5 },
  { name: 'Corazzata', size: 4 },
  { name: 'Incrociatore', size: 3 },
  { name: 'Sottomarino', size: 3 },
  { name: 'Cacciatorpediniere', size: 2 },
];

// --- VALIDATION ---
// Standard battleship rules: ships cannot overlap AND cannot touch each other,
// not even diagonally. We track per-cell ship index and scan the 8 neighbours
// of each ship cell to ensure no other ship is adjacent.
function validateShipPlacement(ships) {
  if (!ships || ships.length !== 5) return false;
  const board = Array.from({ length: 10 }, () => Array(10).fill(-1));

  for (let si = 0; si < ships.length; si++) {
    const ship = ships[si];
    if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== SHIP_DEFS[si].size) return false;

    const cells = ship.cells;
    for (const c of cells) {
      if (!Number.isInteger(c.r) || !Number.isInteger(c.c)) return false;
      if (c.r < 0 || c.r >= 10 || c.c < 0 || c.c >= 10) return false;
      if (board[c.r][c.c] !== -1) return false; // overlap
      board[c.r][c.c] = si;
    }

    // Contiguous straight line
    if (cells.length > 1) {
      const dr = cells[1].r - cells[0].r;
      const dc = cells[1].c - cells[0].c;
      if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
      for (let i = 1; i < cells.length; i++) {
        if (cells[i].r !== cells[0].r + dr * i || cells[i].c !== cells[0].c + dc * i) return false;
      }
    }
  }

  // No-touch rule (incl. diagonal) — for each ship cell, no neighbour may
  // belong to a different ship.
  for (let si = 0; si < ships.length; si++) {
    for (const { r, c } of ships[si].cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= 10 || nc < 0 || nc >= 10) continue;
          const other = board[nr][nc];
          if (other !== -1 && other !== si) return false;
        }
      }
    }
  }
  return true;
}

function createServerBoard(ships) {
  const board = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ ship: null, hit: false }))
  );
  ships.forEach((ship, si) => {
    ship.cells.forEach(({ r, c }) => { board[r][c].ship = si; });
  });
  return board;
}

function generateRoomCode() {
  const code = String(roomCounter).padStart(4, '0');
  roomCounter++;
  return code;
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  log(`[+] Connesso: ${socket.id}`);

  let currentRoom = null;

  // Create a new game room
  socket.on('CREATE_ROOM', ({ playerName } = {}) => {
    const cleanName = sanitizePlayerName(playerName) || 'Giocatore 1';
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{
        id: socket.id,
        name: cleanName,
        ships: null,
        board: null,
        ready: false,
        rematch: false,
      }],
      turn: 0, // index into players[]
      phase: 'waiting', // waiting, placement, battle, over
      stats: [
        { shots: 0, hits: 0 },
        { shots: 0, hits: 0 },
      ],
      lastActivity: Date.now(),
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    currentRoom = roomCode;
    socket.emit('ROOM_CREATED', { roomCode, playerId: 0 });
    log(`[ROOM] Creata stanza ${roomCode} da ${cleanName}`);
  });

  // Join an existing room
  socket.on('JOIN_ROOM', ({ roomCode, playerName } = {}) => {
    const code = sanitizeRoomCode(roomCode);
    const cleanName = sanitizePlayerName(playerName) || 'Giocatore 2';
    const room = rooms.get(code);
    if (!room) {
      socket.emit('ERROR', { message: 'Stanza non trovata!' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('ERROR', { message: 'Stanza piena!' });
      return;
    }
    if (room.phase !== 'waiting') {
      socket.emit('ERROR', { message: 'Partita già iniziata!' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: cleanName,
      ships: null,
      board: null,
      ready: false,
      rematch: false,
    });
    socket.join(code);
    currentRoom = code;
    room.lastActivity = Date.now();

    socket.emit('ROOM_JOINED', { roomCode: code, playerId: 1, opponentName: room.players[0].name });
    // Notify host
    io.to(room.players[0].id).emit('OPPONENT_JOINED', { opponentName: cleanName });

    // Start placement phase
    room.phase = 'placement';
    io.to(code).emit('PHASE_CHANGE', { phase: 'placement' });
    log(`[ROOM] ${cleanName} entra in stanza ${code}`);
  });

  // Place ships
  socket.on('PLACE_SHIPS', ({ ships } = {}) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== 'placement') return;

    const pi = room.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;

    if (!validateShipPlacement(ships)) {
      socket.emit('ERROR', { message: 'Piazzamento navi non valido!' });
      return;
    }

    room.players[pi].ships = ships;
    room.players[pi].board = createServerBoard(ships);
    room.players[pi].ready = true;
    room.lastActivity = Date.now();

    socket.emit('SHIPS_ACCEPTED');
    log(`[ROOM ${currentRoom}] Giocatore ${pi} ha piazzato le navi`);

    // Check if both ready
    if (room.players.every(p => p.ready)) {
      room.phase = 'battle';
      room.turn = 0; // Player 0 starts
      io.to(currentRoom).emit('PHASE_CHANGE', { phase: 'battle' });
      io.to(room.players[0].id).emit('YOUR_TURN');
      io.to(room.players[1].id).emit('ENEMY_TURN');
      log(`[ROOM ${currentRoom}] Battaglia iniziata!`);
    } else {
      socket.emit('WAITING_OPPONENT', { message: 'In attesa che l\'avversario piazzi le navi...' });
    }
  });

  // Fire
  socket.on('FIRE', ({ row, col } = {}) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== 'battle') return;

    const pi = room.players.findIndex(p => p.id === socket.id);
    if (pi === -1 || pi !== room.turn) {
      socket.emit('ERROR', { message: 'Non è il tuo turno!' });
      return;
    }

    const opIdx = 1 - pi;
    const op = room.players[opIdx];
    if (!op || !op.board || !op.ships) {
      socket.emit('ERROR', { message: 'Avversario non pronto!' });
      return;
    }
    const opBoard = op.board;
    const opShips = op.ships;

    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 10 || col < 0 || col >= 10) {
      socket.emit('ERROR', { message: 'Coordinate non valide!' });
      return;
    }
    if (opBoard[row][col].hit) {
      socket.emit('ERROR', { message: 'Casella già colpita!' });
      return;
    }
    room.lastActivity = Date.now();

    // Process shot
    opBoard[row][col].hit = true;
    room.stats[pi].shots++;

    let result, shipName = null, shipCells = null;
    const si = opBoard[row][col].ship;
    if (si !== null) {
      room.stats[pi].hits++;
      // Check if sunk
      const ship = opShips[si];
      const allHit = ship.cells.every(({ r, c }) => opBoard[r][c].hit);
      if (allHit) {
        result = 'sunk';
        shipName = ship.name || SHIP_DEFS[si].name;
        shipCells = ship.cells; // Reveal sunk ship position
      } else {
        result = 'hit';
      }
    } else {
      result = 'miss';
    }

    // Send result to shooter
    socket.emit('FIRE_RESULT', { row, col, result, shipName, shipCells });

    // Send to opponent
    io.to(room.players[opIdx].id).emit('OPPONENT_FIRED', { row, col, result, shipName, shipCells });

    // Check win
    const allSunk = opShips.every(ship =>
      ship.cells.every(({ r, c }) => opBoard[r][c].hit)
    );

    if (allSunk) {
      room.phase = 'over';
      // Reveal boards
      const p0Board = room.players[0].ships.map(s => s.cells);
      const p1Board = room.players[1].ships.map(s => s.cells);

      io.to(room.players[pi].id).emit('GAME_OVER', {
        winner: true,
        opponentShips: opIdx === 0 ? p0Board : p1Board,
        stats: room.stats,
      });
      io.to(room.players[opIdx].id).emit('GAME_OVER', {
        winner: false,
        opponentShips: pi === 0 ? p0Board : p1Board,
        stats: room.stats,
      });
      log(`[ROOM ${currentRoom}] Partita finita! Vince giocatore ${pi}`);
    } else {
      // Switch turn
      room.turn = opIdx;
      io.to(room.players[opIdx].id).emit('YOUR_TURN');
      io.to(room.players[pi].id).emit('ENEMY_TURN');
    }
  });

  // Rematch
  socket.on('REMATCH', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const pi = room.players.findIndex(p => p.id === socket.id);
    if (pi === -1) return;

    room.players[pi].rematch = true;
    room.lastActivity = Date.now();

    if (room.players.length === 2 && room.players.every(p => p.rematch)) {
      // Reset room
      room.players.forEach(p => {
        p.ships = null; p.board = null; p.ready = false; p.rematch = false;
      });
      room.phase = 'placement';
      room.turn = 0;
      room.stats = [{ shots: 0, hits: 0 }, { shots: 0, hits: 0 }];
      io.to(currentRoom).emit('PHASE_CHANGE', { phase: 'placement' });
      log(`[ROOM ${currentRoom}] Rivincita!`);
    } else {
      socket.emit('WAITING_OPPONENT', { message: 'In attesa che l\'avversario accetti la rivincita...' });
      const opIdx = 1 - pi;
      const op = room.players[opIdx];
      if (op && op.id) {
        io.to(op.id).emit('REMATCH_REQUEST', {
          message: `${room.players[pi].name} vuole la rivincita!`
        });
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    log(`[-] Disconnesso: ${socket.id}`);
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const pi = room.players.findIndex(p => p.id === socket.id);
    if (pi !== -1) {
      const opIdx = 1 - pi;
      const op = room.players?.[opIdx];
      if (op?.id) {
        io.to(op.id).emit('OPPONENT_DISCONNECTED');
        // Clear opponent's rematch flag so a stale flag doesn't auto-accept on reconnect
        op.rematch = false;
      }
      // Remove disconnected player from the slot to avoid orphaned references
      room.players.splice(pi, 1);
    }

    // Clean up room if empty, mid-game, or no clients left in the socket.io room
    const adapterRoom = io.sockets.adapter.rooms.get(currentRoom);
    const remaining = adapterRoom ? adapterRoom.size : 0;
    if (room.players.length === 0 || remaining === 0 || room.phase !== 'over') {
      rooms.delete(currentRoom);
      log(`[ROOM] Stanza ${currentRoom} eliminata`);
    }
  });
});

// Clean up stale rooms periodically: drop empty rooms and rooms idle past TTL
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const sockets = io.sockets.adapter.rooms.get(code);
    const empty = !sockets || sockets.size === 0;
    const idle = room.lastActivity && (now - room.lastActivity > ROOM_IDLE_TTL_MS);
    if (empty || idle) {
      rooms.delete(code);
      if (idle && !empty) log(`[ROOM] Stanza ${code} scaduta per inattività`);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`\n🚢 BATTAGLIA NAVALE — Server avviato`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Apri: http://localhost:${PORT}\n`);
});
