import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DartsManagerApp from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DartsManagerApp />
  </StrictMode>,
)
