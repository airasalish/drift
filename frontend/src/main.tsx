import { StrictMode, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Login } from './Login.tsx'
import { Signup } from './Signup.tsx'
import { Landing } from './pages/Landing.tsx'
import { getToken, getUsername, logout } from './api.ts'

// Once logged in, straight into the app -- no separate onboarding page
// in between. First-time guidance is FirstLookTour (see App.tsx), a
// contextual spotlight over the real, live page, not a generic wizard
// shown before the app exists.
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
