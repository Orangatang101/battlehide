import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useSocket } from './SocketContext'
import { useGame } from './GameContext'
import LandingPage from './pages/LandingPage'
import CreateRoom from './pages/CreateRoom'
import JoinRoom from './pages/JoinRoom'
import Lobby from './pages/Lobby'
import GameScreen from './pages/GameScreen'
import ResultsScreen from './pages/ResultsScreen'

// --- Session helpers ---
const SESSION_KEY = 'battlehide_session'
export const saveSession = (data) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)) } catch { }
}
export const loadSession = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
export const clearSession = () => {
    try { localStorage.removeItem(SESSION_KEY) } catch { }
}

export default function App() {
    const { socket } = useSocket()
    const { state, dispatch } = useGame()
    const stateRef = useRef(state)
    stateRef.current = state

    useEffect(() => {
        if (!socket) return

        // On EVERY connect (initial + reconnects), re-register with the server
        socket.on('connect', () => {
            console.log('[BattleHide] Socket connected:', socket.id)
            dispatch({ type: 'SET_MY_ID', payload: socket.id })

            // If we already have an active room in state, re-register immediately
            // This handles Socket.io transport upgrades and reconnections
            const currentState = stateRef.current
            const saved = loadSession()

            if (saved?.roomCode && saved?.playerName) {
                console.log('[BattleHide] Re-registering with server:', saved.roomCode, saved.playerName)
                socket.emit('room:rejoin', { code: saved.roomCode, playerName: saved.playerName }, (res) => {
                    if (res.error) {
                        console.warn('[BattleHide] Rejoin failed:', res.error)
                        // Only clear session if room truly doesn't exist anymore
                        if (!currentState.roomCode) clearSession()
                        return
                    }
                    console.log('[BattleHide] Rejoin succeeded! restored:', res.restored)
                    dispatch({ type: 'SET_ROOM', payload: { code: res.code, ...res.room } })
                    dispatch({ type: 'SET_MY_ID', payload: socket.id })

                    // Restore host status
                    if (res.isHost) {
                        dispatch({ type: 'SET_HOST', payload: true })
                    }

                    // Restore role if mid-game
                    if (res.restored && res.role) {
                        dispatch({
                            type: 'ROLE_ASSIGNED', payload: {
                                role: res.role,
                                teamName: res.teamName,
                                isVIP: res.isVIP,
                                isAlphaSeeker: res.isAlphaSeeker,
                                isHost: res.isHost,
                                modeRules: res.room.rules,
                            }
                        })
                    }
                    if (res.gameState) {
                        dispatch({ type: 'GAME_START', payload: { gameState: res.gameState } })
                    }
                })
            }
        })

        socket.on('room:state', data => dispatch({ type: 'ROOM_STATE', payload: data }))
        socket.on('role:assigned', data => dispatch({ type: 'ROLE_ASSIGNED', payload: data }))
        socket.on('game:countdown', data => dispatch({ type: 'GAME_COUNTDOWN', payload: data }))
        socket.on('game:start', data => dispatch({ type: 'GAME_START', payload: data }))

        // Single game:ended handler — clears session AND dispatches
        socket.on('game:ended', data => {
            clearSession()
            dispatch({ type: 'GAME_ENDED', payload: data })
        })
        socket.on('players:full', data => {
            dispatch({ type: 'ROOM_STATE', payload: { players: data.players } })
        })

        socket.on('game:event', evt => dispatch({ type: 'EVENT', payload: evt }))
        socket.on('zone:closed', data => dispatch({ type: 'ZONE_CLOSED', payload: data }))
        socket.on('blackout:start', () => dispatch({ type: 'BLACKOUT_START' }))
        socket.on('blackout:end', () => dispatch({ type: 'BLACKOUT_END' }))
        socket.on('paranoia:triggered', () => dispatch({ type: 'PARANOIA_TRIGGER' }))
        socket.on('ping:location', data => {
            dispatch({ type: 'RADAR_PING', payload: data })
            setTimeout(() => dispatch({ type: 'RADAR_CLEAR' }), (data.duration || 10) * 1000)
        })
        socket.on('bounty:new', data => dispatch({ type: 'BOUNTY_NEW', payload: data }))
        socket.on('bounty:expired', () => dispatch({ type: 'BOUNTY_CLEAR' }))
        socket.on('bounty:claimed', () => dispatch({ type: 'BOUNTY_CLEAR' }))
        socket.on('audio:trap', (data) => {
            playBeep()
            dispatch({ type: 'AUDIO_TRAP', payload: data })
            setTimeout(() => dispatch({ type: 'AUDIO_TRAP_CLEAR' }), 5000)
        })
        socket.on('compass:update', (data) => {
            dispatch({ type: 'COMPASS_UPDATE', payload: data })
            setTimeout(() => dispatch({ type: 'COMPASS_CLEAR' }), 8000)
        })
        socket.on('jammer:activated', data => {
            dispatch({ type: 'JAMMER_ACTIVATED' })
            setTimeout(() => dispatch({ type: 'JAMMER_CLEAR' }), data.durationSeconds * 1000)
        })
        socket.on('kicked', () => {
            clearSession()
            dispatch({ type: 'RESET' })
            window.location.href = '/'
        })
        socket.on('promoted:host', () => {
            dispatch({ type: 'SET_HOST', payload: true })
        })

        return () => {
            socket.off('connect')
            socket.off('room:state')
            socket.off('role:assigned')
            socket.off('game:countdown')
            socket.off('game:start')
            socket.off('game:ended')
            socket.off('players:full')
            socket.off('game:event')
            socket.off('zone:closed')
            socket.off('blackout:start')
            socket.off('blackout:end')
            socket.off('paranoia:triggered')
            socket.off('ping:location')
            socket.off('bounty:new')
            socket.off('bounty:expired')
            socket.off('bounty:claimed')
            socket.off('audio:trap')
            socket.off('compass:update')
            socket.off('jammer:activated')
            socket.off('kicked')
            socket.off('promoted:host')
        }
    }, [socket])

    // Route based on game state
    if (!state.roomCode) {
        return (
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/create" element={<CreateRoom />} />
                <Route path="/join" element={<JoinRoom />} />
                <Route path="/join/:code" element={<JoinRoom />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        )
    }

    if (state.roomStatus === 'ended') return <ResultsScreen />
    if (state.roomStatus === 'active' || state.roomStatus === 'countdown') return <GameScreen />
    return <Lobby />
}

function playBeep() {
    try {
        // Force max volume — create loud siren that's impossible to miss
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const gain = ctx.createGain()
        gain.connect(ctx.destination)
        gain.gain.setValueAtTime(1.0, ctx.currentTime) // MAX volume

        // Create a loud alternating siren (3 seconds)
        for (let i = 0; i < 6; i++) {
            const osc = ctx.createOscillator()
            osc.connect(gain)
            const t = ctx.currentTime + i * 0.5
            osc.frequency.setValueAtTime(i % 2 === 0 ? 1200 : 800, t)
            osc.start(t)
            osc.stop(t + 0.45)
        }

        // Also try to play via an Audio element at max volume for devices that support it
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19telefonGFtYQAAAAABAAEARKwAAIhYAQACABAAZGF0YQ==')
            audio.volume = 1.0
            audio.play().catch(() => { })
        } catch (e2) { }
    } catch (e) { /* Audio not available */ }
}
