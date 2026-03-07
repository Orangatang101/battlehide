// gameEngine.js — Core game state and mechanics engine
const { GAME_MODES } = require('./gameModes');

class GameEngine {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode => roomState
    }

    // ─── Room Management ────────────────────────────────────────────────────────

    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    createRoom(hostSocketId, hostName) {
        let code;
        do { code = this.generateCode(); } while (this.rooms.has(code));

        const room = {
            code,
            hostSocketId,
            hostName,
            status: 'lobby', // lobby | countdown | active | ended
            mode: 'hideAndSeek',
            rules: JSON.parse(JSON.stringify(GAME_MODES.hideAndSeek)),
            players: new Map(), // socketId => player
            gameState: null,
            timers: [],
            createdAt: Date.now(),
        };

        this.rooms.set(code, room);
        return room;
    }

    joinRoom(code, socketId, playerName) {
        const room = this.rooms.get(code.toUpperCase());
        if (!room) return { error: 'Room not found. Check the code and try again.' };
        if (room.status !== 'lobby') return { error: 'Game already in progress.' };
        if (room.players.size >= 25) return { error: 'Room is full (max 25 players).' };
        if ([...room.players.values()].some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            return { error: 'Name already taken. Choose a different name.' };
        }

        const player = {
            id: socketId,
            name: playerName,
            avatar: this._randomAvatar(),
            color: this._randomColor([...room.players.values()].map(p => p.color)),
            role: null, // assigned at game start
            status: 'alive', // alive | caught | jailed | spectating
            score: 0,
            isVIP: false,
            isTraitor: false,
            isAssassin: false,
            jammerActive: false,
            jammerExpiry: null,
            lastPosition: null,
            lastMoveTime: Date.now(),
            joinedAt: Date.now(),
        };

        room.players.set(socketId, player);
        return { ok: true, room, player };
    }

    removePlayer(socketId) {
        for (const [code, room] of this.rooms) {
            if (room.players.has(socketId)) {
                const wasHost = room.hostSocketId === socketId;
                room.players.delete(socketId);

                if (wasHost && room.players.size > 0) {
                    // Promote next player to host
                    const newHostId = room.players.keys().next().value;
                    room.hostSocketId = newHostId;
                    room.players.get(newHostId).isHost = true;
                    this.io.to(newHostId).emit('promoted:host', { message: 'You are now the host.' });
                }

                if (room.players.size === 0) {
                    this._clearTimers(room);
                    this.rooms.delete(code);
                } else {
                    this._broadcastRoomState(code);
                }
                return { code, wasHost };
            }
        }
        return null;
    }

    setMode(code, modeId) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'lobby') return;
        const base = GAME_MODES[modeId];
        if (!base) return;
        room.mode = modeId;
        room.rules = JSON.parse(JSON.stringify(base));
        this._broadcastRoomState(code);
    }

    updateRules(code, patch) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'lobby') return;
        this._deepMerge(room.rules, patch);
        this._broadcastRoomState(code);
    }

    // ─── Game Start ─────────────────────────────────────────────────────────────

    startGame(code) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'lobby') return { error: 'Cannot start.' };
        if (room.players.size < 2) return { error: 'Need at least 2 players.' };

        room.status = 'countdown';
        this._assignRoles(room);
        this._broadcastRoles(room);

        // Countdown then start
        const countdown = room.rules.countdownTime || 60;
        this.io.to(room.code).emit('game:countdown', { seconds: countdown });

        const t = setTimeout(() => {
            room.status = 'active';
            room.gameState = {
                startTime: Date.now(),
                duration: (room.rules.gameDuration || 15) * 60 * 1000,
                zones: this._buildZones(room),
                activeZones: [],
                closedZones: [],
                bountyTarget: null,
                bountyExpiry: null,
                blackoutActive: false,
                blackoutUsed: false,
                jailedPlayers: new Set(),
                events: [],
            };

            this.io.to(room.code).emit('game:start', {
                gameState: this._serializeGameState(room),
            });
            this._startGameTimers(room);
        }, countdown * 1000);

        room.timers.push(t);
        return { ok: true };
    }

    // ─── Role Assignment ─────────────────────────────────────────────────────────

    _assignRoles(room) {
        const players = [...room.players.values()];
        const seekerCount = Math.min(
            room.rules.defaultSeekerCount || 2,
            Math.floor(players.length / 2),
        );

        // Shuffle
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        const seekerTeamName = room.rules.teamNames?.seekers || 'Seekers';
        const hiderTeamName = room.rules.teamNames?.hiders || 'Hiders';

        players.forEach((p, i) => {
            p.role = i < seekerCount ? 'seeker' : 'hider';
            p.teamName = p.role === 'seeker' ? seekerTeamName : hiderTeamName;
            p.isAlphaSeeker = i === 0; // first seeker is Alpha
        });

        // Assassin class
        if (room.rules.features?.assassinClass?.enabled) {
            const hiders = players.filter(p => p.role === 'hider');
            if (hiders.length > 1) {
                const assassin = hiders[Math.floor(Math.random() * hiders.length)];
                assassin.role = 'assassin';
                assassin.teamName = 'Assassin';
            }
        }

        // VIP Escort
        if (room.rules.features?.vipEscort?.enabled) {
            const hiders = players.filter(p => p.role === 'hider');
            if (hiders.length > 1) {
                const nonAssassin = hiders.filter(p => p.role === 'hider');
                if (nonAssassin.length > 0) {
                    nonAssassin[Math.floor(Math.random() * nonAssassin.length)].isVIP = true;
                }
            }
        }

        // Update map
        players.forEach(p => room.players.set(p.id, p));
    }

    _broadcastRoles(room) {
        for (const [socketId, player] of room.players) {
            const isHost = socketId === room.hostSocketId;
            this.io.to(socketId).emit('role:assigned', {
                role: player.role,
                teamName: player.teamName,
                isVIP: player.isVIP,
                isAlphaSeeker: player.isAlphaSeeker || false,
                isHost,
                countdown: room.rules.countdownTime || 60,
                modeRules: room.rules,
            });
        }

        // Send full player list to host
        this.io.to(room.hostSocketId).emit('players:full', {
            players: [...room.players.values()].map(p => this._sanitizePlayer(p, true)),
        });
    }

    // ─── Game Timers ─────────────────────────────────────────────────────────────

    _startGameTimers(room) {
        const gs = room.gameState;
        const feat = room.rules.features || {};

        // ── Game end timer
        const endTimer = setTimeout(() => this.endGame(room.code, 'timeout'), gs.duration);
        room.timers.push(endTimer);

        // ── Shrinking Zone
        if (feat.shrinkingZone?.enabled && gs.zones.length > 0) {
            const intervalMs = (feat.shrinkingZone.intervalMinutes || 5) * 60 * 1000;
            let zoneIndex = 0;
            const zoneTimer = setInterval(() => {
                if (room.status !== 'active' || zoneIndex >= gs.zones.length) return;
                const zone = gs.zones[zoneIndex++];
                gs.closedZones.push(zone.id);

                // Warning first
                this.io.to(room.code).emit('zone:warning', {
                    zoneId: zone.id,
                    zoneName: zone.name,
                    secondsUntilClose: feat.shrinkingZone.warningSeconds || 30,
                });

                setTimeout(() => {
                    this.io.to(room.code).emit('zone:closed', { zoneId: zone.id, zoneName: zone.name });
                    this._broadcastEvent(room, `⚠️ ${zone.name} is now a DEAD ZONE`, 'danger');
                }, (feat.shrinkingZone.warningSeconds || 30) * 1000);
            }, intervalMs);
            room.timers.push(zoneTimer);
        }

        // ── Location Pings
        if (feat.locationPings?.enabled) {
            const intervalMs = (feat.locationPings.intervalMinutes || 5) * 60 * 1000;
            const pingTimer = setInterval(() => {
                if (room.status !== 'active') return;
                const hiders = [...room.players.values()].filter(p =>
                    (p.role === 'hider' || p.role === 'assassin') && p.status === 'alive',
                );
                if (hiders.length === 0) return;

                // Pick a random sector from alive hiders
                const sectors = [...new Set(hiders.map(p => p.lastPosition?.sector).filter(Boolean))];
                const pingData = sectors.length > 0
                    ? { sectors, duration: feat.locationPings.durationSeconds || 10 }
                    : { sectors: ['Unknown Sector'], duration: feat.locationPings.durationSeconds || 10 };

                // Send only to seekers
                for (const [sid, p] of room.players) {
                    if (p.role === 'seeker') {
                        this.io.to(sid).emit('ping:location', pingData);
                    }
                }
                this._broadcastEvent(room, '📡 Location ping active for 10 seconds!', 'warning');
            }, intervalMs);
            room.timers.push(pingTimer);
        }

        // ── Audio Trap
        if (feat.audioTrap?.enabled) {
            const scheduleAudioTrap = () => {
                if (room.status !== 'active') return;
                const base = (feat.audioTrap.intervalMinutes || 3) * 60 * 1000;
                const variance = (feat.audioTrap.randomVarianceMinutes || 2) * 60 * 1000;
                const delay = base + (Math.random() * variance - variance / 2);

                const t = setTimeout(() => {
                    if (room.status !== 'active') return;
                    // Pick a random alive hider to ping
                    const hiders = [...room.players.values()].filter(p =>
                        (p.role === 'hider' || p.role === 'assassin') && p.status === 'alive',
                    );
                    if (hiders.length > 0) {
                        const target = hiders[Math.floor(Math.random() * hiders.length)];
                        this.io.to(target.id).emit('audio:trap', { play: true });
                    }
                    scheduleAudioTrap();
                }, delay);
                room.timers.push(t);
            };
            scheduleAudioTrap();
        }

        // ── Traitor Mechanic
        if (feat.traitorMechanic?.enabled) {
            const activateMs = (feat.traitorMechanic.activateAtMinute || 8) * 60 * 1000;
            const traitorTimer = setTimeout(() => {
                if (room.status !== 'active') return;
                const hiders = [...room.players.values()].filter(p =>
                    p.role === 'hider' && p.status === 'alive' && !p.isVIP,
                );
                if (hiders.length < 2) return;

                const traitor = hiders[Math.floor(Math.random() * hiders.length)];
                traitor.role = 'seeker';
                traitor.isTraitor = true;
                room.players.set(traitor.id, traitor);

                this.io.to(traitor.id).emit('traitor:activated', {
                    message: 'You are now a TRAITOR. Switch to the Hunter team. Others do not know.',
                });
                this._broadcastEvent(room, '🕵️ A traitor has been activated among the hiders!', 'danger');
            }, activateMs);
            room.timers.push(traitorTimer);
        }

        // ── Bounty Contracts
        if (feat.bountyContracts?.enabled) {
            const bountyTimer = setInterval(() => {
                if (room.status !== 'active') return;
                const hiders = [...room.players.values()].filter(p =>
                    (p.role === 'hider' || p.role === 'assassin') && p.status === 'alive',
                );
                if (hiders.length === 0) return;

                const target = hiders[Math.floor(Math.random() * hiders.length)];
                const durationMs = (feat.bountyContracts.bountyDurationMinutes || 3) * 60 * 1000;
                gs.bountyTarget = target.id;
                gs.bountyExpiry = Date.now() + durationMs;

                this.io.to(room.code).emit('bounty:new', {
                    targetName: target.name,
                    targetId: target.id,
                    durationSeconds: (feat.bountyContracts.bountyDurationMinutes || 3) * 60,
                    bonusPoints: feat.bountyContracts.bountyPoints || 200,
                });
                this._broadcastEvent(room, `🎯 BOUNTY on ${target.name}! Catch them for bonus points!`, 'warning');

                setTimeout(() => {
                    if (gs.bountyTarget === target.id) {
                        gs.bountyTarget = null;
                        gs.bountyExpiry = null;
                        this.io.to(room.code).emit('bounty:expired', { targetName: target.name });
                    }
                }, durationMs);
            }, 8 * 60 * 1000); // Every 8 min
            room.timers.push(bountyTimer);
        }

        // ── Paranoia Timer check (every 30 seconds)
        if (feat.paranoiaTimer?.enabled) {
            const paranoiaMs = (feat.paranoiaTimer.stillnessMinutes || 4) * 60 * 1000;
            const paranoiaCheck = setInterval(() => {
                if (room.status !== 'active') return;
                const now = Date.now();
                for (const [sid, p] of room.players) {
                    if ((p.role === 'hider' || p.role === 'assassin') && p.status === 'alive') {
                        if (now - p.lastMoveTime > paranoiaMs) {
                            this.io.to(sid).emit('paranoia:triggered', {
                                requiredFeet: feat.paranoiaTimer.requiredMovementFeet || 30,
                            });
                        }
                    }
                }
            }, 30 * 1000);
            room.timers.push(paranoiaCheck);
        }

        // ── Supply Cache codes (generate at start)
        if (feat.supplyCaches?.enabled) {
            gs.cacheCodes = this._generateCacheCodes(feat.supplyCaches.cacheCount || 3);
            this.io.to(room.code).emit('caches:revealed', { codes: gs.cacheCodes });
        }
    }

    // ─── Player Actions ──────────────────────────────────────────────────────────

    tagPlayer(code, taggerId, targetId) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'active') return;
        const tagger = room.players.get(taggerId);
        const target = room.players.get(targetId);
        if (!tagger || !target) return;
        if (tagger.role !== 'seeker') return;
        if (target.status !== 'alive') return;
        if (target.jammerActive && Date.now() < target.jammerExpiry) {
            this.io.to(taggerId).emit('tag:blocked', { targetName: target.name, reason: 'Jammer active!' });
            return;
        }

        const gs = room.gameState;
        const feat = room.rules.features || {};

        // Check assassin kill
        if (target.role === 'assassin') {
            // Assassin can tag Alpha Seeker
            if (tagger.isAlphaSeeker) {
                this._assassinKillEvent(room, target, tagger);
                return;
            }
        }

        // Bounty bonus
        if (gs.bountyTarget === targetId) {
            tagger.score += (feat.bountyContracts?.bountyPoints || 200);
            gs.bountyTarget = null;
            this.io.to(room.code).emit('bounty:claimed', { taggerName: tagger.name, targetName: target.name });
        }

        // Tag
        tagger.score += room.rules.scoring?.seekerCatchBonus || 50;

        if (feat.jailbreakTerminals?.enabled) {
            target.status = 'jailed';
            gs.jailedPlayers.add(targetId);
            this.io.to(room.code).emit('player:jailed', { playerName: target.name });
            this._broadcastEvent(room, `🔒 ${target.name} has been caught and jailed!`, 'info');
        } else {
            target.status = 'caught';
            if (room.mode === 'infection') {
                target.role = 'seeker'; // Infection spreads
                target.teamName = room.rules.teamNames?.seekers || 'Infected';
                this.io.to(targetId).emit('role:assigned', {
                    role: 'seeker', teamName: target.teamName, isVIP: false, isAlphaSeeker: false,
                });
                this._broadcastEvent(room, `🦠 ${target.name} is now INFECTED!`, 'danger');
            } else {
                this.io.to(targetId).emit('player:caught', { message: 'You have been caught! You are now a spectator.' });
                this._broadcastEvent(room, `💥 ${target.name} has been tagged!`, 'info');
            }
        }

        room.players.set(targetId, target);
        room.players.set(taggerId, tagger);
        this._broadcastRoomState(code);
        this._checkWinCondition(room);
    }

    jailbreak(code, rescuerId) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'active') return;
        const gs = room.gameState;
        const feat = room.rules.features?.jailbreakTerminals;
        if (!feat?.enabled) return;

        const rescuer = room.players.get(rescuerId);
        if (!rescuer || rescuer.role === 'seeker' || rescuer.status !== 'alive') return;

        const freed = [...gs.jailedPlayers];
        gs.jailedPlayers.clear();
        freed.forEach(pid => {
            const p = room.players.get(pid);
            if (p) {
                p.status = 'alive';
                room.players.set(pid, p);
                this.io.to(pid).emit('jailbreak:freed', { rescuerName: rescuer.name });
            }
        });

        rescuer.score += room.rules.scoring?.jailbreakBonus || 75;
        room.players.set(rescuerId, rescuer);
        this.io.to(room.code).emit('jailbreak:success', { rescuerName: rescuer.name, freedCount: freed.length });
        this._broadcastEvent(room, `🔓 ${rescuer.name} triggered a JAILBREAK! ${freed.length} player(s) freed!`, 'success');
        this._broadcastRoomState(code);
    }

    redeemCache(code, playerId, inputCode) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'active') return { error: 'No active game.' };
        const gs = room.gameState;
        const feat = room.rules.features?.supplyCaches;
        if (!feat?.enabled) return { error: 'Supply caches not enabled.' };

        const cache = gs.cacheCodes?.find(c => c.code === inputCode && !c.claimed);
        if (!cache) return { error: 'Invalid or already claimed cache code.' };

        cache.claimed = true;
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found.' };

        player.jammerActive = true;
        player.jammerExpiry = Date.now() + (feat.jammerDurationSeconds || 60) * 1000;
        room.players.set(playerId, player);

        this.io.to(playerId).emit('jammer:activated', { durationSeconds: feat.jammerDurationSeconds || 60 });
        this._broadcastEvent(room, `📦 ${player.name} opened a supply cache and activated a Jammer!`, 'success');
        return { ok: true };
    }

    useBlackout(code, playerId) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'active') return;
        const gs = room.gameState;
        if (gs.blackoutUsed) return;
        const player = room.players.get(playerId);
        if (!player?.isAlphaSeeker) return;

        gs.blackoutActive = true;
        gs.blackoutUsed = true;
        const feat = room.rules.features?.blackoutProtocol;
        const duration = (feat?.durationSeconds || 60) * 1000;

        this.io.to(room.code).emit('blackout:start', { duration: feat?.durationSeconds || 60 });
        this._broadcastEvent(room, '🌑 BLACKOUT PROTOCOL ACTIVATED! 60 seconds of darkness!', 'danger');

        setTimeout(() => {
            gs.blackoutActive = false;
            this.io.to(room.code).emit('blackout:end', {});
            this._broadcastEvent(room, '💡 Blackout ended. Normal operations resumed.', 'info');
        }, duration);
    }

    updatePosition(code, playerId, positionData) {
        const room = this.rooms.get(code);
        if (!room || room.status !== 'active') return;
        const player = room.players.get(playerId);
        if (!player) return;
        player.lastPosition = positionData;
        player.lastMoveTime = Date.now();
        room.players.set(playerId, player);
    }

    // ─── Assassin Kill ────────────────────────────────────────────────────────

    _assassinKillEvent(room, assassin, alphaSeeker) {
        // Reset seeker team
        for (const [sid, p] of room.players) {
            if (p.role === 'seeker') {
                p.role = 'hider';
                p.teamName = room.rules.teamNames?.hiders || 'Hiders';
                p.isAlphaSeeker = false;
                room.players.set(sid, p);
                this.io.to(sid).emit('role:assigned', { role: 'hider', teamName: p.teamName });
            }
        }
        assassin.score += 300;
        room.players.set(assassin.id, assassin);
        this.io.to(room.code).emit('assassin:kill', { assassinName: assassin.name });
        this._broadcastEvent(room, `⚡ ASSASSIN ${assassin.name} eliminated the Alpha Seeker! GAME RESET!`, 'danger');
        this._broadcastRoomState(room.code);
    }

    // ─── Win Condition ────────────────────────────────────────────────────────

    _checkWinCondition(room) {
        const players = [...room.players.values()];
        const aliveHiders = players.filter(p =>
            (p.role === 'hider' || p.role === 'assassin') && p.status === 'alive',
        );
        const aliveInfected = players.filter(p => p.role === 'seeker' && p.status === 'alive');

        if (aliveHiders.length === 0) {
            this.endGame(room.code, 'seekers_win');
        } else if (room.mode === 'infection' && aliveInfected.length === 0) {
            this.endGame(room.code, 'hiders_win');
        }
    }

    endGame(code, reason) {
        const room = this.rooms.get(code);
        if (!room || room.status === 'ended') return;
        room.status = 'ended';
        this._clearTimers(room);

        const players = [...room.players.values()];
        // Final survival bonus
        if (room.gameState) {
            const elapsed = (Date.now() - room.gameState.startTime) / 1000 / 60;
            players.forEach(p => {
                if ((p.role === 'hider' || p.role === 'assassin') && p.status === 'alive') {
                    p.score += Math.floor(elapsed * (room.rules.scoring?.hiderSurvivalBonus || 10));
                }
            });
        }

        const sorted = players.sort((a, b) => b.score - a.score);
        const winnerTeam = reason === 'seekers_win'
            ? (room.rules.teamNames?.seekers || 'Seekers')
            : reason === 'hiders_win'
                ? (room.rules.teamNames?.hiders || 'Hiders')
                : 'Draw';

        this.io.to(code).emit('game:ended', {
            reason,
            winnerTeam,
            scoreboard: sorted.map(p => this._sanitizePlayer(p, true)),
            duration: room.gameState ? Math.floor((Date.now() - room.gameState.startTime) / 1000) : 0,
        });
        this._broadcastRoomState(code);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _buildZones(room) {
        const count = room.rules.features?.shrinkingZone?.enabled ? 6 : 0;
        const names = ['North Wing', 'South Wing', 'East Wing', 'West Wing', 'Upper Floor', 'Central Hub'];
        return Array.from({ length: count }, (_, i) => ({
            id: `zone_${i}`,
            name: names[i] || `Zone ${i + 1}`,
            active: true,
        }));
    }

    _generateCacheCodes(count) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            codes.push({
                id: `cache_${i + 1}`,
                code: String(Math.floor(100 + Math.random() * 900)),
                claimed: false,
                location: `Cache #${i + 1}`,
            });
        }
        return codes;
    }

    _broadcastRoomState(code) {
        const room = this.rooms.get(code);
        if (!room) return;
        this.io.to(code).emit('room:state', {
            code: room.code,
            hostName: room.hostName,
            status: room.status,
            mode: room.mode,
            modeName: room.rules.name,
            playerCount: room.players.size,
            players: [...room.players.values()].map(p => this._sanitizePlayer(p, false)),
        });
    }

    _broadcastEvent(room, message, type = 'info') {
        const event = { id: Date.now(), message, type, timestamp: new Date().toISOString() };
        if (room.gameState) room.gameState.events.push(event);
        this.io.to(room.code).emit('game:event', event);
    }

    _serializeGameState(room) {
        const gs = room.gameState;
        return {
            startTime: gs.startTime,
            duration: gs.duration,
            zones: gs.zones,
            closedZones: gs.closedZones,
            blackoutActive: gs.blackoutActive,
            blackoutUsed: gs.blackoutUsed,
            bountyTarget: gs.bountyTarget,
            cacheCodes: gs.cacheCodes || [],
        };
    }

    _sanitizePlayer(p, includeRole = false) {
        return {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            color: p.color,
            score: p.score,
            status: p.status,
            ...(includeRole ? { role: p.role, teamName: p.teamName, isVIP: p.isVIP, isAlphaSeeker: p.isAlphaSeeker } : {}),
        };
    }

    _clearTimers(room) {
        room.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
        room.timers = [];
    }

    _randomAvatar() {
        const avatars = ['🐺', '🦊', '🐻', '🐯', '🦁', '🐸', '🦅', '🐲', '🦇', '🕷️', '🦂', '🐍'];
        return avatars[Math.floor(Math.random() * avatars.length)];
    }

    _randomColor(usedColors) {
        const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6'];
        const available = palette.filter(c => !usedColors.includes(c));
        const pool = available.length > 0 ? available : palette;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this._deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    getRoomForPlayer(socketId) {
        for (const [code, room] of this.rooms) {
            if (room.players.has(socketId)) return { code, room };
        }
        return null;
    }

    getRoom(code) {
        return this.rooms.get(code?.toUpperCase());
    }
}

module.exports = { GameEngine };
