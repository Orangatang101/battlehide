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
const saveSession = (data) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)) } catch { }
}
const loadSession = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}
const clearSession = () => {
    try { localStorage.removeItem(SESSION_KEY) } catch { }
}

export default function App() {
    const { socket } = useSocket()
    const { state, dispatch } = useGame()
    const rejoinAttempted = useRef(false)

    useEffect(() => {
        if (!socket) return

        socket.on('connect', () => {
            dispatch({ type: 'SET_MY_ID', payload: socket.id })

            // --- Auto-rejoin from saved session ---
            if (rejoinAttempted.current) return
            rejoinAttempted.current = true
            const saved = loadSession()
            if (saved?.roomCode && saved?.playerName) {
                console.log('[BattleHide] Attempting auto-rejoin:', saved.roomCode, saved.playerName)
                socket.emit('room:rejoin', { code: saved.roomCode, playerName: saved.playerName }, (res) => {
                    if (res.error) {
                        console.warn('[BattleHide] Rejoin failed:', res.error)
                        clearSession()
                        return
                    }
                    console.log('[BattleHide] Rejoin succeeded!')
                    dispatch({ type: 'SET_ROOM', payload: { code: res.code, ...res.room } })
                    dispatch({ type: 'SET_MY_ID', payload: socket.id })
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
        socket.on('game:ended', data => dispatch({ type: 'GAME_ENDED', payload: data }))
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
        socket.on('audio:trap', () => {
            // Play a loud beep via Web Audio API
            playBeep()
            dispatch({ type: 'AUDIO_TRAP' })
            setTimeout(() => dispatch({ type: 'AUDIO_TRAP_CLEAR' }), 3000)
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

        socket.on('game:ended', data => {
            // Keep clearSession so they don't auto-rejoin a dead room
            clearSession()
            dispatch({ type: 'GAME_ENDED', payload: data })
        })

        return () => {
            socket.off('connect')
            socket.off('room:state')
            socket.off('role:assigned')
            socket.off('game:countdown')
            socket.off('game:start')
            socket.off('game:ended')
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
            socket.off('jammer:activated')
            socket.off('kicked')
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
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
        gain.gain.setValueAtTime(0.8, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.6)
    } catch (e) { /* Audio not available */ }
}
