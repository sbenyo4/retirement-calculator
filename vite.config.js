import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Chart.js into separate chunk (likely large)
          'chart': ['chart.js', 'react-chartjs-2'],
          // Split Lucide icons into separate chunk
          'icons': ['lucide-react'],
          // Split React vendor libs
          'react-vendor': ['react', 'react-dom'],
        }
      }
    },
    // Increase chunk size warning limit to 600kb
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
})
