import { useState, useEffect } from 'react'

// Feature definitions with labels, descriptions, and editable settings
const FEATURE_DEFS = [
    {
        section: 'Core Timing',
        features: [
            { key: 'gameDuration', label: 'Game Duration', desc: 'Minutes until the game ends', type: 'ruleRoot', field: 'gameDuration', min: 5, max: 60, unit: 'min', isToggle: false },
            { key: 'countdownTime', label: 'Countdown Timer', desc: 'Seconds seekers wait before searching', type: 'ruleRoot', field: 'countdownTime', min: 10, max: 300, unit: 'sec', isToggle: false },
            { key: 'defaultSeekerCount', label: 'Seeker Count', desc: 'How many seekers at game start', type: 'ruleRoot', field: 'defaultSeekerCount', min: 1, max: 10, unit: '', isToggle: false },
        ]
    },
    {
        section: 'Detection Mechanics',
        features: [
            {
                key: 'shrinkingZone', label: '📍 Shrinking Zone', desc: 'Announce dead zones over time, forcing movement',
                isToggle: true,
                subFields: [
                    { field: 'intervalMinutes', label: 'Zone closes every', min: 2, max: 20, unit: 'min' },
                    { field: 'warningSeconds', label: 'Warning before close', min: 10, max: 120, unit: 'sec' },
                ]
            },
            {
                key: 'locationPings', label: '📡 Location Pings', desc: 'Seekers see hider sector every few minutes for 10 seconds',
                isToggle: true,
                subFields: [
                    { field: 'intervalMinutes', label: 'Ping every', min: 2, max: 15, unit: 'min' },
                    { field: 'durationSeconds', label: 'Ping visible for', min: 5, max: 30, unit: 'sec' },
                ]
            },
            {
                key: 'audioTrap', label: '🔊 Audio Trap', desc: 'Random loud beep plays on hider phones',
                isToggle: true,
                subFields: [
                    { field: 'intervalMinutes', label: 'Avg. interval', min: 1, max: 15, unit: 'min' },
                    { field: 'randomVarianceMinutes', label: 'Random variance ±', min: 0, max: 10, unit: 'min' },
                ]
            },
            {
                key: 'paranoiaTimer', label: '😰 Paranoia Timer', desc: "Screen flashes white if hiders stay still too long",
                isToggle: true,
                subFields: [
                    { field: 'stillnessMinutes', label: 'Trigger after', min: 1, max: 10, unit: 'min' },
                    { field: 'requiredMovementFeet', label: 'Required movement', min: 10, max: 200, unit: 'ft' },
                ]
            },
        ]
    },
    {
        section: 'Special Roles',
        features: [
            { key: 'lotteryDraft', label: '🎲 Lottery Draft', desc: 'Random role reveal animation', isToggle: true, subFields: [] },
            {
                key: 'traitorMechanic', label: '🕵️ Traitor Mechanic', desc: 'A hider secretly switches teams mid-game',
                isToggle: true,
                subFields: [
                    { field: 'activateAtMinute', label: 'Activate at minute', min: 2, max: 20, unit: 'min' },
                ]
            },
            { key: 'assassinClass', label: '⚡ Assassin Class', desc: 'One player can reset the seeker team by tagging the Alpha', isToggle: true, subFields: [] },
            {
                key: 'vipEscort', label: '⭐ VIP Escort', desc: 'One hider cannot run; hiders earn massive points keeping them alive',
                isToggle: true,
                subFields: [
                    { field: 'vipPoints', label: 'VIP survival bonus', min: 100, max: 2000, unit: 'pts' },
                ]
            },
        ]
    },
    {
        section: 'Objectives & Items',
        features: [
            {
                key: 'supplyCaches', label: '📦 Supply Caches', desc: 'Physical lockboxes with codes. Opening one grants a Jammer.',
                isToggle: true,
                subFields: [
                    { field: 'cacheCount', label: 'Number of caches', min: 1, max: 10, unit: '' },
                    { field: 'jammerDurationSeconds', label: 'Jammer lasts', min: 15, max: 180, unit: 'sec' },
                ]
            },
            {
                key: 'jailbreakTerminals', label: '🔓 Jailbreak Terminals', desc: 'Caught players go to jail. Survivors can free them.',
                isToggle: true,
                subFields: [
                    { field: 'holdSeconds', label: 'Hold to jailbreak', min: 5, max: 60, unit: 'sec' },
                    { field: 'terminalCount', label: 'Terminal locations', min: 1, max: 8, unit: '' },
                ]
            },
            { key: 'decoyDeployments', label: '📢 Decoy Deployments', desc: 'Hiders use Bluetooth speakers to create fake sounds', isToggle: true, subFields: [{ field: 'decoyCount', label: 'Decoys per hider', min: 1, max: 5, unit: '' }] },
            { key: 'proximityAlarms', label: '🚨 Proximity Alarms', desc: 'QR code triggers reveal seeker position when scanned', isToggle: true, subFields: [{ field: 'alarmCount', label: 'Number of alarms', min: 1, max: 10, unit: '' }] },
        ]
    },
    {
        section: 'Power Plays',
        features: [
            {
                key: 'blackoutProtocol', label: '🌑 Blackout Protocol', desc: 'Alpha Seeker can trigger 60s total darkness once',
                isToggle: true,
                subFields: [
                    { field: 'durationSeconds', label: 'Blackout duration', min: 15, max: 120, unit: 'sec' },
                ]
            },
            {
                key: 'bountyContracts', label: '🎯 Bounty Contracts', desc: 'The system randomly marks one hider for bonus points',
                isToggle: true,
                subFields: [
                    { field: 'bountyDurationMinutes', label: 'Bounty active for', min: 1, max: 10, unit: 'min' },
                    { field: 'bountyPoints', label: 'Bonus points', min: 50, max: 1000, unit: 'pts' },
                ]
            },
        ]
    },
]

