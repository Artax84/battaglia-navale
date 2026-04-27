# 🚢 BATTAGLIA NAVALE

**© Girolamo Artale** — Retrowave Edition

Gioco della Battaglia Navale in stile anni 80 (synthwave + Top Gun + Amiga 600).
Giocatore Singolo contro CPU (3 livelli di difficoltà) + Multiplayer online.

## 🚀 GIOCA SUBITO (1 click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Artax84/battaglia-navale)

Clicca il pulsante qui sopra → login con GitHub → **Apply** → attendi ~2 minuti
→ Render ti dà un URL pubblico tipo `https://battaglia-navale-xxxx.onrender.com`.
Quello è il tuo gioco: aprilo e gioca, condividilo per il multiplayer.

---

## 🎮 COME GIOCARE IN LOCALE

1. Installa Node.js da https://nodejs.org (scarica la versione LTS)
2. Apri il terminale nella cartella del gioco
3. Esegui:
   ```
   npm install
   npm start
   ```
4. Apri il browser su: **http://localhost:3000**

---

## 🌐 COME METTERE ONLINE (GRATIS) — Render.com

Il repo include un **Blueprint** (`render.yaml`) che configura tutto automaticamente.

1. Vai su https://render.com e accedi con GitHub
2. **New +** → **Blueprint**
3. Seleziona il repo `battaglia-navale` (o incolla l'URL)
4. Render legge `render.yaml` e crea il servizio (free tier, Node 20)
5. **Apply** → primo build ~2 min → ti dà un URL pubblico

Da quel momento ogni `git push` su `main` rideploya automaticamente.

> **Nota free tier**: il servizio dorme dopo ~15 min senza traffico. La prima richiesta dopo il sonno impiega ~30 s a svegliarlo.

### Passo 3: Gioca!
- Render ti darà un indirizzo tipo: `https://battaglia-navale-xxxx.onrender.com`
- Manda questo link al tuo amico
- Tu crei una partita → ricevi un codice (es. 0001)
- Il tuo amico entra e inserisce il codice
- Si gioca!

---

## 📁 STRUTTURA FILE

```
battaglia-navale/
├── server.js          ← Server Node.js + Socket.IO
├── package.json       ← Dipendenze
├── README.md          ← Questo file
└── public/
    └── index.html     ← Il gioco (client)
```

---

## 🎯 FUNZIONALITÀ

- **Giocatore Singolo** vs CPU con 3 livelli di difficoltà
- **Multiplayer** online via WebSocket
- Grafica pixel art stile **Amiga 500** con copper bars e scanlines
- Navi dettagliate renderizzate proceduralmente
- Effetti sonori chiptune
- Animazioni di esplosione, splash, fumo
- Statistiche a fine partita

---

*© Girolamo Artale — Tutti i diritti riservati*
