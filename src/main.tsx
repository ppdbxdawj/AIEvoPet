import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PetWindowApp from './windows/PetWindowApp'
import PanelWindowApp from './windows/PanelWindowApp'
import './styles.css'

const windowKind = new URLSearchParams(window.location.search).get('window')
const RootComponent = windowKind === 'pet'
  ? PetWindowApp
  : windowKind === 'panel'
    ? PanelWindowApp
    : App

document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'

window.addEventListener('error', (event) => {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `<main style="width:100vw;height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#fff4fa;color:#6b526c;font-family:Inter,-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;white-space:pre-wrap;text-align:left;">Renderer error:\n${String(event.error?.stack ?? event.message)}</main>`
})

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `<main style="width:100vw;height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#fff4fa;color:#6b526c;font-family:Inter,-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;white-space:pre-wrap;text-align:left;">Unhandled rejection:\n${String(event.reason?.stack ?? event.reason)}</main>`
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
)
