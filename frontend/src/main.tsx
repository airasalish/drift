import { StrictMode, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login.tsx'
import { Signup } from './Signup.tsx'
import { Landing } from './pages/Landing.tsx'
import { Onboarding } from './pages/Onboarding.tsx'
import { getToken, getUsername, logout } from './api.ts'

function Root() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)

  if (!loggedIn) {
    return (
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login onLoggedIn={() => setLoggedIn(true)} />} />
          <Route path="/signup" element={<Signup onLoggedIn={() => setLoggedIn(true)} />} />
          <Route path="/demo" element={<Login onLoggedIn={() => setLoggedIn(true)} isDemo={true} />} />
        </Routes>
      </Router>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/*" element={
          <App
            username={getUsername()}
            onLogout={() => {
              logout()
              setLoggedIn(false)
            }}
          />
        } />
      </Routes>
    </Router>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
