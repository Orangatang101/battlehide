import { createContext, useContext, useReducer } from 'react';

const GameCtx = createContext(null);

const init = {
    // Room
    roomCode: null,
    roomStatus: null, // lobby | countdown | active | ended
    modeName: null,
    hostName: null,
    playerCount: 0,
    players: [],     // [{id, name, avatar, color, score, status}]
    rules: null,

    // Self
    myId: null,
    myName: null,
    myRole: null,    // seeker | hider | assassin
    myTeam: null,
    isVIP: false,
    isAlphaSeeker: false,
    isHost: false,
    jammerActive: false,

    // Game
    gameState: null,
    closedZones: [],
    events: [],

    // UI
    countdown: 0,
    blackoutActive: false,
    paranoiaActive: false,
    radarPing: null,     // {sectors, duration}
    bounty: null,        // {targetName, durationSeconds, bonusPoints}
    audioTrapFired: false,
};

function reducer(state, action) {
    switch (action.type) {
        case 'SET_MY_ID': return { ...state, myId: action.payload };
        case 'ROOM_CREATED':
        case 'ROOM_JOINED': return {
            ...state,
            roomCode: action.payload.code,
            roomStatus: action.payload.room?.status || 'lobby',
            modeName: action.payload.room?.modeName || action.payload.room?.rules?.name,
            hostName: action.payload.room?.hostName,
            rules: action.payload.room?.rules,
            myName: action.payload.playerName || state.myName,
            isHost: action.type === 'ROOM_CREATED',
        };
        case 'ROOM_STATE': return {
            ...state,
            roomStatus: action.payload.status,
            modeName: action.payload.modeName,
            hostName: action.payload.hostName,
            playerCount: action.payload.playerCount,
            players: action.payload.players || state.players,
            mapId: action.payload.mapId ?? state.mapId,
            rules: action.payload.rules || state.rules,
        };
        case 'RULES_UPDATE': return { ...state, rules: action.payload };
        case 'ROLE_ASSIGNED': return {
            ...state,
            myRole: action.payload.role,
            myTeam: action.payload.teamName,
            isVIP: action.payload.isVIP || false,
            isAlphaSeeker: action.payload.isAlphaSeeker || false,
            rules: action.payload.modeRules || state.rules,
            countdown: action.payload.countdown || 60,
        };
        case 'GAME_COUNTDOWN': return { ...state, countdown: action.payload.seconds };
        case 'GAME_START': return {
            ...state,
            roomStatus: 'active',
            gameState: action.payload.gameState,
            closedZones: [],
            events: [],
            countdown: 0,
        };
        case 'GAME_ENDED': return {
            ...state,
            roomStatus: 'ended',
            players: action.payload.scoreboard || state.players,
        };
        case 'ZONE_CLOSED': return { ...state, closedZones: [...state.closedZones, action.payload.zoneId] };
        case 'EVENT': return { ...state, events: [action.payload, ...state.events].slice(0, 50) };
        case 'BLACKOUT_START': return { ...state, blackoutActive: true };
        case 'BLACKOUT_END': return { ...state, blackoutActive: false };
        case 'PARANOIA_TRIGGER': return { ...state, paranoiaActive: true };
        case 'PARANOIA_CLEAR': return { ...state, paranoiaActive: false };
        case 'RADAR_PING': return { ...state, radarPing: action.payload };
        case 'RADAR_CLEAR': return { ...state, radarPing: null };
        case 'BOUNTY_NEW': return { ...state, bounty: action.payload };
        case 'BOUNTY_CLEAR': return { ...state, bounty: null };
        case 'AUDIO_TRAP': return { ...state, audioTrapFired: true, audioTrapData: action.payload };
        case 'AUDIO_TRAP_CLEAR': return { ...state, audioTrapFired: false, audioTrapData: null };
        case 'COMPASS_UPDATE': return { ...state, compass: action.payload };
        case 'COMPASS_CLEAR': return { ...state, compass: null };
        case 'JAMMER_ACTIVATED': return { ...state, jammerActive: true };
        case 'JAMMER_CLEAR': return { ...state, jammerActive: false };
        case 'SET_HOST': return { ...state, isHost: action.payload };
        case 'SET_ROOM': return {
            ...state,
            roomCode: action.payload.code,
            roomStatus: action.payload.status || 'lobby',
            modeName: action.payload.modeName || action.payload.rules?.name,
            hostName: action.payload.hostName,
            rules: action.payload.rules,
        };
        case 'RESET': return { ...init };
        default: return state;
    }
}

export function GameProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, init);
    return <GameCtx.Provider value={{ state, dispatch }}>{children}</GameCtx.Provider>;
}

export const useGame = () => useContext(GameCtx);
