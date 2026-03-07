import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ToastEvents({ events }) {
    const [visible, setVisible] = useState([])
    const shownRef = useRef(new Set())

    useEffect(() => {
        if (!events?.length) return
        const latest = events[0]
        if (!latest || shownRef.current.has(latest.id)) return
        shownRef.current.add(latest.id)

        setVisible(v => [{ ...latest, _key: latest.id }, ...v].slice(0, 3))
        const t = setTimeout(() => {
            setVisible(v => v.filter(e => e._key !== latest.id))
        }, 4000)
        return () => clearTimeout(t)
    }, [events])

    const toastClass = { danger: 'toast-danger', warning: 'toast-warning', success: 'toast-success', info: 'toast-info' }

    return (
        <div className="toast-container">
            <AnimatePresence>
                {visible.map(evt => (
                    <motion.div
                        key={evt._key}
                        initial={{ opacity: 0, x: 60, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 60 }}
                        className={`toast ${toastClass[evt.type] || 'toast-info'}`}
                    >
                        {evt.message}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
