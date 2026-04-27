# PIANO DI ANALISI E SVILUPPO — BATTAGLIA NAVALE

## Contesto

Il gioco è una battaglia navale Single Player + Multiplayer (Socket.IO) costruita in Node.js + vanilla JS + Canvas 2D. Il file `index.html` (~624 righe) contiene HTML+CSS+JS inline; il backend `server.js` (~335 righe) è autoritativo. Estetica attuale: pixel art procedurale ispirata Amiga 500.

**Obiettivo**: fixare tutti i bug (critici → minori) e ridisegnare il gioco in chiave "anni 80 magici" — vibe Top Gun, odore di Amiga 600, retrowave/synthwave — con un pizzico di XXI secolo (responsive, accessibilità, micro-interazioni). Backend Socket.IO autoritativo va mantenuto e irrobustito.

## Architettura target

Split modulare leggero in `src/` con `<script type="module">`. ES modules nativi, no bundler, niente dipendenze frontend nuove. Resta nello spirito vanilla. Lo split diventa MUST quando supereremo le ~1200 righe (post redesign). Per la Fase 1+2 (bugfix) restiamo nel singolo file.

```
/home/user/battaglia-navale/
├── index.html        — shell + canvas + ARIA overlay
├── server.js         — backend
├── src/
│   ├── main.js       — bootstrap + game loop
│   ├── state.js      — stato globale
│   ├── palette.js    — palette retrowave
│   ├── audio.js      — synth + pad lo-fi + reverb
│   ├── render/
│   │   ├── background.js  — synthwave grid, sole, montagne, scanlines, CRT
│   │   ├── ships.js       — sprite procedurali + outline neon
│   │   ├── grid.js        — griglia + hit/splash
│   │   └── ui.js          — drawNeonBtn, drawNeonText, copper bars retro
│   ├── scenes/       — title, menu, difficulty, connect, mpWait, placement, battle, gameover, settings
│   ├── ai.js         — AI con shuffle anti-pattern
│   ├── net.js        — Socket.IO wrapper, listener registry one-shot
│   ├── input.js      — mouse, keyboard, touch
│   ├── storage.js    — settings + stats persistenti
│   ├── a11y.js       — aria-live, focus trap, hint keyboard
│   └── responsive.js — layout mobile-first
└── sw.js             — service worker (NICE-TO-HAVE)
```

## Palette finale retrowave/Top Gun/Amiga 600

```
sunset:   #1a0033 → #4b0082 → #b8005c → #ff1f6b → #ff6f3c → #ffd166
neon:     pink #ff10f0, cyan #00ffff, magenta #ff00ff, violet #8a2be2,
          lime #39ff14, amber #ffb000 (Amiga 600 phosphor)
bg:       deep #05010f, night #0a0420
grid:     line #ff10f088, glow #00ffff66
status:   ok #39ff14, warn #ffb000, err #ff3860, info #00ffff (tutti WCAG AA su #05010f)
copper:   #ff1f6b → #ff6f3c → #ffd166 → #b8005c (copper bars retro)
```

## Fasi di lavoro

### Fase 1 — MUST: Bugfix critici lato client
Obiettivo: stabilità prima di qualsiasi redesign.

File: `index.html`.

1. **Bug 1 (race MP turno)** — separare `mpMyTurn` da `mpFireInFlight`; il click setta solo il fire-in-flight, FIRE_RESULT/ERROR lo resettano.
2. **Bug 5 (revealSunkShip robusto)** — guard ulteriore se `cells` o `shipName` mancano.
3. **Bug 6 (memory leak listener)** — `socket.removeAllListeners()` in disconnect; registrare listener una volta sola.
4. **Bug 7 (click multipli single)** — flag `playerFiredThisTurn`, reset in cpuTurn.
5. **Bug 9 (rematch turno)** — `currentTurn='player'` in `initGameBoards`.
6. **Bug 10 (undo Z)** — pulire stato `placedShips` correttamente, blocco se `placementConfirmed`.
7. **Bug 11 (trim room code)** — `.trim().toUpperCase()` lato client.
8. **Bug 12 (cursor)** — cursor dinamico in funzione di scena/turno.
9. **Bug 17 (var inutile)** — rimuovere `mpNextShipSlot`.
10. **Bug 18 (optional chaining)** — `playerShips?.[si]` con guard `findIndex`.
11. **Bug 19 (initAudio safe)** — try/catch.
12. **Bug 8 (AI prevedibile)** — Fisher-Yates `shuffle(aiTargetStack)`.

### Fase 2 — MUST: Bugfix backend
File: `server.js`.

13. **Bug 3 (adiacenza diagonale)** — board ausiliaria con `si`, scan 8 vicini.
14. **Bug 4 (rematch deadlock)** — reset rematch flag su disconnect, `lastActivity` + TTL 30 min.
15. **Bug 11 (sanitize server)** — trim+uppercase room code, trim+max16 char player name.
16. **Bug 15 (console.log toggle)** — `function log()` con `process.env.DEBUG`.
17. **Bug 20 (disconnect race)** — optional chaining `room.players?.[opIdx]?.id`.

