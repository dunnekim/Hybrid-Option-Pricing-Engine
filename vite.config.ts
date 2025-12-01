import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 배포를 위해 base 경로를 상대 경로로 설정
  base: './',
  build: {
    outDir: 'dist',
  }
})