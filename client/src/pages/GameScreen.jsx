import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'
import RoleReveal from '../components/RoleReveal'
import ToastEvents from '../components/ToastEvents'

const BUILDING_FLOORS = {
    pcl: [1, 2, 3, 4, 5, 6],
    rowling: [1, 2, 3, 4, 5],
    pma: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    eer: [1, 2, 3, 4, 5, 6, 7, 8, 9],
}

export default function GameScreen() {
    const { socket } = useSocket()
    const { state, dispatch } = useGame()
    const [showReveal, setShowReveal] = useState(true)
    const [gameTimer, setGameTimer] = useState(0)
    const [countdown, setCountdown] = useState(state.countdown || 60)
    const [cacheInput, setCacheInput] = useState('')
    const [cacheMsg, setCacheMsg] = useState('')
    const [jailbreakHeld, setJailbreakHeld] = useState(false)
    const [jailbreakProgress, setJailbreakProgress] = useState(0)
    const [activeTab, setActiveTab] = useState('hud')
    const [myFloor, setMyFloor] = useState(1)
    const jailbreakRef = useRef(null)
    const jailbreakTimerRef = useRef(null)

    const isSeeker = state.myRole === 'seeker'
    const isHider = state.myRole === 'hider'
    const isAssassin = state.myRole === 'assassin'
    const isCountdown = state.roomStatus === 'countdown'
    const isActive = state.roomStatus === 'active'
    const rules = state.rules?.features || {}
    const mapId = state.mapId
    const availableFloors = mapId ? (BUILDING_FLOORS[mapId] || []) : []

    // Report floor changes to server
    const changeFloor = (floor) => {
        setMyFloor(floor)
        socket?.emit('player:setFloor', { code: state.roomCode, floor })
    }

    // Countdown timer
    useEffect(() => {
        if (!isCountdown) return
        setCountdown(state.countdown || 60)
        const i = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) { clearInterval(i); return 0 }
                return c - 1
            })
        }, 1000)
        return () => clearInterval(i)
    }, [isCountdown])

    // Game timer (count up)
    useEffect(() => {
        if (!state.gameState?.startTime) return
        const i = setInterval(() => {
            setGameTimer(Math.floor((Date.now() - state.gameState.startTime) / 1000))
        }, 1000)
        return () => clearInterval(i)
    }, [state.gameState?.startTime])

    // Auto-dismiss role reveal
    useEffect(() => {
        const t = setTimeout(() => setShowReveal(false), 4000)
        return () => clearTimeout(t)
    }, [])

    // Paranoia: report movement
    const clearParanoia = () => {
        dispatch({ type: 'PARANOIA_CLEAR' })
        socket?.emit('paranoia:moved', { code: state.roomCode })
    }

    // Jailbreak hold button
    const startJailbreak = () => {
        setJailbreakHeld(true)
        setJailbreakProgress(0)
        const totalMs = (state.rules?.features?.jailbreakTerminals?.holdSeconds || 15) * 1000
        const start = Date.now()
        jailbreakTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - start
            const pct = Math.min((elapsed / totalMs) * 100, 100)
            setJailbreakProgress(pct)
            if (pct >= 100) {
                clearInterval(jailbreakTimerRef.current)
                setJailbreakHeld(false)
                socket?.emit('jailbreak:trigger', { code: state.roomCode })
            }
        }, 100)
    }
    const cancelJailbreak = () => {
        clearInterval(jailbreakTimerRef.current)
        setJailbreakHeld(false)
        setJailbreakProgress(0)
    }

    const redeemCache = () => {
        if (!cacheInput.trim()) return
        socket?.emit('cache:redeem', { code: state.roomCode, cacheCode: cacheInput.trim() }, (res) => {
            setCacheMsg(res.error || '✅ Jammer activated!')
            setTimeout(() => setCacheMsg(''), 3000)
            if (!res.error) setCacheInput('')
        })
    }

    const useBlackout = () => {
        socket?.emit('blackout:use', { code: state.roomCode })
    }

    const endGame = () => {
        socket?.emit('game:end', { code: state.roomCode })
    }

    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

    const gameDuration = (state.rules?.gameDuration || 15) * 60
    const timeLeft = Math.max(0, gameDuration - gameTimer)
    const timeLeftPct = (timeLeft / gameDuration) * 100

    const roleColor = { seeker: 'var(--red)', hider: 'var(--green)', assassin: 'var(--purple)', traitor: 'var(--orange)' }[state.myRole] || 'var(--text)'
    const roleIcon = { seeker: '🔴', hider: '🟢', assassin: '⚡', traitor: '🟠' }[state.myRole] || '⬜'

    return (
        <div className="page" style={{ background: 'var(--bg)', paddingBottom: 140 }}>
            {/* Blackout overlay */}
            <AnimatePresence>
                {state.blackoutActive && (
                    <motion.div className="blackout-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>🌑</div>
                        <h2>BLACKOUT PROTOCOL</h2>
                        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Stay hidden. Don't move.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Audio Trap overlay (LOUD SOUND for hiders) */}
            <AnimatePresence>
                {state.audioTrapFired && (
                    <motion.div
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(239,68,68,0.95)', zIndex: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
                        }}
                    >
                        <motion.div
                            animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                            style={{ fontSize: '6rem' }}
                        >🔊</motion.div>
                        <h2 style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '2rem', textAlign: 'center' }}>
                            AUDIO TRAP!
                        </h2>
                        <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: '1.1rem' }}>
                            Your phone is making noise!<br />
                            {state.audioTrapData?.zoneName && (
                                <span style={{ fontSize: '0.9rem' }}>Zone closing soon: {state.audioTrapData.zoneName}</span>
                            )}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Paranoia overlay */}
            <AnimatePresence>
                {state.paranoiaActive && (
                    <motion.div className="paranoia-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>⚠️</div>
                        <h2 style={{ color: '#000' }}>MOVE NOW!</h2>
                        <p style={{ color: '#333' }}>You've been still too long. Move {state.rules?.features?.paranoiaTimer?.requiredMovementFeet || 30} feet.</p>
                        <button className="btn btn-primary" onClick={clearParanoia}>I'm Moving! ✓</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Compass Arrow overlay (seekers only) */}
            <AnimatePresence>
                {state.compass && isSeeker && (
                    <motion.div
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        style={{
                            position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(239,68,68,0.15)', backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16,
                            padding: '16px 28px', zIndex: 700, textAlign: 'center',
                            minWidth: 220,
                        }}
                    >
                        <div style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6 }}>
                            🧭 Compass Arrow
                        </div>
                        <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>
                            {state.compass.direction.includes('above') ? '⬆️' : state.compass.direction.includes('below') ? '⬇️' : '➡️'}
                        </div>
                        <div style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}>
                            {state.compass.hint}
                        </div>
                        {state.compass.floorDiff > 0 && (
                            <div style={{ color: 'var(--text2)', fontSize: '0.82rem', marginTop: 4 }}>
                                {state.compass.floorDiff} floor{state.compass.floorDiff > 1 ? 's' : ''} away
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Location ping overlay (seekers - enhanced with floor data) */}
            <AnimatePresence>
                {state.radarPing && (
                    <motion.div className="radar-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.15em' }}>📡 LOCATION PING</div>
                        <div className="radar-ring">
                            <div className="radar-sweep" />
                            <div className="radar-blip" style={{ top: '30%', left: '60%' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>
                                {state.radarPing.hiderCount || '?'} hider(s) detected
                            </p>
                            {state.radarPing.floors?.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'uppercase' }}>Floor(s):</span>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                                        {state.radarPing.floors.map(f => (
                                            <span key={f} style={{
                                                background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)',
                                                padding: '4px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)',
                                                fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)',
                                            }}>
                                                F{f}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {state.radarPing.sectors?.map(s => (
                                <div key={s} style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{s}</div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Role Reveal */}
            <AnimatePresence>
                {showReveal && <RoleReveal role={state.myRole} teamName={state.myTeam} isVIP={state.isVIP} isAlpha={state.isAlphaSeeker} onDismiss={() => setShowReveal(false)} />}
            </AnimatePresence>

            {/* Countdown phase */}
            <AnimatePresence>
                {isCountdown && !showReveal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}
                    >
                        {isSeeker ? (
                            <>
                                <div style={{ fontSize: '4rem' }}>👁️</div>
                                <h2 style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>SEEKERS WAIT</h2>
                                <div className="timer" style={{ fontSize: '5rem', color: countdown < 10 ? 'var(--red)' : 'var(--text)' }}>{countdown}</div>
                                <p style={{ color: 'var(--text2)' }}>Hiders are hiding. Go in {countdown}s.</p>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '4rem' }}>🏃</div>
                                <h2 style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>HIDE NOW!</h2>
                                <div className="timer" style={{ fontSize: '5rem', color: countdown < 10 ? 'var(--red)' : 'var(--green)' }}>{countdown}</div>
                                <p style={{ color: 'var(--text2)' }}>Seekers release in {countdown}s!</p>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Game HUD header */}
            <div style={{
                background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
                padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    {/* Role */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1.2rem' }}>{roleIcon}</span>
                        <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Role</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: roleColor, fontSize: '0.95rem' }}>
                                {state.myTeam}
                                {state.isVIP && <span style={{ marginLeft: 6, color: 'var(--yellow)' }}>⭐ VIP</span>}
                                {state.isAlphaSeeker && <span style={{ marginLeft: 6, color: 'var(--red)', fontSize: '0.7rem' }}>ALPHA</span>}
                            </div>
                        </div>
                    </div>
                    {/* Floor indicator */}
                    {mapId && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Floor</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--blue)', fontSize: '1.2rem' }}>F{myFloor}</div>
                        </div>
                    )}
                    {/* Timer */}
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Time Left</div>
                        <div className={`timer ${timeLeft < 120 ? 'urgent' : ''}`} style={{ fontSize: '1.4rem' }}>{fmt(timeLeft)}</div>
                    </div>
                </div>
                {/* Time progress */}
                <div className="progress-bar">
                    <div className={`progress-fill ${timeLeft < 120 ? 'danger' : ''}`} style={{ width: `${timeLeftPct}%` }} />
                </div>
            </div>

            {/* Floor selector bar */}
            {mapId && availableFloors.length > 0 && (
                <div style={{
                    background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid rgba(59,130,246,0.15)',
                    padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto',
                }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                        📍 I'm on:
                    </span>
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                        {availableFloors.map(f => (
                            <button
                                key={f}
                                onClick={() => changeFloor(f)}
                                style={{
                                    background: myFloor === f ? 'var(--blue)' : 'rgba(255,255,255,0.05)',
                                    color: myFloor === f ? '#fff' : 'var(--text2)',
                                    border: myFloor === f ? '1px solid var(--blue)' : '1px solid var(--border)',
                                    borderRadius: 8, padding: '4px 10px', fontSize: '0.8rem',
                                    fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer',
                                    minWidth: 36, transition: 'all 0.15s',
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Jammer status */}
            {state.jammerActive && (
                <div style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', margin: '12px 16px', borderRadius: 'var(--r-sm)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>🛡️</span>
                    <span style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '0.85rem' }}>JAMMER ACTIVE — You cannot be tagged</span>
                </div>
            )}

            {/* Bounty alert */}
            {state.bounty && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', margin: '12px 16px', borderRadius: 'var(--r-md)', padding: '16px', textAlign: 'center' }}
                >
                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🎯</div>
                    <div style={{ color: 'var(--yellow)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>BOUNTY TARGET</div>
                    <div style={{ fontSize: '1.2rem', color: 'var(--text)', fontWeight: 700 }}>{state.bounty.targetName}</div>
                    <div style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>+{state.bounty.bonusPoints} pts if caught</div>
                </motion.div>
            )}

            {/* Tabs */}
            <div style={{ padding: '16px 16px 0' }}>
                <div className="tab-bar" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'hud' ? 'active' : ''}`} onClick={() => setActiveTab('hud')}>HUD</button>
                    <button className={`tab ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>Actions</button>
                    <button className={`tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>Events</button>
                    {state.isHost && <button className={`tab ${activeTab === 'host' ? 'active' : ''}`} onClick={() => setActiveTab('host')}>Host</button>}
                </div>

                {/* HUD tab */}
                {activeTab === 'hud' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Zone status */}
                        {rules.shrinkingZone?.enabled && (
                            <div className="card" style={{ padding: '16px' }}>
                                <div className="section-header">Zone Status (Floors)</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {state.gameState?.zones?.map(z => (
                                        <span key={z.id} className={`zone-pill ${state.closedZones?.includes(z.id) ? 'zone-closed' : 'zone-active'}`}>
                                            {state.closedZones?.includes(z.id) ? '☠️' : '✅'} {z.name}
                                        </span>
                                    ))}
                                    {!state.gameState?.zones?.length && <span style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>No zones configured</span>}
                                </div>
                            </div>
                        )}

                        {/* Role-specific tips */}
                        <div className="card" style={{ padding: '16px' }}>
                            <div className="section-header">Objectives</div>
                            {isSeeker && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span>🔴</span><p style={{ color: 'var(--text)', margin: 0, fontSize: '0.9rem' }}>Find and tag all hiders before time runs out</p></div>
                                    {rules.locationPings?.enabled && <div style={{ display: 'flex', gap: 10 }}><span>📡</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Floor pings every {rules.locationPings.intervalMinutes} min show which floors hiders are on</p></div>}
                                    <div style={{ display: 'flex', gap: 10 }}><span>🧭</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Compass arrow hints appear every 45s pointing up/down to hiders</p></div>
                                    {rules.bountyContracts?.enabled && <div style={{ display: 'flex', gap: 10 }}><span>🎯</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Hunt bounty targets for bonus points</p></div>}
                                    {state.isAlphaSeeker && rules.blackoutProtocol?.enabled && !state.gameState?.blackoutUsed && (
                                        <div style={{ display: 'flex', gap: 10 }}><span>🌑</span><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--red)' }}>You can trigger BLACKOUT once in Actions tab</p></div>
                                    )}
                                </div>
                            )}
                            {(isHider || isAssassin) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🟢</span><p style={{ color: 'var(--text)', margin: 0, fontSize: '0.9rem' }}>Survive until the timer runs out</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🔊</span><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--red)' }}>WARNING: Your phone may play a LOUD sound near zone closings!</p></div>
                                    {mapId && <div style={{ display: 'flex', gap: 10 }}><span>📍</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Update your floor using the selector above — seekers get floor hints</p></div>}
                                    {rules.supplyCaches?.enabled && <div style={{ display: 'flex', gap: 10 }}><span>📦</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Find supply caches for Jammer protection</p></div>}
                                    {rules.jailbreakTerminals?.enabled && <div style={{ display: 'flex', gap: 10 }}><span>🔓</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Use terminals to free jailed teammates</p></div>}
                                    {state.isVIP && <div style={{ display: 'flex', gap: 10 }}><span>⭐</span><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--yellow)' }}>You are the VIP — your team protects you.</p></div>}
                                    {isAssassin && <div style={{ display: 'flex', gap: 10 }}><span>⚡</span><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--purple)' }}>Assassin goal: tag the Alpha Seeker</p></div>}
                                </div>
                            )}
                        </div>

                        {/* Players alive */}
                        <div className="card" style={{ padding: 16 }}>
                            <div className="section-header">Players</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {state.players?.map(p => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '1rem' }}>{p.avatar}</span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: p.status === 'alive' ? p.color : 'var(--text3)', textDecoration: p.status !== 'alive' ? 'line-through' : 'none' }}>{p.name}</span>
                                        {p.status === 'jailed' && <span style={{ color: 'var(--orange)', fontSize: '0.7rem' }}>🔒</span>}
                                        {p.status === 'caught' && <span style={{ color: 'var(--red)', fontSize: '0.7rem' }}>✕</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Actions tab */}
                {activeTab === 'actions' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Jailbreak */}
                        {(isHider || isAssassin) && rules.jailbreakTerminals?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>🔓 Jailbreak Terminal</div>
                                    <p style={{ fontSize: '0.82rem' }}>Hold for {rules.jailbreakTerminals.holdSeconds}s at a terminal to free all jailed players.</p>
                                </div>
                                {jailbreakHeld && (
                                    <div className="progress-bar" style={{ marginBottom: 10, height: 8 }}>
                                        <div className="progress-fill" style={{ width: `${jailbreakProgress}%`, background: 'var(--green)' }} />
                                    </div>
                                )}
                                <button
                                    className="btn btn-green btn-full"
                                    onMouseDown={startJailbreak} onMouseUp={cancelJailbreak}
                                    onTouchStart={startJailbreak} onTouchEnd={cancelJailbreak} onMouseLeave={cancelJailbreak}
                                >
                                    {jailbreakHeld ? `Triggering... ${Math.round(jailbreakProgress)}%` : '🔓 Hold to Jailbreak'}
                                </button>
                            </div>
                        )}

                        {/* Supply Cache */}
                        {(isHider || isAssassin) && rules.supplyCaches?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>📦 Supply Cache</div>
                                    <p style={{ fontSize: '0.82rem' }}>Enter the 3-digit code from a supply cache to get a Jammer card ({rules.supplyCaches.jammerDurationSeconds}s protection).</p>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input input-code" style={{ fontSize: '1.4rem', letterSpacing: '0.3em', flex: 1 }}
                                        value={cacheInput} onChange={e => setCacheInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                        onKeyDown={e => e.key === 'Enter' && redeemCache()}
                                        placeholder="000" maxLength={3} />
                                    <button className="btn btn-secondary" onClick={redeemCache} disabled={cacheInput.length !== 3}>Redeem</button>
                                </div>
                                {cacheMsg && <div className={`msg ${cacheMsg.startsWith('✅') ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{cacheMsg}</div>}
                            </div>
                        )}

                        {/* Blackout — Alpha Seeker only */}
                        {state.isAlphaSeeker && rules.blackoutProtocol?.enabled && !state.gameState?.blackoutUsed && (
                            <div className="card" style={{ padding: 16, border: '1px solid rgba(239,68,68,0.3)' }}>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>🌑 Blackout Protocol</div>
                                    <p style={{ fontSize: '0.82rem' }}>Activate once per game. All hider terminals go dark for {rules.blackoutProtocol.durationSeconds}s.</p>
                                </div>
                                <button className="btn btn-primary btn-full" onClick={useBlackout}>⚡ ACTIVATE BLACKOUT</button>
                            </div>
                        )}

                        {/* No actions for regular seeker */}
                        {isSeeker && !state.isAlphaSeeker && (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔴</div>
                                <p>You are a Seeker. Find and tag hiders!</p>
                                <p style={{ fontSize: '0.85rem', marginTop: 8 }}>Watch for 🧭 compass arrows and 📡 floor pings</p>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Events tab */}
                {activeTab === 'events' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">Event Log</div>
                        {state.events?.length === 0 && (
                            <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>No events yet. Game just started!</p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {state.events?.map(evt => (
                                <div key={evt.id} className={`msg msg-${evt.type === 'danger' ? 'error' : evt.type === 'warning' ? 'warning' : evt.type === 'success' ? 'success' : 'info'}`}
                                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{evt.message}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                                        {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Host tab */}
                {activeTab === 'host' && state.isHost && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="card" style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Host Controls</div>
                            <button className="btn btn-ghost btn-full" onClick={endGame} style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                                ⏹ End Game Now
                            </button>
                        </div>
                        <div className="card" style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Game Info</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem', color: 'var(--text2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Room Code</span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{state.roomCode}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Mode</span><span style={{ color: 'var(--text)' }}>{state.modeName}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Players</span><span style={{ color: 'var(--text)' }}>{state.players?.length || 0}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Time Elapsed</span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmt(gameTimer)}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Toast Events */}
            <ToastEvents events={state.events} />
        </div>
    )
}
