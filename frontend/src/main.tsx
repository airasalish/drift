import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login.tsx'
import { getToken, getUsername, logout } from './api.ts'

// Deliberately kept out of App.tsx/App.css entirely (both mid-edit from a
// concurrent session as of this writing) -- an overlay here, not a change
// to the shared files, so there's zero chance of a conflicting edit.
function LogoutBar({ onLogout }: { onLogout: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 10,
        right: 16,
        zIndex: 1000,
        fontSize: 12,
        color: '#8a919c',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span>{getUsername()}</span>
      <button
        onClick={() => {
          logout()
          onLogout()
        }}
        style={{
          background: 'transparent',
          border: '1px solid #262b32',
          color: '#8a919c',
          borderRadius: 6,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Log out
      </button>
    </div>
  )
}

function Root() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />
  return (
    <>
      <LogoutBar onLogout={() => setLoggedIn(false)} />
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
