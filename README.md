# 🚢 BATTAGLIA NAVALE

**© Girolamo Artale**

Gioco della Battaglia Navale con grafica stile Amiga 500.
Giocatore Singolo contro CPU + Multiplayer online.

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

### Passo 1: Crea un account GitHub
- Vai su https://github.com e registrati (gratis)
- Crea un nuovo repository (es. "battaglia-navale")
- Carica tutti i file del progetto nel repository

### Passo 2: Deploy su Render
1. Vai su https://render.com e registrati con GitHub
2. Clicca **"New +"** → **"Web Service"**
3. Collega il tuo repository GitHub
4. Configura:
   - **Name:** battaglia-navale
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Clicca **"Deploy"**

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
