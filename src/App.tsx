import React, { Suspense, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/stores/authStore'
import { OfflineBanner } from '@/components/OfflineIndicator'

// Global theme initializer - applies stored theme on app start
function ThemeInitializer() {
  const applyTheme = useCallback(() => {
    const theme = localStorage.getItem('app-theme') || 'light'
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }, [])

  useEffect(() => {
    applyTheme()

    // Listen for theme changes from Settings page
    const handler = () => applyTheme()
    window.addEventListener('theme-changed', handler)
    return () => window.removeEventListener('theme-changed', handler)
  }, [applyTheme])

  return null
}

// Lazy-loaded pages for code splitting
const AuthPage = React.lazy(() => import('@/pages/Auth'))
const DashboardPage = React.lazy(() => import('@/pages/Dashboard'))
const ClientsPage = React.lazy(() => import('@/pages/Clients'))
const ClientDetailPage = React.lazy(() => import('@/pages/ClientDetail'))
const CallsPage = React.lazy(() => import('@/pages/Calls'))
const SettingsPage = React.lazy(() => import('@/pages/Settings'))
const NotificationsPage = React.lazy(() => import('@/pages/Notifications'))
const ReportsPage = React.lazy(() => import('@/pages/Reports'))
const TeamPage = React.lazy(() => import('@/pages/Team'))
const AdminPage = React.lazy(() => import('@/pages/Admin'))
const CrmCallsPage = React.lazy(() => import('@/pages/CrmCalls'))
const CrmIntensivoPage = React.lazy(() => import('@/pages/CrmIntensivo'))
const ImportPage = React.lazy(() => import('@/pages/Import'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFound'))

// Layout (kept eager - needed on every authenticated route)
import { AppLayout } from '@/components/layout/AppLayout'

// Route loading spinner
function PageLoader() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, initialize } = useAuthStore()
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      initialize()
    }
  }, [initialize])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <TooltipProvider>
      <ThemeInitializer />
      <OfflineBanner />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route path="crm-calls" element={<CrmCallsPage />} />
              <Route path="crm-intensivo" element={<CrmIntensivoPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="import" element={<ImportPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
