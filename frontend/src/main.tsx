import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login.tsx'
import { getToken, getUsername, logout } from './api.ts'

function Root() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />
  return (
    <App
      username={getUsername()}
      onLogout={() => {
        logout()
        setLoggedIn(false)
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
