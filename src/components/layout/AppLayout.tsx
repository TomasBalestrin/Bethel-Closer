import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Briefcase,
  Bell,
  Settings,
  BarChart3,
  Users,
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Phone,
  Flame,
  Search,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/services/supabase'
import { toast } from 'sonner'
import logo from '@/components/ui/logo.png'

// Navigation items
const baseNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Calls', href: '/calls', icon: Phone },
  { name: 'CRM Calls', href: '/crm-calls', icon: Users },
  { name: 'CRM Intensivo', href: '/crm-intensivo', icon: Flame },
  { name: 'Carteira', href: '/clients', icon: Briefcase },
  { name: 'Notificações', href: '/notifications', icon: Bell },
  { name: 'Configurações', href: '/settings', icon: Settings }
]

const leaderNavigation = [
  { name: 'Relatórios', href: '/reports', icon: BarChart3 },
  { name: 'Ver Time', href: '/team', icon: Users }
]

const adminNavigation = [
  { name: 'Admin', href: '/admin', icon: Shield }
]

// Global Search Component
function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ clients: { id: string; name: string; email: string; phone: string }[]; calls: { id: string; client_name: string; scheduled_at: string }[] }>({ clients: [], calls: [] })
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
    if (!open) { setQuery(''); setResults({ clients: [], calls: [] }) }
  }, [open])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({ clients: [], calls: [] }); return }
    setLoading(true)
    try {
      const [clientsRes, callsRes] = await Promise.all([
        supabase.from('clients').select('id, name, email, phone').or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(8),
        supabase.from('calls').select('id, scheduled_at, client:clients(name)').eq('status', 'scheduled').limit(5)
      ])
      const calls = (callsRes.data || [])
        .filter((c: Record<string, unknown>) => {
          const client = c.client as { name: string } | null
          return client?.name?.toLowerCase().includes(q.toLowerCase())
        })
        .map((c: Record<string, unknown>) => ({
          id: c.id as string,
          client_name: (c.client as { name: string })?.name || '',
          scheduled_at: c.scheduled_at as string
        }))
      setResults({ clients: clientsRes.data || [], calls })
    } catch {
      // Search errors are non-critical - fail silently
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const totalResults = results.clients.length + results.calls.length

  if (!open) {
    return (
      <Button variant="outline" className="h-9 gap-2 text-muted-foreground bg-card" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline text-sm">Buscar...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, calls..."
            className="border-0 bg-transparent p-0 text-base focus-visible:ring-0 shadow-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground cursor-pointer" onClick={() => setOpen(false)}>
            ESC
          </kbd>
        </div>
        {query.length >= 2 && (
          <div className="max-h-[300px] overflow-y-auto p-2">
            {totalResults === 0 && !loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado</p>
            )}
            {results.clients.length > 0 && (
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Clientes</p>
                {results.clients.map(c => (
                  <button
                    key={c.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted transition-colors"
                    onClick={() => { navigate(`/clients/${c.id}`); setOpen(false) }}
                  >
                    <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email || c.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {results.calls.length > 0 && (
              <div className="mt-1">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Calls agendadas</p>
                {results.calls.map(c => (
                  <button
                    key={c.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted transition-colors"
                    onClick={() => { navigate('/calls'); setOpen(false) }}
                  >
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.client_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.scheduled_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {query.length < 2 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Digite pelo menos 2 caracteres para buscar
          </div>
        )}
      </div>
    </>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, signOut, initialize } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    initialize()
  }, [initialize])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Logout realizado com sucesso!')
      navigate('/auth')
    } catch (error) {
      toast.error('Erro ao fazer logout')
    }
  }

  // Build navigation based on user role (check both profile and user for resilience)
  const role = profile?.role || user?.role
  const navigation = [
    ...baseNavigation,
    ...(role === 'lider' || role === 'admin' ? leaderNavigation : []),
    ...(role === 'admin' ? adminNavigation : [])
  ]

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-sidebar-border',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="Bethel Closer" className="h-8 w-auto" />
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">Bethel Closer</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden lg:flex',
            collapsed && 'lg:hidden'
          )}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 h-6 w-6 rounded-full bg-sidebar border border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden lg:flex"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  collapsed && 'justify-center px-2 lg:justify-center'
                )
              }
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {(!collapsed || !window.matchMedia('(min-width: 1024px)').matches) && (
                <span>{item.name}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200',
            collapsed && 'justify-center px-2 lg:justify-center'
          )}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {(!collapsed || !window.matchMedia('(min-width: 1024px)').matches) && (
            <span>Sair</span>
          )}
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col w-[264px] sidebar transition-transform duration-300 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 hidden lg:flex flex-col sidebar transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-[264px]'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div
        className={cn(
          'min-h-screen transition-all duration-300',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[264px]'
        )}
      >
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <img src={logo} alt="Bethel Closer" className="h-6 w-auto" />
            <span className="font-semibold">Bethel Closer</span>
          </div>
          <GlobalSearch />
        </header>

        {/* Desktop search bar */}
        <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-end gap-4 border-b bg-card px-8">
          <GlobalSearch />
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
