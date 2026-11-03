import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/yuruyuru-shader-meetup/',
  build: {
    rollupOptions: {
      input: {
        top: resolve(__dirname, 'index.html'),
        slides: resolve(__dirname, 'slides.html'),
        play: resolve(__dirname, 'play.html'),
      },
    },
  },
})
