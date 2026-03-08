import { motion } from 'framer-motion'
import { useGame } from '../GameContext'

export default function ResultsScreen() {
    const { state, dispatch } = useGame()
    const results = state.players || []
    const awards = state.gameState?.awards || state.awards || {}
    const duration = state.gameState?.duration || 0

    const winnerTeamMap = {
        seekers_win: '🔴 Seekers Win!',
        hiders_win: '🟢 Hiders Survive!',
        host_ended: 'Host ended game',
        timeout: '🟢 Hiders Win — Time\'s Up!',
    }

    const playAgain = () => {
        dispatch({ type: 'RESET' })
        window.location.href = '/'
    }

    const medal = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`
    const fmtTime = (s) => `${Math.floor(s / 60)}m ${s % 60}s`

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
                        {winnerTeamMap[results._reason] || state.modeName || 'Game Complete'}
                    </div>
                    <div style={{ color: 'var(--text3)', fontSize: '0.85rem', marginTop: 4 }}>
                        Duration: {fmtTime(duration)}
                    </div>
                </motion.div>
            </div>

            {/* Awards Section */}
            {(awards.longestSurvivor || awards.topSeeker || awards.mvp) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                    style={{ padding: '20px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {awards.longestSurvivor && (
                        <div className="card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: 140, flex: '1 1 140px', maxWidth: 200, border: '1px solid rgba(34,197,94,0.3)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 4 }}>🏃</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>Longest Survived</div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{awards.longestSurvivor.avatar} {awards.longestSurvivor.name}</div>
                            <div style={{ color: 'var(--text2)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{fmtTime(awards.longestSurvivor.time)}</div>
                        </div>
                    )}
                    {awards.topSeeker && awards.topSeeker.catches > 0 && (
                        <div className="card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: 140, flex: '1 1 140px', maxWidth: 200, border: '1px solid rgba(239,68,68,0.3)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 4 }}>🎯</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>Top Seeker</div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{awards.topSeeker.avatar} {awards.topSeeker.name}</div>
                            <div style={{ color: 'var(--text2)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{awards.topSeeker.catches} catches</div>
                        </div>
                    )}
                    {awards.mvp && (
                        <div className="card" style={{ padding: '16px 20px', textAlign: 'center', minWidth: 140, flex: '1 1 140px', maxWidth: 200, border: '1px solid rgba(234,179,8,0.3)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 4 }}>⭐</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>MVP</div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{awards.mvp.avatar} {awards.mvp.name}</div>
                            <div style={{ color: 'var(--text2)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{awards.mvp.score} pts</div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Full Scoreboard */}
            <div style={{ padding: '24px 16px' }}>
                <div className="section-header">Final Leaderboard</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {results.map((p, i) => (
                        <motion.div key={p.id}
                            initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.06 }}
                            className="card"
                            style={{
                                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
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
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span className={`badge badge-${p.role === 'seeker' ? 'red' : p.role === 'assassin' ? 'purple' : 'green'}`} style={{ fontSize: '0.6rem' }}>{p.teamName || p.role}</span>
                                    <span className={`badge badge-${p.status === 'alive' ? 'green' : 'gray'}`} style={{ fontSize: '0.6rem' }}>{p.status === 'alive' ? 'Survived' : 'Found'}</span>
                                    {p.role === 'seeker' && p.catchCount > 0 && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>🎯 {p.catchCount} catches</span>
                                    )}
                                    {p.role !== 'seeker' && p.survivalTime > 0 && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--green)' }}>⏱ {fmtTime(p.survivalTime)}</span>
                                    )}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: i === 0 ? 'var(--yellow)' : 'var(--text)' }}>{p.score}</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text3)', textTransform: 'uppercase' }}>pts</div>
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
