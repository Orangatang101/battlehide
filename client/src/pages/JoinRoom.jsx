import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'

export default function JoinRoom() {
    const navigate = useNavigate()
    const { socket } = useSocket()
    const { dispatch } = useGame()
    const [code, setCode] = useState('')
    const [name, setName] = useState('')
    const [step, setStep] = useState(1) // 1=code, 2=name
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const checkRoom = async () => {
        if (code.length < 6) return setError('Enter your 6-character room code.')
        setLoading(true)
        setError('')
        try {
            const res = await fetch(`/api/room/${code.toUpperCase()}`)
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Room not found.') }
            setStep(2)
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }

    const joinRoom = () => {
        if (!name.trim()) return setError('Enter your name to join.')
        if (!socket) return setError('Not connected. Please refresh.')
        setLoading(true)
        setError('')
        socket.emit('room:join', { code: code.toUpperCase(), playerName: name.trim() }, (res) => {
            setLoading(false)
            if (res.error) return setError(res.error)
            dispatch({ type: 'ROOM_JOINED', payload: { ...res, playerName: name.trim() } })
            dispatch({ type: 'SET_MY_ID', payload: socket.id })
            // Persist session for auto-rejoin
            try { localStorage.setItem('battlehide_session', JSON.stringify({ roomCode: res.code, playerName: name.trim(), isHost: false })) } catch { }
            // If restored mid-game, set role + game state
            if (res.restored && res.role) {
                dispatch({ type: 'ROLE_ASSIGNED', payload: { role: res.role, teamName: res.teamName, isVIP: res.isVIP, isAlphaSeeker: res.isAlphaSeeker, isHost: res.isHost, modeRules: res.room.rules } })
            }
            if (res.gameState) {
                dispatch({ type: 'GAME_START', payload: { gameState: res.gameState } })
            }
        })
    }

    return (
        <div className="page" style={{
            background: 'radial-gradient(ellipse at 30% 60%, rgba(59,130,246,0.08) 0%, transparent 60%), var(--bg)',
            alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="container-sm w-full"
                style={{ maxWidth: 440 }}
            >
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 24 }} onClick={() => navigate('/')}>
                    ← Back
                </button>

                <div className="card" style={{ padding: 32 }}>
                    <div style={{ marginBottom: 28, textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔗</div>
                        <h2 style={{ fontSize: '1.6rem' }}>Join Room</h2>
                        <p style={{ marginTop: 6 }}>Enter the code shared by your host</p>
                    </div>

                    {step === 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label className="label">Room Code</label>
                                <input
                                    className="input input-code"
                                    value={code}
                                    onChange={e => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError('') }}
                                    onKeyDown={e => e.key === 'Enter' && checkRoom()}
                                    placeholder="XXXXXX"
                                    maxLength={6}
                                    autoCapitalize="characters"
                                    autoComplete="off"
                                />
                            </div>
                            {error && <div className="msg msg-error">{error}</div>}
                            <button className="btn btn-blue btn-full btn-lg" onClick={checkRoom} disabled={loading || code.length < 6}>
                                {loading ? <span className="spinner" /> : 'Find Room →'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ padding: '14px 18px', background: 'var(--bg2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Room Code</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.2em' }}>{code}</div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setStep(1); setError('') }}>Change</button>
                            </div>
                            <div>
                                <label className="label">Your Name</label>
                                <input
                                    className="input"
                                    value={name}
                                    onChange={e => { setName(e.target.value.slice(0, 20)); setError('') }}
                                    onKeyDown={e => e.key === 'Enter' && joinRoom()}
                                    placeholder="Enter your player name..."
                                    maxLength={20}
                                    autoFocus
                                />
                            </div>
                            {error && <div className="msg msg-error">{error}</div>}
                            <button className="btn btn-primary btn-full btn-lg" onClick={joinRoom} disabled={loading || !name.trim()}>
                                {loading ? <span className="spinner" /> : '⚡ Join Game'}
                            </button>
                        </div>
                    )}
                </div>

                <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text3)', fontSize: '0.82rem' }}>
                    No account needed. Works on any phone browser.
                </p>
            </motion.div>
        </div>
    )
}
