import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/yuruyuru-shader-meetup/',
  build: {
    rollupOptions: {
      input: {
        slides: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
      },
    },
  },
})
