import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'
import RuleEditor from '../components/RuleEditor'

const MODES = [
    { id: 'hideAndSeek', icon: '👁️', name: 'Hide & Seek' },
    { id: 'copsAndRobbers', icon: '🚔', name: 'Cops & Robbers' },
    { id: 'infection', icon: '🦠', name: 'Infection' },
    { id: 'battleRoyale', icon: '💀', name: 'Battle Royale' },
    { id: 'custom', icon: '⚙️', name: 'Custom' },
]

export default function Lobby() {
    const { socket } = useSocket()
    const { state, dispatch } = useGame()
    const [activeTab, setActiveTab] = useState('players')
    const [startError, setStartError] = useState('')
    const [startLoading, setStartLoading] = useState(false)
    const [showQR, setShowQR] = useState(false)

    const joinUrl = `${window.location.origin}/join/${state.roomCode}`
    const isHost = state.isHost

    const changeMode = (modeId) => {
        socket?.emit('room:setMode', { code: state.roomCode, modeId })
    }

    const updateRules = (patch) => {
        socket?.emit('room:updateRules', { code: state.roomCode, patch })
    }

    const kickPlayer = (playerId) => {
        socket?.emit('player:kick', { code: state.roomCode, playerId })
    }

    const startGame = () => {
        setStartError('')
        setStartLoading(true)
        socket?.emit('game:start', { code: state.roomCode }, (res) => {
            setStartLoading(false)
            if (res?.error) setStartError(res.error)
        })
    }

    const currentModeObj = MODES.find(m => state.rules?.id === m.id) || MODES[0]

    return (
        <div className="page" style={{ background: 'var(--bg)', paddingBottom: 120 }}>
            {/* Header */}
            <div style={{
                background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                position: 'sticky', top: 0, zIndex: 100,
            }}>
                <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Lobby</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text2)' }}>
                        {currentModeObj.icon} {state.modeName || currentModeObj.name}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Room Code</div>
                        <div className="room-code" style={{ fontSize: '1.6rem' }}>{state.roomCode}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowQR(!showQR)} title="QR Code">
                        📱
                    </button>
                </div>
            </div>

            {/* QR Modal */}
            <AnimatePresence>
                {showQR && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                        onClick={() => setShowQR(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            onClick={e => e.stopPropagation()}
                            className="card"
                            style={{ padding: 32, textAlign: 'center', maxWidth: 340, width: '100%' }}
                        >
                            <h3 style={{ marginBottom: 8 }}>Share This QR Code</h3>
                            <p style={{ marginBottom: 20, fontSize: '0.85rem' }}>Friends scan to join instantly</p>
                            <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 20 }}>
                                <QRCodeSVG value={joinUrl} size={200} />
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text2)', wordBreak: 'break-all', marginBottom: 16 }}>
                                {joinUrl}
                            </div>
                            <button className="btn btn-ghost btn-full btn-sm" onClick={() => { navigator.clipboard?.writeText(joinUrl); }}>
                                📋 Copy Link
                            </button>
                            <div style={{ marginTop: 8 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowQR(false)}>Close</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Share bar */}
            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', margin: '16px', borderRadius: 'var(--r-md)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.1rem' }}>📱</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Share this link with your friends</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{joinUrl}</div>
                </div>
                <button className="btn btn-blue btn-sm" onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copy</button>
            </div>

            <div style={{ padding: '0 16px' }}>
                {/* Tabs */}
                <div className="tab-bar" style={{ marginBottom: 20 }}>
                    <button className={`tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>
                        Players ({state.playerCount || state.players?.length || 1})
                    </button>
                    {isHost && <button className={`tab ${activeTab === 'mode' ? 'active' : ''}`} onClick={() => setActiveTab('mode')}>Mode</button>}
                    {isHost && <button className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>Rules</button>}
                </div>

                {/* Players Tab */}
                {activeTab === 'players' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">Players {state.players?.length || 1} / 25</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(state.players?.length > 0 ? state.players : [{ id: state.myId, name: state.myName || 'You', avatar: '👑', color: '#f59e0b', score: 0, status: 'alive' }]).map(p => (
                                <div key={p.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--r-md)' }}>
                                    <span style={{ fontSize: '1.4rem' }}>{p.avatar}</span>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontWeight: 600, color: p.color || 'var(--text)' }}>{p.name}</span>
                                        {p.id === state.myId && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--text3)' }}>(you)</span>}
                                        {state.hostName === p.name && <span className="badge badge-yellow" style={{ marginLeft: 8 }}>HOST</span>}
                                    </div>
                                    <span className="player-dot player-online" />
                                    {isHost && p.id !== state.myId && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => kickPlayer(p.id)} style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)', padding: '6px 10px', fontSize: '0.7rem' }}>
                                            Kick
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {!isHost && (
                            <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text2)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
                                <p>Waiting for the host to start the game...</p>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Mode Tab */}
                {activeTab === 'mode' && isHost && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">Game Mode</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {MODES.map(m => {
                                const isSelected = state.rules?.id === m.id
                                return (
                                    <div
                                        key={m.id}
                                        className="card card-hover"
                                        onClick={() => changeMode(m.id)}
                                        style={{
                                            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                                            border: isSelected ? '1.5px solid var(--blue)' : '1px solid var(--border)',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.8rem' }}>{m.icon}</span>
                                        <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
                                        {isSelected && <span style={{ color: 'var(--blue)' }}>✓</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {/* Rules Tab */}
                {activeTab === 'rules' && isHost && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">Rule Customization</div>
                        <RuleEditor modeId={state.rules?.id || 'hideAndSeek'} currentRules={state.rules} onChange={updateRules} />
                    </motion.div>
                )}
            </div>

            {/* Start Button (host only) */}
            {isHost && (
                <div className="bottom-nav" style={{ flexDirection: 'column', gap: 10 }}>
                    {startError && <div className="msg msg-error" style={{ width: '100%', textAlign: 'center' }}>{startError}</div>}
                    <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 500 }}>
                        <button className="btn btn-primary btn-full btn-lg" onClick={startGame} disabled={startLoading || (state.playerCount || 1) < 2}>
                            {startLoading ? <span className="spinner" /> : '🚀 Start Game'}
                        </button>
                    </div>
                    {(state.playerCount || 1) < 2 && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--text3)', textAlign: 'center' }}>
                            Need at least 2 players to start
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
