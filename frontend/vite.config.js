import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_API_URL || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    // Whitelists host headers during dev-server execution loops
    allowedHosts: ['.railway.app', 'joyful-radiance-production-6eb8.up.railway.app']
  },
  preview: {
    // Whitelists host headers during production preview execution loops
    allowedHosts: ['.railway.app', 'joyful-radiance-production-6eb8.up.railway.app']
  }
})