### Fase 3 — MUST: Refactor in moduli ES
Split di `index.html` nei moduli `src/*` come da architettura sopra. Niente regressioni di logica. Test smoke: title→menu→placement→battle→gameover.

### Fase 4 — MUST: Estetica retrowave/Top Gun/Amiga 600
- Synthwave grid scrolling in prospettiva
- Sole vettoriale gradient sunset con strisce silhouette
- Montagne triangolari wireframe ciano
- Copper bars retrowave (palette sunset)
- Scanlines reali (pattern multiply overlay)
- CRT vignette + curvature opzionale
- Neon glow su testi (ctx.shadowBlur + doppio drawText)
- Bevel buttons + hover scale 1.04 + press 0.96
- Jet flyby sul TITLE (omaggio Top Gun)
- Star field twinkle
- Crosshair tipo HUD jet
- Tipografia: Press Start 2P (titoli) + VT323 (testi) + Orbitron (numeri)

### Fase 5 — MUST: Audio retrowave
- `startPad()` 3 OscillatorNode sawtooth + lowpass + LFO 0.2Hz
- `makeReverb()` ConvolverNode con IR procedurale
- Routing master/music/sfx separato con gain controllabili
- Tutti gli sfx via send 0.2 → reverb

### Fase 6 — MUST: Responsive mobile-first + touch
- 100dvh, object-fit:contain
- Layout battle ruota in portrait
- Touch tap = click, long-press 500ms in placement = ruota
- Bottoni touch on-screen (ROTATE/RANDOM/CONFIRM/MENU)
- `touch-action:none`

### Fase 7 — MUST: Accessibilità WCAG AA
- `<div role="status" aria-live="polite">` mirror del messageTicker
- Bottoni DOM speculari per Tab navigation (sr-only quando possibile)
- Hint tasti on-screen (toggle `?`)
- Contrasti ≥ 4.5:1 ovunque
- `prefers-reduced-motion` rispettato

### Fase 8 — MUST: AI medium meno prevedibile
- Fisher-Yates su `aiTargetStack`
- 30% di chance di random anche con stack non vuoto

### Fase 9 — NICE-TO-HAVE: Settings + localStorage
- `bn.settings` (volumi, scanlines, crt, reduced motion, lastDifficulty, playerName)
- `bn.stats` (winsSingle, lossesSingle, bestTurns, accuracy)
- Settings raggiungibile da menu (icona ⚙) e Esc durante battle

### Fase 10 — NICE-TO-HAVE: Performance
- Layer statici cached in `OffscreenCanvas`
- `requestIdleCallback` per generazione sprite
- `cancelAnimationFrame` quando `document.hidden`

### Fase 11 — NICE-TO-HAVE: PWA offline single
- Manifest + service worker
- Disabilita pulsante multi quando offline

## Test end-to-end

**Single golden path**: Title → Menu (frecce+Invio) → Difficoltà Hard → Placement (mix H/V, R, random, Z, conferma) → Battle (10+ colpi) → Vittoria → Rivincita → primo turno player.

**Multi golden path**: due tab → CREA + JOIN (con spazio per testare trim) → entrambi piazzano → 20+ colpi → no doppio fuoco → no nave fantasma → game over → rivincita → reset corretto. Disconnect tab B → cleanup tab A.

**Edge**: refresh durante battle, 3o client tenta join, navi diagonalmente adiacenti via client modificato (server rifiuta), mobile portrait touch only, tastiera-only.

## Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Refactor moduli rompe Render.com | ES modules nativi, niente build step |
| Convolver costoso su mobile | Toggle "audio quality low" |
| `shadowBlur` killa FPS | Cap 8px, fallback double-text se reduced-motion |
| Vecchi client cached con nuovo server | Tolleranza 1 deploy, eventualmente `protocolVersion` |
| localStorage disabilitato | try/catch + fallback in-memory |

## Status

- [x] Fase 0: Analisi e architettura
- [x] Fase 1: Bugfix critici client
- [x] Fase 2: Bugfix backend
- [~] Fase 3: Refactor moduli (rimandato — rimasto monolitico per non rompere deploy Render; codice ora ben sezionato)
- [x] Fase 4: Estetica retrowave (synthwave grid, sole, montagne, scanlines, CRT, neon glow, jet flyby, copper retrowave, jet HUD crosshair)
- [x] Fase 5: Audio retrowave (master/music/sfx bus, reverb procedurale, lo-fi pad Am7 con LFO, mute/volumi separati)
- [x] Fase 6: Responsive (visualViewport + dvh + integer scale) + touch (tap, long-press 500ms = ruota nave)
- [x] Fase 7: Accessibilità (aria-live, bottoni DOM speculari focusable, M=mute, Esc=indietro, prefers-reduced-motion, annunci coordinate ABCDEFGHIJ+riga)
- [x] Fase 8: AI shuffle (Fisher-Yates dei vicini iniziali in cpuProcessResult)
- [x] Fase 9: Settings + localStorage (volumi, mute, lastDifficulty, stats: best turns, V/S single+multi)
- [x] Fase 10: Performance (visibility pause, cap esplosioni/splashes a 40, RAF cancel su tab hidden)
- [ ] Fase 11: PWA offline (rimasta NICE-TO-HAVE non urgente)
