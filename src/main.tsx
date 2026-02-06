import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { createOfflineQueryClient, initializeOfflineData } from './services/offlineQueryClient'
import { OfflineProvider } from './contexts/OfflineContext'

// Create query client with offline support
const queryClient = createOfflineQueryClient()

// Initialize offline data from IndexedDB
initializeOfflineData(queryClient).catch(console.error)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        <App />
      </OfflineProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
