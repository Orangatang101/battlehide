import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 3,
}))

export default function LandingPage() {
    const navigate = useNavigate()

    return (
        <div className="page noise" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Animated background */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 0,
                background: 'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 90%, rgba(168,85,247,0.05) 0%, transparent 50%), #070a0f',
            }} />

            {/* Particle field */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
                {particles.map(p => (
                    <motion.div
                        key={p.id}
                        style={{
                            position: 'absolute',
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: p.size,
                            height: p.size,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.3)',
                        }}
                        animate={{ y: [0, -30, 0], opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 4 + p.delay, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
                    />
                ))}
            </div>

            {/* Grid overlay */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
            }} />

            <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', minHeight: '100dvh' }}>
                {/* Logo badge */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ marginBottom: 32 }}
                >
                    <span className="badge badge-red" style={{ fontSize: '0.7rem', padding: '6px 14px', letterSpacing: '0.15em' }}>
                        🏫 UT AUSTIN CAMPUS EDITION
                    </span>
                </motion.div>

                {/* Main title */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="text-center"
                    style={{ marginBottom: 24 }}
                >
                    <h1 style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'clamp(2.5rem, 10vw, 5.5rem)',
                        fontWeight: 900,
                        lineHeight: 0.9,
                        letterSpacing: '-0.03em',
                        background: 'linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.5) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        MCCOMBS<br />
                        <span style={{
                            background: 'linear-gradient(135deg, var(--red) 0%, #ff6b6b 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>MAFIA</span>
                    </h1>
                </motion.div>

                {/* Tagline */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={{ color: 'var(--text2)', fontSize: '1.1rem', textAlign: 'center', maxWidth: 480, marginBottom: 48, lineHeight: 1.6 }}
                >
                    The campus is your arena. Up to 40 players. Real UT Austin buildings.
                    Floor-based zones. Zero mercy.
                </motion.p>

                {/* Action Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}
                >
                    <button className="btn btn-primary btn-lg btn-full" onClick={() => navigate('/create')} style={{ fontSize: '1rem' }}>
                        ⚔️ Create Room
                    </button>
                    <button className="btn btn-secondary btn-lg btn-full" onClick={() => navigate('/join')} style={{ fontSize: '1rem' }}>
                        🔗 Join Room
                    </button>
                </motion.div>

                {/* Building badges */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 48 }}
                >
                    {[
                        { icon: '📚', label: 'PCL' },
                        { icon: '🏛️', label: 'Rowling Hall' },
                        { icon: '🔬', label: 'PMA' },
                        { icon: '⚡', label: 'EER' },
                    ].map(m => (
                        <span key={m.label} className="badge badge-gray">
                            {m.icon} {m.label}
                        </span>
                    ))}
                </motion.div>

                {/* Feature pills */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 600 }}
                >
                    {['🎯 Bounty Contracts', '🕵️ Traitor Mechanic', '🔓 Jailbreak', '📦 Supply Caches', '⚡ Assassin Class', '🌑 Blackout', '📡 Location Pings', '🚨 Paranoia Timer'].map(f => (
                        <span key={f} style={{ fontSize: '0.72rem', color: 'var(--text3)', padding: '3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--border)' }}>
                            {f}
                        </span>
                    ))}
                </motion.div>

                {/* Bottom note */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    style={{ marginTop: 48, color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center' }}
                >
                    No download required. Works on any phone browser. Up to 40 players.
                </motion.p>
            </div>
        </div>
    )
}
