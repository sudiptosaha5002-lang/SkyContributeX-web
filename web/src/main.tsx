import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

async function clearLegacyCaches() {
  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('counterx-shell')).map((key) => caches.delete(key)))
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).then(() => clearLegacyCaches())
      return
    }

    void navigator.serviceWorker.register('/sw.js')
  })
}
