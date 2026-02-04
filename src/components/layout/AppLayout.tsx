import { useState, useEffect } from 'react'
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
  Flame
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/stores/authStore'
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

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { profile, signOut, initialize } = useAuthStore()
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

  // Build navigation based on user role
  const navigation = [
    ...baseNavigation,
    ...(profile?.role === 'lider' || profile?.role === 'admin' ? leaderNavigation : []),
    ...(profile?.role === 'admin' ? adminNavigation : [])
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
          <div className="flex items-center gap-2">
            <img src={logo} alt="Bethel Closer" className="h-6 w-auto" />
            <span className="font-semibold">Bethel Closer</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