export default function RuleEditor({ modeId, currentRules, onChange }) {
    const [localRules, setLocalRules] = useState({})
    const [openSection, setOpenSection] = useState('Core Timing')

    const get = (path, fallback = 0) => {
        const parts = path.split('.')
        let cur = localRules
        for (const p of parts) { if (cur == null) return fallback; cur = cur[p] }
        return cur ?? fallback
    }

    const set = (path, value) => {
        const parts = path.split('.')
        setLocalRules(prev => {
            const next = JSON.parse(JSON.stringify(prev))
            let cur = next
            for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]] }
            cur[parts[parts.length - 1]] = value
            return next
        })
    }

    useEffect(() => {
        if (currentRules && Object.keys(localRules).length === 0) {
            setLocalRules({
                gameDuration: currentRules.gameDuration,
                countdownTime: currentRules.countdownTime,
                defaultSeekerCount: currentRules.defaultSeekerCount,
                features: currentRules.features ? JSON.parse(JSON.stringify(currentRules.features)) : {},
            })
        }
    }, [currentRules])

    useEffect(() => {
        if (Object.keys(localRules).length > 0) {
            onChange?.(localRules)
        }
    }, [localRules])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURE_DEFS.map(section => (
                <div key={section.section} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Section header */}
                    <button
                        onClick={() => setOpenSection(s => s === section.section ? '' : section.section)}
                        style={{
                            width: '100%', padding: '14px 16px', background: 'transparent', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                            borderBottom: openSection === section.section ? '1px solid var(--border)' : 'none',
                        }}
                    >
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{section.section}</span>
                        <span style={{ color: 'var(--text3)', fontSize: '0.9rem', transition: 'transform 0.2s', transform: openSection === section.section ? 'rotate(180deg)' : 'none' }}>▼</span>
                    </button>

                    {openSection === section.section && (
                        <div style={{ padding: '8px 0' }}>
                            {section.features.map(feat => {
                                const isRootField = feat.type === 'ruleRoot'
                                const enabled = isRootField ? true : !!get(`features.${feat.key}.enabled`)

                                return (
                                    <div key={feat.key} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 3 }}>{feat.label}</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.4 }}>{feat.desc}</div>
                                            </div>
                                            {feat.isToggle && (
                                                <label className="toggle">
                                                    <input type="checkbox" checked={enabled} onChange={e => set(`features.${feat.key}.enabled`, e.target.checked)} />
                                                    <div className="toggle-track" />
                                                </label>
                                            )}
                                            {isRootField && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                                    <input
                                                        type="number"
                                                        value={get(feat.field) || currentRules?.[feat.field] || 0}
                                                        onChange={e => set(feat.field, Number(e.target.value))}
                                                        min={feat.min} max={feat.max}
                                                        style={{ width: 70, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', padding: '6px 8px', textAlign: 'center', outline: 'none' }}
                                                    />
                                                    <span style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>{feat.unit}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Sub-fields when enabled */}
                                        {!isRootField && enabled && feat.subFields?.length > 0 && (
                                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 16, borderLeft: '2px solid var(--border)' }}>
                                                {feat.subFields.map(sf => (
                                                    <div key={sf.field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text2)', flex: 1 }}>{sf.label}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <input
                                                                type="range"
                                                                min={sf.min} max={sf.max}
                                                                value={get(`features.${feat.key}.${sf.field}`) || sf.min}
                                                                onChange={e => set(`features.${feat.key}.${sf.field}`, Number(e.target.value))}
                                                                style={{ width: 100 }}
                                                            />
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--blue)', minWidth: 40, textAlign: 'right' }}>
                                                                {get(`features.${feat.key}.${sf.field}`) || sf.min}{sf.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
