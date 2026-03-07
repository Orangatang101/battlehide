import { useEffect } from 'react'
import { motion } from 'framer-motion'

const ROLE_CONFIG = {
    seeker: { label: 'SEEKER', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', glow: 'rgba(239,68,68,0.4)', icon: '🔴', desc: 'Hunt down the hiders. Show no mercy.' },
    hider: { label: 'HIDER', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', glow: 'rgba(34,197,94,0.4)', icon: '🟢', desc: 'Stay hidden. Survive at all costs.' },
    assassin: { label: 'ASSASSIN', color: '#a855f7', bg: 'rgba(168,85,247,0.08)', glow: 'rgba(168,85,247,0.4)', icon: '⚡', desc: 'Your target is the Alpha Seeker. Strike fast.' },
    traitor: { label: 'TRAITOR', color: '#f97316', bg: 'rgba(249,115,22,0.08)', glow: 'rgba(249,115,22,0.4)', icon: '🟠', desc: 'You have been turned. Join the hunters.' },
}

export default function RoleReveal({ role, teamName, isVIP, isAlpha, onDismiss }) {
    const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.hider

    useEffect(() => {
        // Siren sound
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.setValueAtTime(400, ctx.currentTime)
            osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.3)
            osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.6)
            gain.gain.setValueAtTime(0.3, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
            osc.start(); osc.stop(ctx.currentTime + 0.8)
        } catch (e) { }
    }, [])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: `radial-gradient(ellipse at center, ${cfg.bg} 0%, #000 70%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 20, padding: 32, cursor: 'pointer',
            }}
            onClick={onDismiss}
        >
            {/* Glowing ring */}
            <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                    position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                    border: `2px solid ${cfg.color}`,
                    boxShadow: `0 0 60px ${cfg.glow}`,
                }}
            />

            {/* Icon */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
                style={{ fontSize: '5rem', position: 'relative', zIndex: 1 }}
            >
                {cfg.icon}
            </motion.div>

            {/* Role text */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}
            >
                <div style={{ fontSize: '0.75rem', color: cfg.color, fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', marginBottom: 8 }}>
                    YOU ARE
                </div>
                <div style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 900,
                    fontSize: 'clamp(3rem, 12vw, 5rem)',
                    color: cfg.color,
                    textShadow: `0 0 40px ${cfg.glow}, 0 0 80px ${cfg.glow}`,
                    lineHeight: 1,
                }}>
                    {cfg.label}
                </div>
                {teamName && (
                    <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>
                        {teamName}
                    </div>
                )}
                {isVIP && (
                    <div style={{ marginTop: 8 }}>
                        <span style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}>
                            ⭐ YOU ARE THE VIP — Do not run
                        </span>
                    </div>
                )}
                {isAlpha && (
                    <div style={{ marginTop: 8 }}>
                        <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem' }}>
                            👑 ALPHA SEEKER — You lead the hunt
                        </span>
                    </div>
                )}
                <div style={{ marginTop: 16, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>{cfg.desc}</div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', marginTop: 20 }}
            >
                Tap to dismiss
            </motion.div>
        </motion.div>
    )
}
