import { ShoppingCart, Building2, GraduationCap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { PortfolioMetrics, PortfolioTicketType } from '@/types'

interface TicketCounterProps {
  metrics: PortfolioMetrics | undefined
  isLoading?: boolean
}

interface TicketCardProps {
  name: string
  ticket: string
  count: number
  icon: React.ReactNode
  bgColor: string
  iconBg: string
  borderColor: string
}

function TicketCard({ name, ticket, count, icon, bgColor, iconBg, borderColor }: TicketCardProps) {
  return (
    <Card className={`${bgColor} ${borderColor} border-2 shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-foreground/80">{name}</p>
            <p className="text-xs text-muted-foreground">{ticket}</p>
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-bold text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground mt-1">alunos</p>
      </CardContent>
    </Card>
  )
}

const ticketConfig: Record<PortfolioTicketType, {
  name: string
  ticket: string
  icon: React.ReactNode
  bgColor: string
  iconBg: string
  borderColor: string
}> = {
  '29_90': {
    name: 'Elite Premium',
    ticket: 'R$ 29,90',
    icon: <ShoppingCart className="h-5 w-5 text-white" />,
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
    iconBg: 'bg-pink-500',
    borderColor: 'border-pink-200 dark:border-pink-800'
  },
  '12k': {
    name: 'Implementacao Comercial',
    ticket: 'R$ 12.000',
    icon: <Building2 className="h-5 w-5 text-white" />,
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    iconBg: 'bg-blue-500',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  '80k': {
    name: 'Mentoria Premium Julia',
    ticket: 'R$ 80.000',
    icon: <GraduationCap className="h-5 w-5 text-white" />,
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    iconBg: 'bg-yellow-500',
    borderColor: 'border-yellow-200 dark:border-yellow-800'
  }
}

export function TicketCounter({ metrics, isLoading }: TicketCounterProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="h-4 bg-muted rounded w-32 mb-2" />
              <div className="h-10 bg-muted rounded w-16 mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const tickets: PortfolioTicketType[] = ['29_90', '12k', '80k']

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {tickets.map(ticket => {
        const config = ticketConfig[ticket]
        return (
          <TicketCard
            key={ticket}
            name={config.name}
            ticket={config.ticket}
            count={metrics?.ticketCounts[ticket] || 0}
            icon={config.icon}
            bgColor={config.bgColor}
            iconBg={config.iconBg}
            borderColor={config.borderColor}
          />
        )
      })}
    </div>
  )
}
