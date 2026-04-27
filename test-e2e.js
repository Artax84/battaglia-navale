// E2E smoke test for multiplayer flow.
// Spawns the server, connects 2 clients, plays a deterministic game.
// Asserts: room creation, join, place, turn alternation, sunk/game-over.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3401;
const URL = `http://127.0.0.1:${PORT}`;

const SHIPS_A = [
  { name: 'Portaerei',         cells: [{r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3},{r:0,c:4}] },
  { name: 'Corazzata',         cells: [{r:2,c:0},{r:2,c:1},{r:2,c:2},{r:2,c:3}] },
  { name: 'Incrociatore',      cells: [{r:4,c:0},{r:4,c:1},{r:4,c:2}] },
  { name: 'Sottomarino',       cells: [{r:6,c:0},{r:6,c:1},{r:6,c:2}] },
  { name: 'Cacciatorpediniere',cells: [{r:8,c:0},{r:8,c:1}] },
];
// Player B uses a different layout so coordinates don't overlap meaningfully
const SHIPS_B = [
  { name: 'Portaerei',         cells: [{r:9,c:5},{r:9,c:6},{r:9,c:7},{r:9,c:8},{r:9,c:9}] },
  { name: 'Corazzata',         cells: [{r:7,c:6},{r:7,c:7},{r:7,c:8},{r:7,c:9}] },
  { name: 'Incrociatore',      cells: [{r:5,c:7},{r:5,c:8},{r:5,c:9}] },
  { name: 'Sottomarino',       cells: [{r:3,c:7},{r:3,c:8},{r:3,c:9}] },
  { name: 'Cacciatorpediniere',cells: [{r:1,c:8},{r:1,c:9}] },
];

const log = (...a) => console.log('[e2e]', ...a);
const fail = (msg) => { console.error('[e2e][FAIL]', msg); process.exit(1); };

function deepCellsEqual(a, b) {
  if (a.length !== b.length) return false;
  const key = c => c.r + ',' + c.c;
  const sa = a.map(key).sort().join('|');
  const sb = b.map(key).sort().join('|');
  return sa === sb;
}

