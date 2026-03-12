import { useRef, useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { StudentCard } from './StudentCard'
import type { PortfolioStudent, StudentActivity, StudentIndication } from '@/types'

interface StudentListProps {
  students: PortfolioStudent[]
  activities: StudentActivity[]
  indications: StudentIndication[]
  isLoading?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  onViewDetails?: (student: PortfolioStudent) => void
  onUpgradeTicket?: (student: PortfolioStudent) => void
  onAddActivity?: (student: PortfolioStudent) => void
  onViewActivities?: (student: PortfolioStudent) => void
  onAddIndication?: (student: PortfolioStudent) => void
}

const ITEM_HEIGHT = 140 // Approximate height of each StudentCard
const OVERSCAN = 5 // Number of items to render outside the visible area

export function StudentList({
  students,
  activities,
  indications,
  isLoading,
  hasMore,
  onLoadMore,
  onViewDetails,
  onUpgradeTicket,
  onAddActivity,
  onViewActivities,
  onAddIndication
}: StudentListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })

  // Create activity and indication count maps
  const activityCounts = new Map<string, number>()
  activities.forEach(a => {
    activityCounts.set(a.student_id, (activityCounts.get(a.student_id) || 0) + 1)
  })

  const indicationCounts = new Map<string, number>()
  indications.forEach(i => {
    indicationCounts.set(i.student_id, (indicationCounts.get(i.student_id) || 0) + 1)
  })

  // Handle scroll for virtualization
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return

    const { scrollTop, clientHeight } = containerRef.current
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(clientHeight / ITEM_HEIGHT)
    const end = Math.min(students.length, start + visibleCount + OVERSCAN * 2)

    setVisibleRange({ start, end })

    // Load more when near bottom
    if (hasMore && onLoadMore) {
      const scrollBottom = scrollTop + clientHeight
      const totalHeight = students.length * ITEM_HEIGHT
      if (scrollBottom > totalHeight - ITEM_HEIGHT * 3) {
        onLoadMore()
      }
    }
  }, [students.length, hasMore, onLoadMore])

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    handleScroll() // Initial calculation

    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Reset visible range when students change
  useEffect(() => {
    handleScroll()
  }, [students, handleScroll])

  if (isLoading && students.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-foreground mb-2">
          Nenhum aluno encontrado
        </p>
        <p className="text-sm text-muted-foreground">
          Adicione seu primeiro aluno clicando no botao acima
        </p>
      </div>
    )
  }

  const visibleStudents = students.slice(visibleRange.start, visibleRange.end)
  const paddingTop = visibleRange.start * ITEM_HEIGHT
  const paddingBottom = (students.length - visibleRange.end) * ITEM_HEIGHT

  return (
    <div
      ref={containerRef}
      className="overflow-auto max-h-[calc(100vh-400px)] min-h-[400px]"
    >
      <div
        style={{
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${Math.max(0, paddingBottom)}px`
        }}
      >
        <div className="space-y-3">
          {visibleStudents.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              activitiesCount={activityCounts.get(student.id) || 0}
              indicationsCount={indicationCounts.get(student.id) || 0}
              onViewDetails={onViewDetails}
              onUpgradeTicket={onUpgradeTicket}
              onAddActivity={onAddActivity}
              onViewActivities={onViewActivities}
              onAddIndication={onAddIndication}
            />
          ))}
        </div>
      </div>

      {isLoading && students.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
