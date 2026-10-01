import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { handleApi } from './server/api.ts'

// ponytail: the API lives inside the dev server (localhost only). A hosted version needs a real backend + login.
export default defineConfig({
  plugins: [
    react(),
    { name: 'quickpitch-api', configureServer: (server) => { server.middlewares.use('/api', (req, res) => handleApi(req, res)) } },
  ],
})
