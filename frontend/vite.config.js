import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  server: {
    watch: {
      ignored: ['**/wailsjs/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
