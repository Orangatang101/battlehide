import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketCtx = createContext(null);

export function SocketProvider({ children }) {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const s = io(window.location.origin, {
            transports: ['websocket'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
        ref.current = s;
        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));
        setSocket(s);
        return () => s.disconnect();
    }, []);

    return <SocketCtx.Provider value={{ socket, connected }}>{children}</SocketCtx.Provider>;
}

export const useSocket = () => useContext(SocketCtx);