function run() {
  return new Promise(async (resolve, reject) => {
    const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT), DEBUG: '0' }, stdio: ['ignore','pipe','pipe'] });
    srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
    srv.stderr.on('data', d => process.stderr.write('[srv-err] ' + d));
    srv.on('exit', c => log('server exit', c));

    // Wait for server to be up
    await new Promise(r => setTimeout(r, 1500));

    const A = io(URL, { reconnection: false });
    const B = io(URL, { reconnection: false });

    let aPlayerId = -1, bPlayerId = -1;
    let aTurn = false, bTurn = false;
    const aResults = [];
    const bResults = [];
    let gameOverSeen = 0;
    let aWinner = null, bWinner = null;

    A.on('connect', () => log('A connected', A.id));
    B.on('connect', () => log('B connected', B.id));
    A.on('connect_error', e => fail('A connect_error: ' + e.message));
    B.on('connect_error', e => fail('B connect_error: ' + e.message));

    A.on('ROOM_CREATED', ({ roomCode, playerId }) => {
      log('A ROOM_CREATED', roomCode, 'pid', playerId);
      aPlayerId = playerId;
      // join with a code that has whitespace to test trim()
      B.emit('JOIN_ROOM', { roomCode: '  ' + roomCode + '  ', playerName: 'PlayerB' });
    });

    B.on('ROOM_JOINED', ({ playerId }) => {
      log('B ROOM_JOINED pid', playerId);
      bPlayerId = playerId;
    });

    let aReady = false, bReady = false;
    function maybeStart() {
      if (aReady && bReady) return; // server triggers PHASE_CHANGE itself
    }
    A.on('PHASE_CHANGE', ({ phase }) => {
      log('A PHASE_CHANGE', phase);
      if (phase === 'placement' && !aReady) { aReady = true; A.emit('PLACE_SHIPS', { ships: SHIPS_A }); }
    });
    B.on('PHASE_CHANGE', ({ phase }) => {
      log('B PHASE_CHANGE', phase);
      if (phase === 'placement' && !bReady) { bReady = true; B.emit('PLACE_SHIPS', { ships: SHIPS_B }); }
    });

    A.on('SHIPS_ACCEPTED', () => log('A SHIPS_ACCEPTED'));
    B.on('SHIPS_ACCEPTED', () => log('B SHIPS_ACCEPTED'));

    A.on('YOUR_TURN', () => { aTurn = true; tryFire('A'); });
    A.on('ENEMY_TURN', () => { aTurn = false; });
    B.on('YOUR_TURN', () => { bTurn = true; tryFire('B'); });
    B.on('ENEMY_TURN', () => { bTurn = false; });

    // A fires deterministically at B's ships in order; B fires at random water (will be slower)
    const aTargets = SHIPS_B.flatMap(s => s.cells.map(({r,c}) => ({r,c})));
    let aIdx = 0;
    // B targets a corner that has no A ship to ensure misses → A wins fast
    const bTargets = (() => {
      const out = []; for (let r=0;r<10;r++) for (let c=5;c<10;c++) out.push({r,c}); return out;
    })();
    let bIdx = 0;

    function tryFire(who) {
      if (gameOverSeen) return;
      if (who === 'A' && aTurn && aIdx < aTargets.length) {
        const t = aTargets[aIdx++];
        A.emit('FIRE', { row: t.r, col: t.c });
      } else if (who === 'B' && bTurn && bIdx < bTargets.length) {
        const t = bTargets[bIdx++];
        B.emit('FIRE', { row: t.r, col: t.c });
      }
    }

    A.on('FIRE_RESULT', r => { aResults.push(r); /* turn continues to next via YOUR_TURN cycle */ });
    B.on('FIRE_RESULT', r => { bResults.push(r); });
    A.on('OPPONENT_FIRED', r => { /* track only */ });
    B.on('OPPONENT_FIRED', r => { });

    A.on('ERROR', e => log('A ERROR', e.message));
    B.on('ERROR', e => log('B ERROR', e.message));

    A.on('GAME_OVER', ({ winner }) => { aWinner = winner; gameOverSeen++; tryFinish(); });
    B.on('GAME_OVER', ({ winner }) => { bWinner = winner; gameOverSeen++; tryFinish(); });

    function tryFinish() {
      if (gameOverSeen < 2) return;
      try {
        // Assertions
        if (aWinner !== true) fail('A should be winner=true, got ' + aWinner);
        if (bWinner !== false) fail('B should be winner=false, got ' + bWinner);
        const aHits = aResults.filter(r => r.result === 'hit' || r.result === 'sunk').length;
        const aSunk = aResults.filter(r => r.result === 'sunk').length;
        const expectedHits = SHIPS_B.reduce((s,sh) => s + sh.cells.length, 0);
        if (aHits !== expectedHits) fail('A expected hits=' + expectedHits + ', got ' + aHits);
        if (aSunk !== SHIPS_B.length) fail('A expected sunk=' + SHIPS_B.length + ', got ' + aSunk);

        // Adjacency rejection test (server-side)
        const C = io(URL, { reconnection: false });
        C.on('connect', () => {
          const D = io(URL, { reconnection: false });
          let dInRoom = false;
          C.on('ROOM_CREATED', ({ roomCode }) => {
            D.on('connect', () => D.emit('JOIN_ROOM', { roomCode, playerName: 'D' }));
          });
          let badShips = JSON.parse(JSON.stringify(SHIPS_A));
          // Make ship 1 diagonally adjacent to ship 0
          badShips[1].cells = [{r:1,c:5},{r:1,c:6},{r:1,c:7},{r:1,c:8}];
          C.on('PHASE_CHANGE', ({ phase }) => {
            if (phase === 'placement') C.emit('PLACE_SHIPS', { ships: badShips });
          });
          let gotError = false;
          C.on('ERROR', e => { gotError = true; log('C got expected ERROR:', e.message); });
          C.emit('CREATE_ROOM', { playerName: 'C' });
          setTimeout(() => {
            if (!gotError) fail('Server accepted diagonally-adjacent ships (should reject)');
            log('OK adjacency rejection works');
            C.disconnect(); D.disconnect();
            cleanup(0);
          }, 1500);
        });
      } catch (e) {
        fail('assertion failed: ' + e.stack);
      }
    }

    function cleanup(code) {
      try { A.disconnect(); B.disconnect(); } catch(e) {}
      setTimeout(() => { try { srv.kill(); } catch(e) {} setTimeout(()=>process.exit(code), 400); }, 400);
    }

    A.emit('CREATE_ROOM', { playerName: 'PlayerA' });

    setTimeout(() => fail('timeout: full e2e did not complete in 30s'), 30000);
  });
}

run();
