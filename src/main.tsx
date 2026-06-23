import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import OverlayRoot from './components/overlay/OverlayRoot.tsx'
import './index.css'

// 单 bundle 双窗口：主面板用 index.html；遮罩窗用 index.html?overlay=1
const isOverlay = new URLSearchParams(location.search).get('overlay') === '1'

// 遮罩窗提前涂深色，避免 webview 初始化时的白色闪屏
if (isOverlay) document.documentElement.style.background = '#0b1020'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <OverlayRoot /> : <App />}</StrictMode>,
)
