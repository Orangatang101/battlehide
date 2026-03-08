import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'
import RuleEditor from '../components/RuleEditor'

const MODES = [
    { id: 'hideAndSeek', icon: '👁️', name: 'Hide & Seek', desc: 'Classic. Seekers hunt hiders.', color: 'var(--blue)' },
    { id: 'copsAndRobbers', icon: '🚔', name: 'Cops & Robbers', desc: 'Robbers run. Cops jail them.', color: 'var(--yellow)' },
    { id: 'infection', icon: '🦠', name: 'Infection', desc: 'Spread the infection to all.', color: 'var(--green)' },
    { id: 'battleRoyale', icon: '💀', name: 'Battle Royale', desc: 'All mechanics. Total chaos.', color: 'var(--red)' },
    { id: 'custom', icon: '⚙️', name: 'Custom', desc: 'Build your own ruleset.', color: 'var(--purple)' },
]

export default function CreateRoom() {
    const navigate = useNavigate()
    const { socket } = useSocket()
    const { dispatch } = useGame()
    const [hostName, setHostName] = useState('')
    const [selectedMode, setSelectedMode] = useState('hideAndSeek')
    const [step, setStep] = useState(1) // 1=name, 2=mode, 3=rules
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [localRules, setLocalRules] = useState(null)

    const handleCreate = () => {
        if (!socket) return setError('Not connected. Please refresh.')
        setLoading(true)
        setError('')
        socket.emit('room:create', { hostName: hostName.trim() }, (res) => {
            setLoading(false)
            if (res?.error) return setError(res.error)
            dispatch({ type: 'ROOM_CREATED', payload: { ...res, playerName: hostName.trim() } })
            dispatch({ type: 'SET_MY_ID', payload: socket.id })
            // Persist session for auto-rejoin
            try { localStorage.setItem('battlehide_session', JSON.stringify({ roomCode: res.code, playerName: hostName.trim(), isHost: true })) } catch { }
            // Set the chosen mode
            socket.emit('room:setMode', { code: res.code, modeId: selectedMode })
            // Apply any custom rules
            if (localRules) socket.emit('room:updateRules', { code: res.code, patch: localRules })
        })
    }

    return (
        <div className="page" style={{
            background: 'radial-gradient(ellipse at 70% 30%, rgba(239,68,68,0.07) 0%, transparent 60%), var(--bg)',
            padding: '24px',
        }}>
            <div className="container-sm w-full" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 24, paddingBottom: 60 }}>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <button className="btn btn-ghost btn-sm" style={{ marginBottom: 24 }} onClick={() => navigate('/')}>
                        ← Back
                    </button>

                    {/* Step Indicator */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 32, alignItems: 'center' }}>
                        {['Name', 'Mode', 'Rules'].map((s, i) => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                                    background: step > i + 1 ? 'var(--green)' : step === i + 1 ? 'var(--red)' : 'var(--surface2)',
                                    color: step >= i + 1 ? '#fff' : 'var(--text3)',
                                    border: `1px solid ${step === i + 1 ? 'var(--red)' : step > i + 1 ? 'var(--green)' : 'var(--border)'}`,
                                }}>
                                    {step > i + 1 ? '✓' : i + 1}
                                </div>
                                <span style={{ fontSize: '0.8rem', color: step === i + 1 ? 'var(--text)' : 'var(--text3)', fontWeight: step === i + 1 ? 600 : 400 }}>{s}</span>
                                {i < 2 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
                            </div>
                        ))}
                    </div>

                    {/* Step 1: Host Name */}
                    {step === 1 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ padding: 32 }}>
                            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                                <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚔️</div>
                                <h2 style={{ fontSize: '1.6rem' }}>Create Room</h2>
                                <p style={{ marginTop: 6 }}>You'll be the game host and control the room.</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label className="label">Your Name (Host)</label>
                                    <input className="input" value={hostName} onChange={e => setHostName(e.target.value.slice(0, 20))}
                                        onKeyDown={e => e.key === 'Enter' && hostName.trim() && setStep(2)}
                                        placeholder="Enter your name..." autoFocus maxLength={20} />
                                </div>
                                {error && <div className="msg msg-error">{error}</div>}
                                <button className="btn btn-primary btn-full btn-lg" onClick={() => setStep(2)} disabled={!hostName.trim()}>
                                    Next: Choose Mode →
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Mode Selection */}
                    {step === 2 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h2 style={{ marginBottom: 6 }}>Choose Game Mode</h2>
                            <p style={{ marginBottom: 20 }}>You can change this in the lobby too.</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                                {MODES.map(m => (
                                    <div
                                        key={m.id}
                                        className="card card-hover"
                                        onClick={() => setSelectedMode(m.id)}
                                        style={{
                                            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
                                            border: selectedMode === m.id ? `1.5px solid ${m.color}` : '1px solid var(--border)',
                                            boxShadow: selectedMode === m.id ? `0 0 20px ${m.color}22` : 'var(--shadow-card)',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <span style={{ fontSize: '2rem' }}>{m.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, color: selectedMode === m.id ? m.color : 'var(--text)' }}>{m.name}</div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{m.desc}</div>
                                        </div>
                                        {selectedMode === m.id && <span style={{ color: m.color, fontWeight: 700 }}>✓</span>}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Next: Rules →</button>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Rules */}
                    {step === 3 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <h2 style={{ marginBottom: 6 }}>Customize Rules</h2>
                            <p style={{ marginBottom: 20 }}>Fine-tune every mechanic. You can also change these in lobby.</p>
                            <RuleEditor modeId={selectedMode} onChange={rules => setLocalRules(rules)} />
                            {error && <div className="msg msg-error" style={{ marginTop: 16 }}>{error}</div>}
                            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreate} disabled={loading}>
                                    {loading ? <span className="spinner" /> : '🚀 Create Room'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    )
}
