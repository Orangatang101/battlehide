const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameEngine } = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
});

const engine = new GameEngine(io);

// ─── Serve static React build ────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use(express.json());

// API: health check
app.get('/api/health', (req, res) => res.json({ ok: true, rooms: engine.rooms.size }));

// API: check room exists (for pre-join validation)
app.get('/api/room/:code', (req, res) => {
    const room = engine.getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    res.json({
        code: room.code,
        status: room.status,
        playerCount: room.players.size,
        mode: room.mode,
        modeName: room.rules.name,
        hostName: room.hostName,
    });
});

// Catch-all → serve React app
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Socket.io Events ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // ── Create Room
    socket.on('room:create', ({ hostName }, cb) => {
        const room = engine.createRoom(socket.id, hostName);
        socket.join(room.code);
        const player = {
            id: socket.id,
            name: hostName,
            avatar: '👑',
            color: '#f59e0b',
            role: null,
            status: 'alive',
            score: 0,
            isVIP: false,
            isHost: true,
            jammerActive: false,
            jammerExpiry: null,
            lastPosition: null,
            lastMoveTime: Date.now(),
        };
        room.players.set(socket.id, player);
        cb({ ok: true, code: room.code, room: { code: room.code, status: room.status, mode: room.mode, rules: room.rules } });
        engine._broadcastRoomState(room.code);
    });

    // ── Join Room
    socket.on('room:join', ({ code, playerName }, cb) => {
        const result = engine.joinRoom(code, socket.id, playerName);
        if (result.error) return cb({ error: result.error });
        socket.join(result.room.code);
        cb({
            ok: true,
            code: result.room.code,
            player: result.player,
            room: {
                code: result.room.code,
                status: result.room.status,
                mode: result.room.mode,
                rules: result.room.rules,
                hostName: result.room.hostName,
            },
        });
        engine._broadcastRoomState(result.room.code);
    });

    // ── Set Game Mode
    socket.on('room:setMode', ({ code, modeId }) => {
        const room = engine.getRoom(code);
        if (room?.hostSocketId !== socket.id) return;
        engine.setMode(code, modeId);
    });

    // ── Update Rules
    socket.on('room:updateRules', ({ code, patch }) => {
        const room = engine.getRoom(code);
        if (room?.hostSocketId !== socket.id) return;
        engine.updateRules(code, patch);
    });

    // ── Start Game
    socket.on('game:start', ({ code }, cb) => {
        const room = engine.getRoom(code);
        if (room?.hostSocketId !== socket.id) return cb?.({ error: 'Not the host.' });
        const result = engine.startGame(code);
        if (result.error) return cb?.({ error: result.error });
        cb?.({ ok: true });
    });

    // ── Tag Player
    socket.on('player:tag', ({ code, targetId }) => {
        engine.tagPlayer(code, socket.id, targetId);
    });

    // ── Jailbreak
    socket.on('jailbreak:trigger', ({ code }) => {
        engine.jailbreak(code, socket.id);
    });

    // ── Redeem Cache
    socket.on('cache:redeem', ({ code, cacheCode }, cb) => {
        const result = engine.redeemCache(code, socket.id, cacheCode);
        cb?.(result);
    });

    // ── Blackout
    socket.on('blackout:use', ({ code }) => {
        engine.useBlackout(code, socket.id);
    });

    // ── Position Update
    socket.on('player:position', ({ code, position }) => {
        engine.updatePosition(code, socket.id, position);
    });

    // ── Paranoia cleared (player moved)
    socket.on('paranoia:moved', ({ code }) => {
        const room = engine.getRoom(code);
        if (!room) return;
        const p = room.players.get(socket.id);
        if (p) { p.lastMoveTime = Date.now(); room.players.set(socket.id, p); }
    });

    // ── End Game (host only)
    socket.on('game:end', ({ code }) => {
        const room = engine.getRoom(code);
        if (room?.hostSocketId !== socket.id) return;
        engine.endGame(code, 'host_ended');
    });

    // ── Kick Player (host only)
    socket.on('player:kick', ({ code, playerId }) => {
        const room = engine.getRoom(code);
        if (room?.hostSocketId !== socket.id) return;
        const target = room.players.get(playerId);
        if (!target) return;
        room.players.delete(playerId);
        io.to(playerId).emit('kicked', { message: 'You were removed by the host.' });
        io.sockets.sockets.get(playerId)?.leave(code);
        engine._broadcastRoomState(code);
    });

    // ── Disconnect
    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        const result = engine.removePlayer(socket.id);
        if (result?.code) {
            engine._broadcastRoomState(result.code);
        }
    });

    // ── Ping/Pong keepalive
    socket.on('ping', (cb) => cb?.());
});

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 BattleHide server running on port ${PORT}`);
});
