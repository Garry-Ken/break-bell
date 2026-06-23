import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 歇钟 break-bell —— Tauri 桌面（Mac/Windows）。
// base:'./' 让产物用相对路径，Tauri webview 以 file:// 加载本地资源必需；
// 遮罩窗口也通过 index.html?overlay=1 复用同一份产物。
export default defineConfig({
  base: './',
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5192,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    sourcemap: false,
  },
})
