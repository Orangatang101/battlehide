import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketCtx = createContext(null);

export function SocketProvider({ children }) {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const s = io(window.location.origin, {
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 10000,
        });
        ref.current = s;
        s.on('connect', () => { console.log('[BattleHide] Connected:', s.id); setConnected(true); });
        s.on('disconnect', (reason) => { console.log('[BattleHide] Disconnected:', reason); setConnected(false); });
        s.on('connect_error', (err) => { console.error('[BattleHide] Connection error:', err.message); });
        setSocket(s);
        return () => s.disconnect();
    }, []);

    return <SocketCtx.Provider value={{ socket, connected }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);
