import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { SocketProvider } from './SocketContext'
import { GameProvider } from './GameContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <SocketProvider>
            <GameProvider>
                <App />
            </GameProvider>
        </SocketProvider>
    </BrowserRouter>
)
