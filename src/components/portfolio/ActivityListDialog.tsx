import { Activity, Calendar, Flame, Award, CalendarDays } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStudentActivities } from '@/hooks/usePortfolio'
import { formatDate } from '@/lib/utils'
import type { PortfolioStudent, StudentActivityType } from '@/types'

interface ActivityListDialogProps {
  student: PortfolioStudent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const activityTypeConfig: Record<StudentActivityType, {
  label: string
  icon: React.ReactNode
  color: string
}> = {
  intensivo: {
    label: 'Intensivo',
    icon: <Flame className="h-4 w-4" />,
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
  },
  mentoria: {
    label: 'Mentoria',
    icon: <Award className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
  },
  evento: {
    label: 'Evento',
    icon: <CalendarDays className="h-4 w-4" />,
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300'
  }
}

export function ActivityListDialog({ student, open, onOpenChange }: ActivityListDialogProps) {
  const { data: activities = [], isLoading } = useStudentActivities(student?.id)

  if (!student) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Historico de Atividades
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Atividades de {student.name}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(80vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade registrada para este aluno.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {activities.map((activity) => {
                const config = activityTypeConfig[activity.type]
                return (
                  <div
                    key={activity.id}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${config.color} border-0`}>
                            <span className="mr-1">{config.icon}</span>
                            {config.label}
                          </Badge>
                          {activity.event_date && (
                            <Badge variant="outline" className="text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(activity.event_date)}
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-medium text-foreground">
                          {activity.title}
                        </h4>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {activity.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
