import { motion } from 'framer-motion'
import { useGame } from '../GameContext'
import { useSocket } from '../SocketContext'

export default function ResultsScreen() {
    const { state, dispatch } = useGame()
    const { socket } = useSocket()

    const isHost = state.isHost
    const results = state.players || []

    const winnerTeamMap = {
        seekers_win: state.rules?.teamNames?.seekers || 'Seekers',
        hiders_win: state.rules?.teamNames?.hiders || 'Hiders',
        host_ended: 'Host ended game',
        timeout: 'Time Up — Hiders win!',
    }

    const playAgain = () => {
        dispatch({ type: 'RESET' })
        window.location.href = '/'
    }

    const medal = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`
    const roleColor = { seeker: 'var(--red)', hider: 'var(--green)', assassin: 'var(--purple)' }

    return (
        <div className="page" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(234,179,8,0.1) 0%, transparent 60%), var(--bg)',
            paddingBottom: 120, minHeight: '100dvh',
        }}>
            {/* Header */}
            <div style={{ padding: '40px 20px 0', textAlign: 'center' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.2 }} style={{ fontSize: '5rem', marginBottom: 16 }}>
                    🏆
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: 8 }}>Game Over</h1>
                    <div style={{ display: 'inline-block', padding: '8px 20px', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 999, color: 'var(--yellow)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '1.1rem', marginBottom: 8 }}>
                        {winnerTeamMap[results._reason] || state.modeName}
                    </div>
                </motion.div>
            </div>

            {/* Scoreboard */}
            <div style={{ padding: '32px 16px' }}>
                <div className="section-header">Final Scoreboard</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {results.map((p, i) => (
                        <motion.div
                            key={p.id}
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + i * 0.08 }}
                            className="card"
                            style={{
                                padding: '14px 18px',
                                display: 'flex', alignItems: 'center', gap: 14,
                                border: i === 0 ? '1.5px solid var(--yellow)' : '1px solid var(--border)',
                                boxShadow: i === 0 ? '0 0 30px rgba(234,179,8,0.15)' : 'var(--shadow-card)',
                            }}
                        >
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', minWidth: 36, textAlign: 'center' }}>{medal(i)}</div>
                            <span style={{ fontSize: '1.5rem' }}>{p.avatar}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: p.color, marginBottom: 2 }}>
                                    {p.name}
                                    {p.id === state.myId && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--text3)' }}>(you)</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {p.role && <span className={`badge badge-${p.role === 'seeker' ? 'red' : p.role === 'assassin' ? 'purple' : 'green'}`} style={{ fontSize: '0.65rem' }}>{p.teamName}</span>}
                                    {p.isVIP && <span className="badge badge-yellow" style={{ fontSize: '0.65rem' }}>⭐ VIP</span>}
                                    <span className={`badge badge-${p.status === 'alive' ? 'green' : 'gray'}`} style={{ fontSize: '0.65rem' }}>{p.status}</span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: i === 0 ? 'var(--yellow)' : 'var(--text)' }}>{p.score}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>pts</div>
                            </div>
                        </motion.div>
                    ))}
                    {results.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
                            <p>No scoreboard data available.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Play Again */}
            <div className="bottom-nav">
                <button className="btn btn-primary btn-lg" style={{ flex: 1, maxWidth: 400 }} onClick={playAgain}>
                    🔄 Play Again
                </button>
            </div>
        </div>
    )
}
