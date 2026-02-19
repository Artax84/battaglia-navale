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
function validateShipPlacement(ships) {
  if (!ships || ships.length !== 5) return false;
  const board = Array.from({ length: 10 }, () => Array(10).fill(false));

  for (let si = 0; si < ships.length; si++) {
    const ship = ships[si];
    if (!ship.cells || ship.cells.length !== SHIP_DEFS[si].size) return false;

    // Check cells are valid, in line, and within bounds
    const cells = ship.cells;
    for (const c of cells) {
      if (c.r < 0 || c.r >= 10 || c.c < 0 || c.c >= 10) return false;
      if (board[c.r][c.c]) return false; // overlap
      board[c.r][c.c] = true;
    }

    // Check cells are contiguous and in a line
    if (cells.length > 1) {
      const dr = cells[1].r - cells[0].r;
      const dc = cells[1].c - cells[0].c;
      if (Math.abs(dr) + Math.abs(dc) !== 1) return false; // not adjacent
      for (let i = 1; i < cells.length; i++) {
        if (cells[i].r !== cells[0].r + dr * i || cells[i].c !== cells[0].c + dc * i) return false;
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
  console.log(`[+] Connesso: ${socket.id}`);

  let currentRoom = null;

  // Create a new game room
  socket.on('CREATE_ROOM', ({ playerName }) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: [{
        id: socket.id,
        name: playerName || 'Giocatore 1',
        ships: null,
        board: null,
        ready: false,
      }],
      turn: 0, // index into players[]
      phase: 'waiting', // waiting, placement, battle, over
      stats: [
        { shots: 0, hits: 0 },
        { shots: 0, hits: 0 },
      ],
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    currentRoom = roomCode;
    socket.emit('ROOM_CREATED', { roomCode, playerId: 0 });
    console.log(`[ROOM] Creata stanza ${roomCode} da ${playerName}`);
  });

  // Join an existing room
  socket.on('JOIN_ROOM', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);
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
      name: playerName || 'Giocatore 2',
      ships: null,
      board: null,
      ready: false,
    });
    socket.join(roomCode);
    currentRoom = roomCode;

    socket.emit('ROOM_JOINED', { roomCode, playerId: 1, opponentName: room.players[0].name });
    // Notify host
    io.to(room.players[0].id).emit('OPPONENT_JOINED', { opponentName: playerName || 'Giocatore 2' });

    // Start placement phase
    room.phase = 'placement';
    io.to(roomCode).emit('PHASE_CHANGE', { phase: 'placement' });
    console.log(`[ROOM] ${playerName} entra in stanza ${roomCode}`);
  });

  // Place ships
  socket.on('PLACE_SHIPS', ({ ships }) => {
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

    socket.emit('SHIPS_ACCEPTED');
    console.log(`[ROOM ${currentRoom}] Giocatore ${pi} ha piazzato le navi`);

    // Check if both ready
    if (room.players.every(p => p.ready)) {
      room.phase = 'battle';
      room.turn = 0; // Player 0 starts
      io.to(roomCode).emit('PHASE_CHANGE', { phase: 'battle' });
      io.to(room.players[0].id).emit('YOUR_TURN');
      io.to(room.players[1].id).emit('ENEMY_TURN');
      console.log(`[ROOM ${currentRoom}] Battaglia iniziata!`);
    } else {
      socket.emit('WAITING_OPPONENT', { message: 'In attesa che l\'avversario piazzi le navi...' });
    }
  });

  // Fire
  socket.on('FIRE', ({ row, col }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.phase !== 'battle') return;

    const pi = room.players.findIndex(p => p.id === socket.id);
    if (pi === -1 || pi !== room.turn) {
      socket.emit('ERROR', { message: 'Non è il tuo turno!' });
      return;
    }

    const opIdx = 1 - pi;
    const opBoard = room.players[opIdx].board;
    const opShips = room.players[opIdx].ships;

    if (row < 0 || row >= 10 || col < 0 || col >= 10) {
      socket.emit('ERROR', { message: 'Coordinate non valide!' });
      return;
    }
    if (opBoard[row][col].hit) {
      socket.emit('ERROR', { message: 'Casella già colpita!' });
      return;
    }

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
      console.log(`[ROOM ${currentRoom}] Partita finita! Vince giocatore ${pi}`);
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

    if (room.players.every(p => p.rematch)) {
      // Reset room
      room.players.forEach(p => {
        p.ships = null; p.board = null; p.ready = false; p.rematch = false;
      });
      room.phase = 'placement';
      room.turn = 0;
      room.stats = [{ shots: 0, hits: 0 }, { shots: 0, hits: 0 }];
      io.to(currentRoom).emit('PHASE_CHANGE', { phase: 'placement' });
      console.log(`[ROOM ${currentRoom}] Rivincita!`);
    } else {
      socket.emit('WAITING_OPPONENT', { message: 'In attesa che l\'avversario accetti la rivincita...' });
      const opIdx = 1 - pi;
      io.to(room.players[opIdx].id).emit('REMATCH_REQUEST', {
        message: `${room.players[pi].name} vuole la rivincita!`
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] Disconnesso: ${socket.id}`);
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const pi = room.players.findIndex(p => p.id === socket.id);
        if (pi !== -1) {
          const opIdx = 1 - pi;
          if (room.players[opIdx]) {
            io.to(room.players[opIdx].id).emit('OPPONENT_DISCONNECTED');
          }
        }
        // Clean up room if empty or game was in progress
        if (room.players.length <= 1 || room.phase !== 'over') {
          rooms.delete(currentRoom);
          console.log(`[ROOM] Stanza ${currentRoom} eliminata`);
        }
      }
    }
  });
});

// Clean up stale rooms periodically
setInterval(() => {
  for (const [code, room] of rooms) {
    const sockets = io.sockets.adapter.rooms.get(code);
    if (!sockets || sockets.size === 0) {
      rooms.delete(code);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`\n🚢 BATTAGLIA NAVALE — Server avviato`);
  console.log(`   Porta: ${PORT}`);
  console.log(`   Apri: http://localhost:${PORT}\n`);
});
