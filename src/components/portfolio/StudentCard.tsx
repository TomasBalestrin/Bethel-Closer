import { useState } from 'react'
import {
  Phone,
  Mail,
  Building2,
  MoreHorizontal,
  Eye,
  TrendingUp,
  Activity,
  UserPlus,
  Calendar
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate, formatPhoneNumber } from '@/lib/utils'
import type { PortfolioStudent, PortfolioTicketType } from '@/types'

interface StudentCardProps {
  student: PortfolioStudent
  activitiesCount?: number
  indicationsCount?: number
  onViewDetails?: (student: PortfolioStudent) => void
  onUpgradeTicket?: (student: PortfolioStudent) => void
  onAddActivity?: (student: PortfolioStudent) => void
  onViewActivities?: (student: PortfolioStudent) => void
  onAddIndication?: (student: PortfolioStudent) => void
}

const ticketConfig: Record<PortfolioTicketType, {
  label: string
  color: string
  bgColor: string
}> = {
  '29_90': {
    label: 'R$ 29,90',
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-100 dark:bg-pink-900/50'
  },
  '12k': {
    label: 'R$ 12K',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50'
  },
  '80k': {
    label: 'R$ 80K',
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/50'
  }
}

export function StudentCard({
  student,
  activitiesCount = 0,
  indicationsCount = 0,
  onViewDetails,
  onUpgradeTicket,
  onAddActivity,
  onViewActivities,
  onAddIndication
}: StudentCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const ticket = ticketConfig[student.ticket_type]

  const hasAscended = student.original_ticket_type &&
    student.original_ticket_type !== student.ticket_type

  const canUpgrade = student.ticket_type !== '80k'

  return (
    <Card
      className={`transition-all duration-200 ${
        isHovered ? 'shadow-md border-primary/30' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Student Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-foreground truncate">
                {student.name}
              </h3>
              <Badge className={`${ticket.bgColor} ${ticket.color} border-0 text-xs`}>
                {ticket.label}
              </Badge>
              {hasAscended && (
                <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Ascendeu
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {student.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="truncate">{formatPhoneNumber(student.phone)}</span>
                </div>
              )}
              {student.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{student.email}</span>
                </div>
              )}
              {student.company && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate">{student.company}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>Desde {formatDate(student.created_at)}</span>
              </div>
            </div>

            {/* Activity and Indication Counts */}
            <div className="flex items-center gap-4 mt-3">
              <button
                onClick={() => onViewActivities?.(student)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Activity className="h-3.5 w-3.5" />
                <span>{activitiesCount} atividade{activitiesCount !== 1 ? 's' : ''}</span>
              </button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" />
                <span>{indicationsCount} indicacao{indicationsCount !== 1 ? 'es' : ''}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewDetails?.(student)}
            >
              <Eye className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewDetails?.(student)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver detalhes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAddActivity?.(student)}>
                  <Activity className="h-4 w-4 mr-2" />
                  Adicionar atividade
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewActivities?.(student)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Historico de atividades
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAddIndication?.(student)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Registrar indicacao
                </DropdownMenuItem>
                {canUpgrade && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onUpgradeTicket?.(student)}>
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Upgrade de ticket
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
