import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../SocketContext'
import { useGame } from '../GameContext'
import RoleReveal from '../components/RoleReveal'
import ToastEvents from '../components/ToastEvents'

// ── GPS Helpers ──────────────────────────────────────────────────────────
function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 20902231
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
function calcBearing(lat1, lng1, lat2, lng2) {
    const dLng = (lng2 - lng1) * Math.PI / 180
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180)
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng)
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// ── Circular Progress Ring ───────────────────────────────────────────────
function CooldownRing({ progress, size = 160, stroke = 4, color = '#ef4444', children }) {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - progress)
    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                    strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                {children}
            </div>
        </div>
    )
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
    const [heading, setHeading] = useState(0)

    // Arrow state (cooldown-based)
    const [arrowTarget, setArrowTarget] = useState(null) // locked target during active period
    const [arrowActive, setArrowActive] = useState(false)
    const [arrowCooldown, setArrowCooldown] = useState(0) // seconds remaining
    const [arrowTimeLeft, setArrowTimeLeft] = useState(0) // seconds of visibility remaining
    const arrowPollRef = useRef(null)

    // Map flash state
    const [allPositions, setAllPositions] = useState([])
    const [mapFlashActive, setMapFlashActive] = useState(false)
    const [mapCooldown, setMapCooldown] = useState(0)
    const [mapTimeLeft, setMapTimeLeft] = useState(0)

    // Tag confirm
    const [tagConfirm, setTagConfirm] = useState(null)

    const isSeeker = state.myRole === 'seeker'
    const isHider = state.myRole === 'hider'
    const isAssassin = state.myRole === 'assassin'
    const isCountdown = state.roomStatus === 'countdown'
    const isActive = state.roomStatus === 'active'
    const rules = state.rules?.features || {}

    // ── Timing Config ─────────────────────────────────────────────────────────
    // Seekers: 20s arrow, 60s cooldown | Hiders: 10s arrow, 60s cooldown
    const arrowDuration = isSeeker ? 20 : 10
    const arrowCooldownSec = 60
    // Seekers: 15s map, 60s cooldown | Hiders: 5s map, 60s cooldown
    const flashDuration = isSeeker ? 15 : 5
    const flashCooldownSec = 60

    // ── GPS Tracking ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy, altitude } = pos.coords
                setMyPos({ lat: latitude, lng: longitude, accuracy, altitude })
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

    // ── Device Compass ────────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => { if (e.alpha != null) setHeading(e.alpha) }
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
            DeviceOrientationEvent.requestPermission().then(r => {
                if (r === 'granted') window.addEventListener('deviceorientation', handler)
            }).catch(() => { })
        } else {
            window.addEventListener('deviceorientation', handler)
        }
        return () => window.removeEventListener('deviceorientation', handler)
    }, [])

    // ── Arrow: Activate & Lock On ─────────────────────────────────────────────
    const activateArrow = useCallback(() => {
        if (arrowCooldown > 0 || arrowActive || !myPos || !isActive) return
        // Fetch positions and find nearest
        socket?.emit('game:getPositions', { code: state.roomCode }, (positions) => {
            if (!positions?.length || !myPos) return
            const targets = positions.filter(p =>
                isSeeker ? (p.role === 'hider' || p.role === 'assassin') : p.role === 'seeker'
            )
            if (targets.length === 0) return

            let closest = null, closestDist = Infinity
            for (const t of targets) {
                const d = calcDistance(myPos.lat, myPos.lng, t.lat, t.lng)
                if (d < closestDist) { closestDist = d; closest = t }
            }
            if (!closest) return

            // Lock onto this target
            const bearing = calcBearing(myPos.lat, myPos.lng, closest.lat, closest.lng)
            setArrowTarget({
                id: closest.id, bearing, distance: Math.round(closestDist),
                name: closest.name, avatar: closest.avatar, role: closest.role,
                lat: closest.lat, lng: closest.lng,
            })
            setArrowActive(true)
            setArrowTimeLeft(arrowDuration)

            // Keep updating bearing & distance during active period
            arrowPollRef.current = setInterval(() => {
                socket?.emit('game:getPositions', { code: state.roomCode }, (pos) => {
                    if (!pos?.length) return
                    const updated = pos.find(p => p.id === closest.id)
                    if (updated && myPos) {
                        const b = calcBearing(myPos.lat, myPos.lng, updated.lat, updated.lng)
                        const d = calcDistance(myPos.lat, myPos.lng, updated.lat, updated.lng)
                        setArrowTarget(prev => prev ? { ...prev, bearing: b, distance: Math.round(d), lat: updated.lat, lng: updated.lng } : prev)
                    }
                })
            }, 1500)
        })
    }, [arrowCooldown, arrowActive, myPos, isActive, socket, state.roomCode, isSeeker, arrowDuration])

    // Arrow active countdown
    useEffect(() => {
        if (!arrowActive) return
        const i = setInterval(() => {
            setArrowTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(i)
                    clearInterval(arrowPollRef.current)
                    setArrowActive(false)
                    setArrowTarget(null)
                    setArrowCooldown(arrowCooldownSec)
                    return 0
                }
                return t - 1
            })
        }, 1000)
        return () => clearInterval(i)
    }, [arrowActive, arrowCooldownSec])

    // Arrow cooldown timer
    useEffect(() => {
        if (arrowCooldown <= 0) return
        const i = setInterval(() => setArrowCooldown(c => Math.max(0, c - 1)), 1000)
        return () => clearInterval(i)
    }, [arrowCooldown])

    // ── Map Flash Logic ───────────────────────────────────────────────────────
    const triggerMapFlash = useCallback(() => {
        if (mapCooldown > 0 || !isActive) return
        socket?.emit('game:getPositions', { code: state.roomCode }, (positions) => {
            setAllPositions(positions || [])
            setMapFlashActive(true)
            setMapTimeLeft(flashDuration)
            setMapCooldown(flashCooldownSec)
        })
    }, [mapCooldown, isActive, socket, state.roomCode, flashDuration, flashCooldownSec])

    // Map flash countdown
    useEffect(() => {
        if (!mapFlashActive) return
        const i = setInterval(() => {
            setMapTimeLeft(t => { if (t <= 1) { clearInterval(i); setMapFlashActive(false); return 0 }; return t - 1 })
        }, 1000)
        return () => clearInterval(i)
    }, [mapFlashActive])

    // Map cooldown timer
    useEffect(() => {
        if (mapCooldown <= 0) return
        const i = setInterval(() => setMapCooldown(c => Math.max(0, c - 1)), 1000)
        return () => clearInterval(i)
    }, [mapCooldown])

    // Countdown timer
    useEffect(() => {
        if (!isCountdown) return
        setCountdown(state.countdown || 60)
        const i = setInterval(() => { setCountdown(c => { if (c <= 1) { clearInterval(i); return 0 }; return c - 1 }) }, 1000)
        return () => clearInterval(i)
    }, [isCountdown])

    // Game timer
    useEffect(() => {
        if (!state.gameState?.startTime) return
        const i = setInterval(() => setGameTimer(Math.floor((Date.now() - state.gameState.startTime) / 1000)), 1000)
        return () => clearInterval(i)
    }, [state.gameState?.startTime])

    useEffect(() => { const t = setTimeout(() => setShowReveal(false), 4000); return () => clearTimeout(t) }, [])

    // ── Actions ───────────────────────────────────────────────────────────────
    const initiateTag = (player) => setTagConfirm({ id: player.id, name: player.name, avatar: player.avatar })
    const confirmTag = () => {
        if (!tagConfirm) return
        socket?.emit('player:markFound', { code: state.roomCode, targetId: tagConfirm.id }, (res) => {
            if (res?.error) setCacheMsg(res.error)
            setTagConfirm(null)
        })
    }
    const clearParanoia = () => { dispatch({ type: 'PARANOIA_CLEAR' }); socket?.emit('paranoia:moved', { code: state.roomCode }) }
    const startJailbreak = () => {
        setJailbreakHeld(true); setJailbreakProgress(0)
        const totalMs = (rules.jailbreakTerminals?.holdSeconds || 15) * 1000, start = Date.now()
        jailbreakTimerRef.current = setInterval(() => {
            const pct = Math.min(((Date.now() - start) / totalMs) * 100, 100); setJailbreakProgress(pct)
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
    const accentColor = isSeeker ? '#ef4444' : '#22c55e'
    const accentBg = isSeeker ? 'rgba(239,68,68,' : 'rgba(34,197,94,'
    const roleIcon = { seeker: '🔴', hider: '🟢', assassin: '⚡' }[state.myRole] || '⬜'
    const arrowRotation = arrowTarget ? (arrowTarget.bearing - heading + 360) % 360 : 0

    return (
        <div className="page" style={{ background: 'var(--bg)', paddingBottom: 140 }}>

            {/* ═══ OVERLAYS ═══════════════════════════════════════════════════ */}

            {/* Blackout */}
            <AnimatePresence>
                {state.blackoutActive && (
                    <motion.div className="blackout-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>🌑</div><h2>BLACKOUT PROTOCOL</h2>
                        <p style={{ color: 'rgba(255,255,255,0.5)' }}>All systems down.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Audio Trap */}
            <AnimatePresence>
                {state.audioTrapFired && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg, rgba(239,68,68,0.97), rgba(220,38,38,0.97))', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
                        <motion.div animate={{ scale: [1, 1.4, 1], rotate: [0, 15, -15, 0] }} transition={{ duration: 0.4, repeat: Infinity }} style={{ fontSize: '7rem', filter: 'drop-shadow(0 0 30px rgba(255,255,255,0.3))' }}>🔊</motion.div>
                        <h2 style={{ color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '2.2rem', textAlign: 'center', textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}>AUDIO TRAP!</h2>
                        <p style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: '1.1rem', maxWidth: 280 }}>Your phone is making noise! Everyone can hear you!</p>
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }}
                            style={{ width: 200, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.5)' }} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tag Confirmation */}
            <AnimatePresence>
                {tagConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(8px)' }}>
                        <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }}
                            style={{ background: 'var(--bg2)', borderRadius: 20, padding: '36px 28px', textAlign: 'center', maxWidth: 340, width: '100%', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🎯</div>
                            <h3 style={{ marginBottom: 4, fontSize: '1.3rem' }}>Mark as Found?</h3>
                            <div style={{ fontSize: '2rem', marginBottom: 4 }}>{tagConfirm.avatar}</div>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>{tagConfirm.name}</p>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text3)', marginBottom: 24 }}>This action cannot be undone</p>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn btn-ghost btn-full" onClick={() => setTagConfirm(null)} style={{ borderRadius: 12, padding: '14px 0' }}>Cancel</button>
                                <button className="btn btn-primary btn-full" onClick={confirmTag} style={{ borderRadius: 12, padding: '14px 0', background: 'var(--red)' }}>✅ Confirm</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Paranoia */}
            <AnimatePresence>
                {state.paranoiaActive && (
                    <motion.div className="paranoia-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ fontSize: '4rem' }}>⚠️</div><h2 style={{ color: '#000' }}>MOVE NOW!</h2>
                        <p style={{ color: '#333' }}>Move {rules.paranoiaTimer?.requiredMovementFeet || 30} feet.</p>
                        <button className="btn btn-primary" onClick={clearParanoia}>I'm Moving! ✓</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MAP FLASH OVERLAY */}
            <AnimatePresence>
                {mapFlashActive && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 750, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)' }}>
                        {/* Timer */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }}
                                style={{ width: 10, height: 10, borderRadius: '50%', background: accentColor }} />
                            <span style={{ fontSize: '0.75rem', color: accentColor, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                                📡 {isSeeker ? 'HIDER SCAN' : 'SEEKER SCAN'} — {mapTimeLeft}s
                            </span>
                        </div>
                        {/* Radar map */}
                        <div style={{
                            position: 'relative', width: 300, height: 300,
                            borderRadius: '50%', overflow: 'hidden',
                            background: `radial-gradient(circle, ${accentBg}0.04) 0%, ${accentBg}0.01) 50%, transparent 70%)`,
                            border: `1px solid ${accentBg}0.25)`,
                            boxShadow: `0 0 40px ${accentBg}0.1), inset 0 0 40px ${accentBg}0.05)`,
                        }}>
                            {/* Grid lines */}
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 150, height: 150, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)' }} />
                            {/* You (center) */}
                            <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
                                style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: 'var(--blue)', border: '2px solid #fff', zIndex: 10, boxShadow: '0 0 12px rgba(59,130,246,0.6)' }} />
                            {/* Players */}
                            {myPos && allPositions.map(p => {
                                const dx = (p.lng - myPos.lng) * 364000
                                const dy = (p.lat - myPos.lat) * 364000
                                const maxR = 500
                                const px = 150 + (dx / maxR) * 130
                                const py = 150 - (dy / maxR) * 130
                                const cx = Math.max(16, Math.min(284, px)), cy = Math.max(16, Math.min(284, py))
                                const isTgt = isSeeker ? (p.role !== 'seeker') : (p.role === 'seeker')
                                const dist = calcDistance(myPos.lat, myPos.lng, p.lat, p.lng)
                                return (
                                    <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 }}
                                        style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', textAlign: 'center', zIndex: 5 }}>
                                        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity, delay: Math.random() }}
                                            style={{ fontSize: '1.3rem', filter: `drop-shadow(0 0 6px ${isTgt ? accentColor : 'rgba(59,130,246,0.5)'})` }}>{p.avatar}</motion.div>
                                        <div style={{ fontSize: '0.55rem', color: isTgt ? accentColor : '#60a5fa', fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                            {p.name} · {Math.round(dist)}ft
                                        </div>
                                    </motion.div>
                                )
                            })}
                            {/* Sweep animation */}
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                                style={{ position: 'absolute', left: '50%', top: '50%', width: '50%', height: 2, transformOrigin: 'left center', background: `linear-gradient(90deg, ${accentBg}0.4), transparent)` }} />
                        </div>
                        <div style={{ color: 'var(--text3)', fontSize: '0.72rem', marginTop: 16, fontFamily: 'var(--font-mono)' }}>
                            {allPositions.length} target(s) detected • ~500ft range
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Role Reveal */}
            <AnimatePresence>{showReveal && <RoleReveal role={state.myRole} teamName={state.myTeam} isVIP={state.isVIP} isAlpha={state.isAlphaSeeker} onDismiss={() => setShowReveal(false)} />}</AnimatePresence>

            {/* Countdown */}
            <AnimatePresence>
                {isCountdown && !showReveal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                        <CooldownRing progress={countdown / (state.countdown || 60)} size={200} stroke={6} color={isSeeker ? '#ef4444' : '#22c55e'}>
                            <div style={{ fontSize: '4rem', marginBottom: 4 }}>{isSeeker ? '👁️' : '🏃'}</div>
                            <div className="timer" style={{ fontSize: '3rem', color: countdown < 10 ? '#ef4444' : '#fff', fontFamily: 'var(--font-mono)' }}>{countdown}</div>
                        </CooldownRing>
                        <h2 style={{ color: isSeeker ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '1.4rem' }}>
                            {isSeeker ? 'SEEKERS WAIT' : 'HIDE NOW!'}
                        </h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
                            {isSeeker ? `Hiders are hiding. Go in ${countdown}s.` : `Seekers release in ${countdown}s!`}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ HUD HEADER ═════════════════════════════════════════════════ */}
            <div style={{
                background: 'linear-gradient(180deg, var(--bg2) 0%, rgba(15,15,20,0.95) 100%)',
                borderBottom: '1px solid var(--border)', padding: '14px 18px', position: 'sticky', top: 0, zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${accentBg}0.12)`, border: `1px solid ${accentBg}0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>{roleIcon}</div>
                        <div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Role</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: accentColor, fontSize: '0.95rem' }}>
                                {state.myTeam}
                                {state.isVIP && <span style={{ marginLeft: 6, color: 'var(--yellow)', fontSize: '0.7rem' }}>⭐ VIP</span>}
                                {state.isAlphaSeeker && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', padding: '2px 6px', borderRadius: 4 }}>ALPHA</span>}
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Remaining</div>
                        <div className={`timer ${timeLeft < 120 ? 'urgent' : ''}`} style={{ fontSize: '1.5rem', fontFamily: 'var(--font-mono)' }}>{fmt(timeLeft)}</div>
                    </div>
                </div>
                <div className="progress-bar" style={{ height: 3, borderRadius: 2 }}>
                    <div className={`progress-fill ${timeLeft < 120 ? 'danger' : ''}`} style={{ width: `${timeLeftPct}%`, borderRadius: 2, transition: 'width 1s linear' }} />
                </div>
            </div>

            {/* ═══ COMPASS ARROW SECTION ══════════════════════════════════════ */}
            {isActive && (
                <div style={{ padding: '20px 16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {arrowActive && arrowTarget ? (
                        /* ACTIVE: show locked-on arrow with countdown ring */
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: '0.6rem', color: accentColor, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 4 }}>
                                {isSeeker ? '🎯 TRACKING HIDER' : '⚠️ TRACKING SEEKER'} — {arrowTimeLeft}s
                            </div>
                            <CooldownRing progress={arrowTimeLeft / arrowDuration} size={160} stroke={5} color={accentColor}>
                                <motion.div
                                    animate={{ rotate: arrowRotation }}
                                    transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                                    style={{ fontSize: '3.5rem', filter: `drop-shadow(0 0 12px ${accentBg}0.4))` }}
                                >➤</motion.div>
                            </CooldownRing>
                            <div style={{ textAlign: 'center', marginTop: 4 }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: accentColor, lineHeight: 1 }}>
                                    {arrowTarget.distance}<span style={{ fontSize: '0.9rem', fontWeight: 600, marginLeft: 4 }}>ft</span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginTop: 4 }}>
                                    {arrowTarget.avatar} {arrowTarget.name}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        /* INACTIVE: show activate button or cooldown */
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 320 }}>
                            {arrowCooldown > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                    <CooldownRing progress={1 - arrowCooldown / arrowCooldownSec} size={100} stroke={4} color="rgba(255,255,255,0.2)">
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', color: 'var(--text3)' }}>{arrowCooldown}s</div>
                                    </CooldownRing>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Compass recharging...</div>
                                </div>
                            ) : (
                                <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={activateArrow}
                                    disabled={!myPos}
                                    style={{
                                        width: '100%', padding: '18px 24px', borderRadius: 16, border: 'none', cursor: 'pointer',
                                        background: `linear-gradient(135deg, ${accentBg}0.15), ${accentBg}0.08))`,
                                        border: `1.5px solid ${accentBg}0.35)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div style={{ fontSize: '2rem' }}>🧭</div>
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ fontWeight: 700, color: accentColor, fontSize: '1rem', fontFamily: 'var(--font-mono)' }}>
                                            ACTIVATE COMPASS
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                                            Lock onto nearest {isSeeker ? 'hider' : 'seeker'} for {arrowDuration}s
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '1.2rem', color: accentColor }}>→</div>
                                </motion.button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* GPS warning */}
            {isActive && !myPos && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', margin: '0 16px 8px', borderRadius: 12, padding: '12px 16px', fontSize: '0.82rem', color: 'var(--red)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>📍</motion.span>
                    Waiting for GPS signal... Enable location services.
                </motion.div>
            )}

            {/* ═══ ACTION BUTTONS ROW ════════════════════════════════════════ */}
            {isActive && (
                <div style={{ padding: '0 16px 12px', display: 'flex', gap: 10 }}>
                    {/* Map Flash */}
                    <motion.button whileTap={{ scale: 0.96 }}
                        onClick={triggerMapFlash} disabled={mapCooldown > 0}
                        style={{
                            flex: 1, padding: '14px', borderRadius: 14, border: 'none', cursor: mapCooldown > 0 ? 'default' : 'pointer',
                            background: mapCooldown > 0 ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${accentBg}0.12), ${accentBg}0.06))`,
                            border: `1px solid ${mapCooldown > 0 ? 'var(--border)' : accentBg + '0.3)'}`,
                            textAlign: 'center', opacity: mapCooldown > 0 ? 0.5 : 1, transition: 'all 0.2s',
                        }}
                    >
                        <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>📡</div>
                        <div style={{ fontWeight: 700, color: mapCooldown > 0 ? 'var(--text3)' : accentColor, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            {mapCooldown > 0 ? `${mapCooldown}s` : 'MAP SCAN'}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text3)' }}>{flashDuration}s view</div>
                    </motion.button>
                </div>
            )}

            {/* Jammer / Bounty banners */}
            {state.jammerActive && (
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', margin: '0 16px 8px', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                    <span style={{ color: 'var(--purple)', fontWeight: 600, fontSize: '0.85rem' }}>JAMMER ACTIVE — You are invisible to tag</span>
                </motion.div>
            )}
            {state.bounty && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', margin: '0 16px 8px', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--yellow)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>🎯 BOUNTY: {state.bounty.targetName} • +{state.bounty.bonusPoints}pts</div>
                </motion.div>
            )}

            {/* ═══ TABS ══════════════════════════════════════════════════════ */}
            <div style={{ padding: '0 16px' }}>
                <div className="tab-bar" style={{ marginBottom: 14, gap: 2 }}>
                    {['hud', 'players', 'events', ...(state.isHost ? ['host'] : [])].map(tab => (
                        <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)} style={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>
                            {tab === 'hud' ? '📊 HUD' : tab === 'players' ? '👥 Players' : tab === 'events' ? '📜 Events' : '⚙️ Host'}
                        </button>
                    ))}
                </div>

                {/* HUD tab */}
                {activeTab === 'hud' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {rules.shrinkingZone?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div className="section-header" style={{ marginBottom: 10 }}>⚡ Zone Status</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {state.gameState?.zones?.map(z => {
                                        const closed = state.closedZones?.includes(z.id)
                                        return (
                                            <motion.span key={z.id} layout className={`zone-pill ${closed ? 'zone-closed' : 'zone-active'}`}
                                                style={{ fontSize: '0.72rem', padding: '5px 10px', borderRadius: 8 }}>
                                                {closed ? '☠️' : '✅'} {z.name}
                                            </motion.span>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="card" style={{ padding: 16 }}>
                            <div className="section-header" style={{ marginBottom: 10 }}>🎮 Objectives</div>
                            {isSeeker ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <Tip icon="🔴" text="Find and tag all hiders before time runs out" />
                                    <Tip icon="🧭" text={`Compass locks onto nearest hider for ${arrowDuration}s (${arrowCooldownSec}s cooldown)`} />
                                    <Tip icon="📡" text={`Map scan shows all hiders for ${flashDuration}s (${flashCooldownSec}s cooldown)`} />
                                    <Tip icon="🎯" text="Players tab → tap hider name → confirm to eliminate" />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <Tip icon="🟢" text="Survive until the timer expires!" />
                                    <Tip icon="⚠️" text={`Compass shows nearest seeker for ${arrowDuration}s (${arrowCooldownSec}s cooldown)`} />
                                    <Tip icon="📡" text={`Map scan shows seekers for ${flashDuration}s — use wisely!`} />
                                    <Tip icon="🔊" text="Audio trap may trigger your phone near zone closes!" highlight />
                                </div>
                            )}
                        </div>
                        {(isHider || isAssassin) && rules.supplyCaches?.enabled && (
                            <div className="card" style={{ padding: 16 }}>
                                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem' }}>📦 Supply Cache</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="input input-code" style={{ fontSize: '1.4rem', letterSpacing: '0.3em', flex: 1, borderRadius: 12 }}
                                        value={cacheInput} onChange={e => setCacheInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                        onKeyDown={e => e.key === 'Enter' && redeemCache()} placeholder="000" maxLength={3} />
                                    <button className="btn btn-secondary" onClick={redeemCache} disabled={cacheInput.length !== 3} style={{ borderRadius: 12 }}>Redeem</button>
                                </div>
                                {cacheMsg && <div className={`msg ${cacheMsg.startsWith('✅') ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 8, borderRadius: 10 }}>{cacheMsg}</div>}
                            </div>
                        )}
                        {state.isAlphaSeeker && rules.blackoutProtocol?.enabled && !state.gameState?.blackoutUsed && (
                            <div className="card" style={{ padding: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
                                <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 8, fontSize: '0.9rem' }}>🌑 Blackout Protocol</div>
                                <button className="btn btn-primary btn-full" onClick={useBlackout} style={{ borderRadius: 12 }}>⚡ ACTIVATE BLACKOUT</button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Players tab */}
                {activeTab === 'players' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="section-header" style={{ marginBottom: 12 }}>
                            {isSeeker ? '🎯 Tap a hider to mark as found' : '👥 Player Status'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {state.players?.map(p => {
                                const isCaught = p.status === 'caught' || p.status === 'jailed'
                                const pRole = p.role || (p.id === state.myId ? state.myRole : null)
                                const isTargetable = isSeeker && pRole !== 'seeker' && p.status === 'alive' && p.id !== state.myId
                                const label = pRole === 'seeker' ? '🔴 Seeker' : isCaught ? '💀 Found' : '🟢 Hidden'
                                return (
                                    <motion.div key={p.id} layout whileTap={isTargetable ? { scale: 0.97 } : {}}
                                        onClick={() => isTargetable && initiateTag(p)}
                                        style={{
                                            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                                            borderRadius: 14, cursor: isTargetable ? 'pointer' : 'default',
                                            opacity: isCaught ? 0.45 : 1,
                                            background: isTargetable ? `${accentBg}0.04)` : 'var(--bg2)',
                                            border: isTargetable ? `1.5px solid ${accentBg}0.3)` : '1px solid var(--border)',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.5rem' }}>{p.avatar}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, color: isCaught ? 'var(--text3)' : p.color || 'var(--text)', textDecoration: isCaught ? 'line-through' : 'none', fontSize: '0.95rem' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 2 }}>{label}</div>
                                        </div>
                                        {p.id === state.myId && <span style={{ fontSize: '0.6rem', background: 'rgba(59,130,246,0.12)', color: 'var(--blue)', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>YOU</span>}
                                        {isTargetable && (
                                            <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1, repeat: Infinity }}
                                                style={{ color: 'var(--red)', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>TAP →</motion.span>
                                        )}
                                    </motion.div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {/* Events tab */}
                {activeTab === 'events' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="section-header" style={{ marginBottom: 12 }}>📜 Event Log</div>
                        {state.events?.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0' }}>No events yet.</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {state.events?.map((evt, i) => (
                                <motion.div key={evt.id} initial={i < 3 ? { opacity: 0, x: -10 } : false} animate={{ opacity: 1, x: 0 }}
                                    className={`msg msg-${evt.type === 'danger' ? 'error' : evt.type === 'warning' ? 'warning' : evt.type === 'success' ? 'success' : 'info'}`}
                                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderRadius: 10, fontSize: '0.82rem' }}>
                                    <span style={{ flex: 1 }}>{evt.message}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                                        {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Host tab */}
                {activeTab === 'host' && state.isHost && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
                            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: '0.95rem' }}>⚙️ Host Controls</div>
                            <button className="btn btn-ghost btn-full" onClick={endGame}
                                style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,0.25)', borderRadius: 12 }}>⏹ End Game Now</button>
                        </div>
                        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
                            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: '0.95rem' }}>📊 Game Info</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'var(--text2)' }}>
                                {[['Room', state.roomCode], ['Mode', state.modeName], ['Players', state.players?.length], ['Elapsed', fmt(gameTimer)]].map(([l, v]) => (
                                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{l}</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            <ToastEvents events={state.events} />
        </div>
    )
}

function Tip({ icon, text, highlight }) {
    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
            <p style={{ margin: 0, fontSize: '0.85rem', color: highlight ? 'var(--red)' : 'var(--text)', lineHeight: 1.5 }}>{text}</p>
        </div>
    )
}
