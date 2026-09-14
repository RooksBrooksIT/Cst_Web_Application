import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss(),],
})