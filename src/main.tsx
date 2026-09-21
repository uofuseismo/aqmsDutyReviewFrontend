import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { Provider } from './components/ui/provider'
import { Toaster } from './components/ui/toaster'
// Self-hosted Inter (weight axis). Bundled with the app rather than fetched
// from a CDN, so it works behind the data-center nginx with no external call.
import '@fontsource-variable/inter/wght.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      {/* The Toaster sits inside AuthProvider so the expiry toast's countdown
          can subscribe to the session; React portals still carry context. */}
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </Provider>
  </StrictMode>,
)
