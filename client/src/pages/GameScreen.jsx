import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'
import RoleReveal from '../components/RoleReveal'
import ToastEvents from '../components/ToastEvents'

// ── GPS Helpers ──────────────────────────────────────────────────────────
function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 20902231; // Earth radius in feet
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcBearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
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
    const jailbreakTimerRef = useRef(null)

    // GPS state
    const [myPos, setMyPos] = useState(null)
    const [nearestTarget, setNearestTarget] = useState(null) // { bearing, distance, name }
    const [allPositions, setAllPositions] = useState([])
    const [mapFlashActive, setMapFlashActive] = useState(false)
    const [mapCooldown, setMapCooldown] = useState(0)
    const [tagConfirm, setTagConfirm] = useState(null) // { id, name }
    const [heading, setHeading] = useState(0) // device compass heading

    const isSeeker = state.myRole === 'seeker'
    const isHider = state.myRole === 'hider'
    const isAssassin = state.myRole === 'assassin'
    const isCountdown = state.roomStatus === 'countdown'
    const isActive = state.roomStatus === 'active'
    const rules = state.rules?.features || {}

    // Seekers get longer flash & same cooldown
    const flashDuration = isSeeker ? 15 : 5
    const flashCooldownSec = 60

    // ── GPS Tracking ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy, altitude } = pos.coords
                setMyPos({ lat: latitude, lng: longitude, accuracy, altitude })
                // Send to server
                socket?.emit('player:position', {
                    code: state.roomCode,
                    position: { lat: latitude, lng: longitude, accuracy, altitude },
                })
            },
            (err) => console.warn('GPS error:', err.message),
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        )
        return () => navigator.geolocation.clearWatch(watchId)
    }, [socket, state.roomCode])

    // ── Device Compass Heading ────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (e.alpha != null) setHeading(e.alpha)
        }
        // iOS requires permission
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
            DeviceOrientationEvent.requestPermission().then(r => {
                if (r === 'granted') window.addEventListener('deviceorientation', handler)
            }).catch(() => { })
        } else {
            window.addEventListener('deviceorientation', handler)
        }
        return () => window.removeEventListener('deviceorientation', handler)
    }, [])

    // ── Find nearest target based on GPS ──────────────────────────────────────
    useEffect(() => {
        if (!myPos || !isActive) return
        const interval = setInterval(() => {
            socket?.emit('game:getPositions', { code: state.roomCode }, (positions) => {
                if (!positions?.length || !myPos) return
                // Filter: seekers see hiders, hiders see seekers
                const targets = positions.filter(p =>
                    isSeeker ? (p.role === 'hider' || p.role === 'assassin') : p.role === 'seeker'
                )
                if (targets.length === 0) { setNearestTarget(null); return }

                let closest = null, closestDist = Infinity
                for (const t of targets) {
                    const d = calcDistance(myPos.lat, myPos.lng, t.lat, t.lng)
                    if (d < closestDist) { closestDist = d; closest = t }
                }
                if (closest) {
                    const bearing = calcBearing(myPos.lat, myPos.lng, closest.lat, closest.lng)
                    setNearestTarget({
                        bearing,
                        distance: Math.round(closestDist),
                        name: closest.name,
                        avatar: closest.avatar,
                        role: closest.role,
                    })
                }
            })
        }, 3000) // Update every 3 seconds
        return () => clearInterval(interval)
    }, [myPos, isActive, socket, state.roomCode, isSeeker])

    // ── Map Flash Logic ───────────────────────────────────────────────────────
    const triggerMapFlash = useCallback(() => {
        if (mapCooldown > 0 || !isActive) return
        socket?.emit('game:getPositions', { code: state.roomCode }, (positions) => {
            setAllPositions(positions || [])
            setMapFlashActive(true)
            setTimeout(() => setMapFlashActive(false), flashDuration * 1000)
            setMapCooldown(flashCooldownSec)
        })
    }, [mapCooldown, isActive, socket, state.roomCode, flashDuration])

    // Cooldown timer
    useEffect(() => {
        if (mapCooldown <= 0) return
        const i = setInterval(() => setMapCooldown(c => Math.max(0, c - 1)), 1000)
        return () => clearInterval(i)
    }, [mapCooldown])

    // Countdown timer
    useEffect(() => {
        if (!isCountdown) return
        setCountdown(state.countdown || 60)
        const i = setInterval(() => {
            setCountdown(c => { if (c <= 1) { clearInterval(i); return 0 }; return c - 1 })
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

    // ── Seeker Tagging ────────────────────────────────────────────────────────
    const initiateTag = (player) => setTagConfirm({ id: player.id, name: player.name })
    const confirmTag = () => {
        if (!tagConfirm) return
        socket?.emit('player:markFound', { code: state.roomCode, targetId: tagConfirm.id }, (res) => {
            if (res?.error) setCacheMsg(res.error)
            setTagConfirm(null)
        })
    }

    // Paranoia
    const clearParanoia = () => {
        dispatch({ type: 'PARANOIA_CLEAR' })
        socket?.emit('paranoia:moved', { code: state.roomCode })
    }

    // Jailbreak
    const startJailbreak = () => {
        setJailbreakHeld(true); setJailbreakProgress(0)
        const totalMs = (rules.jailbreakTerminals?.holdSeconds || 15) * 1000
        const start = Date.now()
        jailbreakTimerRef.current = setInterval(() => {
            const pct = Math.min(((Date.now() - start) / totalMs) * 100, 100)
            setJailbreakProgress(pct)
            if (pct >= 100) { clearInterval(jailbreakTimerRef.current); setJailbreakHeld(false); socket?.emit('jailbreak:trigger', { code: state.roomCode }) }
        }, 100)
    }
    const cancelJailbreak = () => { clearInterval(jailbreakTimerRef.current); setJailbreakHeld(false); setJailbreakProgress(0) }
    const redeemCache = () => {
        if (!cacheInput.trim()) return
        socket?.emit('cache:redeem', { code: state.roomCode, cacheCode: cacheInput.trim() }, (res) => {
            setCacheMsg(res.error || '✅ Jammer activated!'); setTimeout(() => setCacheMsg(''), 3000)
            if (!res.error) setCacheInput('')
        })
    }
    const useBlackout = () => socket?.emit('blackout:use', { code: state.roomCode })
    const endGame = () => socket?.emit('game:end', { code: state.roomCode })

    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    const gameDuration = (state.rules?.gameDuration || 15) * 60
    const timeLeft = Math.max(0, gameDuration - gameTimer)
    const timeLeftPct = (timeLeft / gameDuration) * 100
    const roleColor = { seeker: 'var(--red)', hider: 'var(--green)', assassin: 'var(--purple)' }[state.myRole] || 'var(--text)'
    const roleIcon = { seeker: '🔴', hider: '🟢', assassin: '⚡' }[state.myRole] || '⬜'

    // Arrow rotation: bearing relative to device heading
    const arrowRotation = nearestTarget ? (nearestTarget.bearing - heading + 360) % 360 : 0

    return (
        <div className="page" style={{ background: 'var(--bg)', paddingBottom: 140 }}>
            {/* Blackout overlay */}
            <AnimatePresence>
                {state.blackoutActive && (
                    <motion.div className="blackout-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>🌑</div><h2>BLACKOUT PROTOCOL</h2>
                        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Stay hidden. Don't move.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Audio Trap overlay */}
            <AnimatePresence>
                {state.audioTrapFired && (
                    <motion.div initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(239,68,68,0.95)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                        <motion.div animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }} transition={{ duration: 0.5, repeat: Infinity }} style={{ fontSize: '6rem' }}>🔊</motion.div>
                        <h2 style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '2rem', textAlign: 'center' }}>AUDIO TRAP!</h2>
                        <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>Your phone is making noise!</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tag Confirmation Dialog */}
            <AnimatePresence>
                {tagConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 340, width: '100%' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎯</div>
                            <h3 style={{ marginBottom: 8 }}>Mark as Found?</h3>
                            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--red)', marginBottom: 20 }}>{tagConfirm.name}</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: 20 }}>Are you sure you found this player?</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="btn btn-ghost btn-full" onClick={() => setTagConfirm(null)}>Cancel</button>
                                <button className="btn btn-primary btn-full" onClick={confirmTag}>✅ Confirm Found</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Paranoia overlay */}
            <AnimatePresence>
                {state.paranoiaActive && (
                    <motion.div className="paranoia-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>⚠️</div><h2 style={{ color: '#000' }}>MOVE NOW!</h2>
                        <p style={{ color: '#333' }}>Move {state.rules?.features?.paranoiaTimer?.requiredMovementFeet || 30} feet.</p>
                        <button className="btn btn-primary" onClick={clearParanoia}>I'm Moving! ✓</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Map Flash Overlay */}
            <AnimatePresence>
                {mapFlashActive && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 750, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <div style={{ fontSize: '0.7rem', color: isSeeker ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 16 }}>
                            📡 {isSeeker ? 'HIDER LOCATIONS' : 'SEEKER LOCATIONS'} — {flashDuration}s
                        </div>
                        {/* Relative position map */}
                        <div style={{ position: 'relative', width: 300, height: 300, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                            {/* Center = you */}
                            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--blue)', border: '2px solid #fff', zIndex: 10 }} />
                            <div style={{ position: 'absolute', left: '50%', top: '55%', transform: 'translateX(-50%)', fontSize: '0.6rem', color: 'var(--blue)', fontWeight: 700 }}>YOU</div>
                            {/* Other players plotted relative */}
                            {myPos && allPositions.map(p => {
                                const dx = (p.lng - myPos.lng) * 364000 // rough feet per deg lng
                                const dy = (p.lat - myPos.lat) * 364000
                                const maxRange = 500 // max 500ft view
                                const px = 150 + (dx / maxRange) * 130
                                const py = 150 - (dy / maxRange) * 130
                                const clamped = { x: Math.max(10, Math.min(290, px)), y: Math.max(10, Math.min(290, py)) }
                                const isTarget = isSeeker ? (p.role !== 'seeker') : (p.role === 'seeker')
                                const dist = calcDistance(myPos.lat, myPos.lng, p.lat, p.lng)
                                return (
                                    <div key={p.id} style={{ position: 'absolute', left: clamped.x, top: clamped.y, transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 5 }}>
                                        <div style={{ fontSize: '1.2rem' }}>{p.avatar}</div>
                                        <div style={{ fontSize: '0.55rem', color: isTarget ? 'var(--red)' : 'var(--green)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            {p.name} · {Math.round(dist)}ft
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: '0.75rem', marginTop: 12 }}>
                            {allPositions.length} player(s) on map • Range: ~500ft
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Role Reveal */}
            <AnimatePresence>{showReveal && <RoleReveal role={state.myRole} teamName={state.myTeam} isVIP={state.isVIP} isAlpha={state.isAlphaSeeker} onDismiss={() => setShowReveal(false)} />}</AnimatePresence>

            {/* Countdown phase */}
            <AnimatePresence>
                {isCountdown && !showReveal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                        {isSeeker ? (
                            <><div style={{ fontSize: '4rem' }}>👁️</div><h2 style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>SEEKERS WAIT</h2>
                                <div className="timer" style={{ fontSize: '5rem', color: countdown < 10 ? 'var(--red)' : 'var(--text)' }}>{countdown}</div>
                                <p style={{ color: 'var(--text2)' }}>Hiders are hiding. Go in {countdown}s.</p></>
                        ) : (
                            <><div style={{ fontSize: '4rem' }}>🏃</div><h2 style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>HIDE NOW!</h2>
                                <div className="timer" style={{ fontSize: '5rem', color: countdown < 10 ? 'var(--red)' : 'var(--green)' }}>{countdown}</div>
                                <p style={{ color: 'var(--text2)' }}>Seekers release in {countdown}s!</p></>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── HUD Header ── */}
            <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
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
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Time Left</div>
                        <div className={`timer ${timeLeft < 120 ? 'urgent' : ''}`} style={{ fontSize: '1.4rem' }}>{fmt(timeLeft)}</div>
                    </div>
                </div>
                <div className="progress-bar"><div className={`progress-fill ${timeLeft < 120 ? 'danger' : ''}`} style={{ width: `${timeLeftPct}%` }} /></div>
            </div>

            {/* ── COMPASS ARROW (always visible during game) ── */}
            {isActive && nearestTarget && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: '0.65rem', color: isSeeker ? 'var(--red)' : 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>
                        {isSeeker ? '🎯 Nearest Hider' : '⚠️ Nearest Seeker'}
                    </div>
                    <div style={{
                        width: 120, height: 120, borderRadius: '50%',
                        background: `radial-gradient(circle, ${isSeeker ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)'} 0%, transparent 70%)`,
                        border: `2px solid ${isSeeker ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                    }}>
                        <motion.div
                            animate={{ rotate: arrowRotation }}
                            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                            style={{ fontSize: '3rem', transformOrigin: 'center' }}
                        >
                            ➤
                        </motion.div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: isSeeker ? 'var(--red)' : 'var(--green)' }}>
                            {nearestTarget.distance} ft
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
                            {nearestTarget.avatar} {nearestTarget.name}
                        </div>
                    </div>
                </div>
            )}

            {/* GPS status */}
            {isActive && !myPos && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', margin: '8px 16px', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--red)' }}>
                    📍 Waiting for GPS... Please enable location services.
                </div>
            )}

            {/* Map Flash Button */}
            {isActive && (
                <div style={{ padding: '0 16px', marginBottom: 8 }}>
                    <button
                        className={`btn btn-full ${mapCooldown > 0 ? 'btn-ghost' : isSeeker ? 'btn-primary' : 'btn-green'}`}
                        onClick={triggerMapFlash}
                        disabled={mapCooldown > 0}
                        style={{ fontSize: '0.9rem' }}
                    >
                        {mapCooldown > 0 ? `📡 Map Cooldown (${mapCooldown}s)` : `📡 Flash Map (${flashDuration}s view)`}
                    </button>
                </div>
            )}

            {/* Jammer status */}
            {state.jammerActive && (
                <div style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', margin: '8px 16px', borderRadius: 'var(--r-sm)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>🛡️</span><span style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '0.85rem' }}>JAMMER ACTIVE — You cannot be tagged</span>
                </div>
            )}

            {/* Bounty alert */}
            {state.bounty && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', margin: '8px 16px', borderRadius: 'var(--r-md)', padding: '14px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--yellow)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>🎯 BOUNTY: {state.bounty.targetName}</div>
                    <div style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>+{state.bounty.bonusPoints} pts if caught</div>
                </motion.div>
            )}

            {/* ── Tabs ── */}
            <div style={{ padding: '8px 16px 0' }}>
                <div className="tab-bar" style={{ marginBottom: 16 }}>
                    <button className={`tab ${activeTab === 'hud' ? 'active' : ''}`} onClick={() => setActiveTab('hud')}>HUD</button>
                    <button className={`tab ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>Players</button>
                    <button className={`tab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>Events</button>
                    {state.isHost && <button className={`tab ${activeTab === 'host' ? 'active' : ''}`} onClick={() => setActiveTab('host')}>Host</button>}
                </div>

                {/* HUD tab */}
                {activeTab === 'hud' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Zone status */}
                        {rules.shrinkingZone?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div className="section-header">Zone Status</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {state.gameState?.zones?.map(z => (
                                        <span key={z.id} className={`zone-pill ${state.closedZones?.includes(z.id) ? 'zone-closed' : 'zone-active'}`}>
                                            {state.closedZones?.includes(z.id) ? '☠️' : '✅'} {z.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* Objectives */}
                        <div className="card" style={{ padding: 16 }}>
                            <div className="section-header">Objectives</div>
                            {isSeeker && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🔴</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Find and tag all hiders. Use the compass arrow!</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>📡</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Flash map for 15s — see all hider locations (60s cooldown)</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🎯</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Tap a hider in Players tab → "Mark Found" to eliminate them</p></div>
                                </div>
                            )}
                            {(isHider || isAssassin) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🟢</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Survive until timer runs out!</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>📡</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Flash map for 5s to see seeker locations (60s cooldown)</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>🔊</span><p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--red)' }}>Your phone will make LOUD sounds near zone closings!</p></div>
                                    <div style={{ display: 'flex', gap: 10 }}><span>⚠️</span><p style={{ margin: 0, fontSize: '0.9rem' }}>Arrow shows nearest seeker — keep your distance!</p></div>
                                </div>
                            )}
                        </div>
                        {/* Supply Cache / Jailbreak / Blackout */}
                        {(isHider || isAssassin) && rules.supplyCaches?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>📦 Supply Cache</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input input-code" style={{ fontSize: '1.4rem', letterSpacing: '0.3em', flex: 1 }}
                                        value={cacheInput} onChange={e => setCacheInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                        onKeyDown={e => e.key === 'Enter' && redeemCache()} placeholder="000" maxLength={3} />
                                    <button className="btn btn-secondary" onClick={redeemCache} disabled={cacheInput.length !== 3}>Redeem</button>
                                </div>
                                {cacheMsg && <div className={`msg ${cacheMsg.startsWith('✅') ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 8 }}>{cacheMsg}</div>}
                            </div>
                        )}
                        {state.isAlphaSeeker && rules.blackoutProtocol?.enabled && !state.gameState?.blackoutUsed && (
                            <div className="card" style={{ padding: 16, border: '1px solid rgba(239,68,68,0.3)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>🌑 Blackout Protocol</div>
                                <button className="btn btn-primary btn-full" onClick={useBlackout}>⚡ ACTIVATE BLACKOUT</button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Players tab — with seeker tagging */}
                {activeTab === 'players' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">
                            {isSeeker ? 'Tap a hider to mark as found' : 'Player Status'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {state.players?.map(p => {
                                const isCaught = p.status === 'caught' || p.status === 'jailed'
                                const pRole = p.role || (p.id === state.myId ? state.myRole : null)
                                const isTargetable = isSeeker && pRole !== 'seeker' && p.status === 'alive' && p.id !== state.myId
                                const label = pRole === 'seeker' ? '🔴 Seeker' : isCaught ? '💀 Found' : '🟢 Hidden'
                                return (
                                    <div key={p.id}
                                        className={`card ${isTargetable ? 'card-hover' : ''}`}
                                        onClick={() => isTargetable && initiateTag(p)}
                                        style={{
                                            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                                            borderRadius: 'var(--r-md)', cursor: isTargetable ? 'pointer' : 'default',
                                            opacity: isCaught ? 0.5 : 1,
                                            border: isTargetable ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.4rem' }}>{p.avatar}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: isCaught ? 'var(--text3)' : p.color || 'var(--text)', textDecoration: isCaught ? 'line-through' : 'none' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{label}</div>
                                        </div>
                                        {p.id === state.myId && <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>YOU</span>}
                                        {isTargetable && <span style={{ color: 'var(--red)', fontSize: '0.8rem', fontWeight: 700 }}>TAP TO TAG →</span>}
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {/* Events tab */}
                {activeTab === 'events' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="section-header">Event Log</div>
                        {state.events?.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>No events yet.</p>}
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
                            <button className="btn btn-ghost btn-full" onClick={endGame} style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>⏹ End Game Now</button>
                        </div>
                        <div className="card" style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 12 }}>Game Info</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem', color: 'var(--text2)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Room</span><span style={{ fontFamily: 'var(--font-mono)' }}>{state.roomCode}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mode</span><span>{state.modeName}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Players</span><span>{state.players?.length || 0}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Elapsed</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(gameTimer)}</span></div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            <ToastEvents events={state.events} />
        </div>
    )
}
