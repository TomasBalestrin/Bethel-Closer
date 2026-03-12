import { useState, useCallback } from 'react'
import { Plus, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AscensionMetrics } from '@/components/portfolio/AscensionMetrics'
import { TicketCounter } from '@/components/portfolio/TicketCounter'
import { ActivityMetrics } from '@/components/portfolio/ActivityMetrics'
import { IndicationMetrics } from '@/components/portfolio/IndicationMetrics'
import { PortfolioFilters } from '@/components/portfolio/PortfolioFilters'
import { StudentList } from '@/components/portfolio/StudentList'
import { NewStudentDialog } from '@/components/portfolio/NewStudentDialog'
import { StudentDetailDialog } from '@/components/portfolio/StudentDetailDialog'
import { ActivityDialog } from '@/components/portfolio/ActivityDialog'
import { ActivityListDialog } from '@/components/portfolio/ActivityListDialog'
import { StudentIndicationDialog } from '@/components/portfolio/StudentIndicationDialog'
import { UpgradeTicketDialog } from '@/components/portfolio/UpgradeTicketDialog'
import {
  usePortfolioStudents,
  useStudentActivities,
  useStudentIndications,
  usePortfolioMetrics
} from '@/hooks/usePortfolio'
import type { PortfolioFilters as PortfolioFiltersType, PortfolioStudent } from '@/types'

const PAGE_SIZE = 50

export default function PortfolioPage() {
  // Filters state
  const [filters, setFilters] = useState<PortfolioFiltersType>({
    ticketType: 'all',
    activities: 'all',
    indications: 'all'
  })

  // Pagination
  const [offset, setOffset] = useState(0)

  // Dialog states
  const [newStudentOpen, setNewStudentOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<PortfolioStudent | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [activityListDialogOpen, setActivityListDialogOpen] = useState(false)
  const [indicationDialogOpen, setIndicationDialogOpen] = useState(false)
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false)

  // Data fetching
  const { data: studentsData, isLoading: studentsLoading } = usePortfolioStudents(
    filters,
    PAGE_SIZE,
    offset
  )
  const { data: activities = [] } = useStudentActivities()
  const { data: indications = [] } = useStudentIndications()
  const { data: metrics, isLoading: metricsLoading } = usePortfolioMetrics(filters)

  const students = studentsData?.students || []
  const totalStudents = studentsData?.total || 0
  const hasMore = students.length < totalStudents && !studentsLoading

  // Handlers
  const handleFiltersChange = useCallback((newFilters: PortfolioFiltersType) => {
    setFilters(newFilters)
    setOffset(0) // Reset pagination when filters change
  }, [])

  const handleLoadMore = useCallback(() => {
    if (!studentsLoading && hasMore) {
      setOffset(prev => prev + PAGE_SIZE)
    }
  }, [studentsLoading, hasMore])

  const handleViewDetails = useCallback((student: PortfolioStudent) => {
    setSelectedStudent(student)
    setDetailDialogOpen(true)
  }, [])

  const handleUpgradeTicket = useCallback((student: PortfolioStudent) => {
    setSelectedStudent(student)
    setUpgradeDialogOpen(true)
  }, [])

  const handleAddActivity = useCallback((student: PortfolioStudent) => {
    setSelectedStudent(student)
    setActivityDialogOpen(true)
  }, [])

  const handleViewActivities = useCallback((student: PortfolioStudent) => {
    setSelectedStudent(student)
    setActivityListDialogOpen(true)
  }, [])

  const handleAddIndication = useCallback((student: PortfolioStudent) => {
    setSelectedStudent(student)
    setIndicationDialogOpen(true)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GraduationCap className="h-7 w-7 text-primary" />
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Meu Portfolio
            </h1>
          </div>
          <p className="text-muted-foreground">
            Gerencie seus alunos, atividades e indicacoes
          </p>
        </div>
        <Button onClick={() => setNewStudentOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Aluno
        </Button>
      </div>

      {/* Metrics Row 1 - Ascension Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Metricas de Ascensao</h2>
        <AscensionMetrics metrics={metrics} isLoading={metricsLoading} />
      </div>

      {/* Metrics Row 2 - Ticket Counter */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Alunos por Ticket</h2>
        <TicketCounter metrics={metrics} isLoading={metricsLoading} />
      </div>

      {/* Metrics Row 3 - Activity Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Metricas de Atividades</h2>
        <ActivityMetrics metrics={metrics} isLoading={metricsLoading} />
      </div>

      {/* Metrics Row 4 - Indication Metrics */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Metricas de Indicacoes</h2>
        <IndicationMetrics metrics={metrics} isLoading={metricsLoading} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <PortfolioFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </CardContent>
      </Card>

      {/* Student List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Meus Alunos</span>
            <span className="text-sm font-normal text-muted-foreground">
              {totalStudents} aluno{totalStudents !== 1 ? 's' : ''} encontrado{totalStudents !== 1 ? 's' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StudentList
            students={students}
            activities={activities}
            indications={indications}
            isLoading={studentsLoading}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onViewDetails={handleViewDetails}
            onUpgradeTicket={handleUpgradeTicket}
            onAddActivity={handleAddActivity}
            onViewActivities={handleViewActivities}
            onAddIndication={handleAddIndication}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <NewStudentDialog
        open={newStudentOpen}
        onOpenChange={setNewStudentOpen}
      />

      <StudentDetailDialog
        student={selectedStudent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      <ActivityDialog
        student={selectedStudent}
        open={activityDialogOpen}
        onOpenChange={setActivityDialogOpen}
      />

      <ActivityListDialog
        student={selectedStudent}
        open={activityListDialogOpen}
        onOpenChange={setActivityListDialogOpen}
      />

      <StudentIndicationDialog
        student={selectedStudent}
        open={indicationDialogOpen}
        onOpenChange={setIndicationDialogOpen}
      />

      <UpgradeTicketDialog
        student={selectedStudent}
        open={upgradeDialogOpen}
        onOpenChange={setUpgradeDialogOpen}
      />
    </div>
  )
}
