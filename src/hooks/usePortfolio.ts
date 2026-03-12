import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import type {
  PortfolioStudent,
  StudentActivity,
  StudentIndication,
  PortfolioMetrics,
  PortfolioFilters,
  PortfolioTicketType,
  StudentActivityType,
  IndicationSource
} from '@/types'

// Portfolio Students Hook
export function usePortfolioStudents(
  filters?: PortfolioFilters,
  limit = 50,
  offset = 0
) {
  const { user } = useAuthStore()
  const closerId = user?.profileId

  return useQuery({
    queryKey: ['portfolio-students', closerId, filters, limit, offset],
    queryFn: async () => {
      if (!closerId) return { students: [], total: 0 }

      let query = supabase
        .from('portfolio_students')
        .select('*', { count: 'exact' })
        .eq('closer_id', closerId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Apply ticket type filter
      if (filters?.ticketType && filters.ticketType !== 'all') {
        query = query.eq('ticket_type', filters.ticketType)
      }

      // Apply date range filter
      if (filters?.dateRange?.from) {
        query = query.gte('created_at', filters.dateRange.from.toISOString())
      }
      if (filters?.dateRange?.to) {
        query = query.lte('created_at', filters.dateRange.to.toISOString())
      }

      // Apply month filter
      if (filters?.month) {
        const [year, month] = filters.month.split('-')
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
        query = query
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
      }

      const { data, error, count } = await query

      if (error) throw error

      let students = (data || []) as PortfolioStudent[]

      // Apply activity/indication filters (requires joining data)
      if (filters?.activities && filters.activities !== 'all') {
        const studentIds = students.map(s => s.id)
        const { data: activities } = await supabase
          .from('student_activities')
          .select('student_id, type')
          .in('student_id', studentIds)

        const activityMap = new Map<string, Set<StudentActivityType>>()
        activities?.forEach(a => {
          if (!activityMap.has(a.student_id)) {
            activityMap.set(a.student_id, new Set())
          }
          activityMap.get(a.student_id)!.add(a.type as StudentActivityType)
        })

        if (filters.activities === 'with') {
          students = students.filter(s => activityMap.has(s.id))
        } else if (filters.activities === 'without') {
          students = students.filter(s => !activityMap.has(s.id))
        } else {
          // Filter by specific activity type
          students = students.filter(s =>
            activityMap.get(s.id)?.has(filters.activities as StudentActivityType)
          )
        }
      }

      if (filters?.indications && filters.indications !== 'all') {
        const studentIds = students.map(s => s.id)
        const { data: indications } = await supabase
          .from('student_indications')
          .select('student_id')
          .in('student_id', studentIds)

        const indicationSet = new Set(indications?.map(i => i.student_id))

        if (filters.indications === 'with') {
          students = students.filter(s => indicationSet.has(s.id))
        } else {
          students = students.filter(s => !indicationSet.has(s.id))
        }
      }

      return { students, total: count || 0 }
    },
    enabled: !!closerId
  })
}

// Student Activities Hook
export function useStudentActivities(studentId?: string) {
  const { user } = useAuthStore()
  const closerId = user?.profileId

  return useQuery({
    queryKey: ['student-activities', studentId, closerId],
    queryFn: async () => {
      if (!closerId) return []

      let query = supabase
        .from('student_activities')
        .select('*')
        .order('created_at', { ascending: false })

      if (studentId) {
        query = query.eq('student_id', studentId)
      } else {
        // Get all activities for all students belonging to this closer
        const { data: students } = await supabase
          .from('portfolio_students')
          .select('id')
          .eq('closer_id', closerId)

        const studentIds = students?.map(s => s.id) || []
        if (studentIds.length === 0) return []
        query = query.in('student_id', studentIds)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as StudentActivity[]
    },
    enabled: !!closerId
  })
}

// Student Indications Hook
export function useStudentIndications(studentId?: string) {
  const { user } = useAuthStore()
  const closerId = user?.profileId

  return useQuery({
    queryKey: ['student-indications', studentId, closerId],
    queryFn: async () => {
      if (!closerId) return []

      let query = supabase
        .from('student_indications')
        .select('*')
        .order('created_at', { ascending: false })

      if (studentId) {
        query = query.eq('student_id', studentId)
      } else {
        // Get all indications for all students belonging to this closer
        const { data: students } = await supabase
          .from('portfolio_students')
          .select('id')
          .eq('closer_id', closerId)

        const studentIds = students?.map(s => s.id) || []
        if (studentIds.length === 0) return []
        query = query.in('student_id', studentIds)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as StudentIndication[]
    },
    enabled: !!closerId
  })
}

// Portfolio Metrics Hook
export function usePortfolioMetrics(filters?: PortfolioFilters) {
  const { user } = useAuthStore()
  const closerId = user?.profileId

  return useQuery({
    queryKey: ['portfolio-metrics', closerId, filters],
    queryFn: async (): Promise<PortfolioMetrics> => {
      if (!closerId) {
        return getEmptyMetrics()
      }

      // Fetch all students for this closer
      let studentsQuery = supabase
        .from('portfolio_students')
        .select('*')
        .eq('closer_id', closerId)

      // Apply date/month filters
      if (filters?.dateRange?.from) {
        studentsQuery = studentsQuery.gte('created_at', filters.dateRange.from.toISOString())
      }
      if (filters?.dateRange?.to) {
        studentsQuery = studentsQuery.lte('created_at', filters.dateRange.to.toISOString())
      }
      if (filters?.month) {
        const [year, month] = filters.month.split('-')
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
        studentsQuery = studentsQuery
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
      }

      const { data: students, error: studentsError } = await studentsQuery
      if (studentsError) throw studentsError

      const studentList = (students || []) as PortfolioStudent[]
      const studentIds = studentList.map(s => s.id)

      // Calculate ticket counts
      const ticketCounts: Record<PortfolioTicketType, number> = {
        '29_90': 0,
        '12k': 0,
        '80k': 0
      }

      let ascensions29To12k = 0
      let ascensions12kTo80k = 0

      studentList.forEach(student => {
        ticketCounts[student.ticket_type]++

        // Count ascensions based on original vs current ticket
        if (student.original_ticket_type === '29_90' && student.ticket_type !== '29_90') {
          ascensions29To12k++
        }
        if (
          (student.original_ticket_type === '12k' || student.original_ticket_type === '29_90') &&
          student.ticket_type === '80k'
        ) {
          ascensions12kTo80k++
        }
      })

      // Fetch activities
      let activities: StudentActivity[] = []
      if (studentIds.length > 0) {
        const { data: activitiesData } = await supabase
          .from('student_activities')
          .select('*')
          .in('student_id', studentIds)
        activities = (activitiesData || []) as StudentActivity[]
      }

      const activitiesByType: Record<StudentActivityType, number> = {
        intensivo: 0,
        mentoria: 0,
        evento: 0
      }
      activities.forEach(a => {
        if (activitiesByType[a.type] !== undefined) {
          activitiesByType[a.type]++
        }
      })

      // Fetch indications
      let indications: StudentIndication[] = []
      if (studentIds.length > 0) {
        const { data: indicationsData } = await supabase
          .from('student_indications')
          .select('*')
          .in('student_id', studentIds)
        indications = (indicationsData || []) as StudentIndication[]
      }

      const indicationsBySource: Record<IndicationSource, number> = {
        call: 0,
        intensivo: 0
      }
      let closedIndications = 0
      indications.forEach(i => {
        if (indicationsBySource[i.source] !== undefined) {
          indicationsBySource[i.source]++
        }
        if (i.is_closed) closedIndications++
      })

      const totalStudents = studentList.length
      const total29 = ticketCounts['29_90']
      const total12k = ticketCounts['12k']

      return {
        totalStudents,
        ascensions29To12k: {
          count: ascensions29To12k,
          percentage: total29 > 0 ? (ascensions29To12k / total29) * 100 : 0
        },
        ascensions12kTo80k: {
          count: ascensions12kTo80k,
          percentage: total12k > 0 ? (ascensions12kTo80k / total12k) * 100 : 0
        },
        totalAscensions: ascensions29To12k + ascensions12kTo80k,
        ticketCounts,
        totalActivities: activities.length,
        activitiesByType,
        totalIndications: indications.length,
        indicationsBySource,
        closedIndications,
        indicationConversionRate: indications.length > 0
          ? (closedIndications / indications.length) * 100
          : 0
      }
    },
    enabled: !!closerId
  })
}

// Mutations
export function useCreateStudent() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  return useMutation({
    mutationFn: async (data: Omit<PortfolioStudent, 'id' | 'created_at' | 'updated_at'>) => {
      const { data: result, error } = await supabase
        .from('portfolio_students')
        .insert({
          ...data,
          closer_id: user?.profileId,
          original_ticket_type: data.ticket_type
        })
        .select()
        .single()

      if (error) throw error
      return result as PortfolioStudent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-students'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

export function useUpdateStudent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PortfolioStudent> }) => {
      const { data: result, error } = await supabase
        .from('portfolio_students')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return result as PortfolioStudent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-students'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

export function useUpgradeTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ studentId, newTicket }: { studentId: string; newTicket: PortfolioTicketType }) => {
      const { data: result, error } = await supabase
        .from('portfolio_students')
        .update({ ticket_type: newTicket })
        .eq('id', studentId)
        .select()
        .single()

      if (error) throw error
      return result as PortfolioStudent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-students'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

export function useCreateActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Omit<StudentActivity, 'id' | 'created_at'>) => {
      const { data: result, error } = await supabase
        .from('student_activities')
        .insert(data)
        .select()
        .single()

      if (error) throw error
      return result as StudentActivity
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-activities'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

export function useCreateIndication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Omit<StudentIndication, 'id' | 'created_at'>) => {
      const { data: result, error } = await supabase
        .from('student_indications')
        .insert(data)
        .select()
        .single()

      if (error) throw error
      return result as StudentIndication
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-indications'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

export function useCloseIndication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (indicationId: string) => {
      const { data: result, error } = await supabase
        .from('student_indications')
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq('id', indicationId)
        .select()
        .single()

      if (error) throw error
      return result as StudentIndication
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-indications'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-metrics'] })
    }
  })
}

// Helper function
function getEmptyMetrics(): PortfolioMetrics {
  return {
    totalStudents: 0,
    ascensions29To12k: { count: 0, percentage: 0 },
    ascensions12kTo80k: { count: 0, percentage: 0 },
    totalAscensions: 0,
    ticketCounts: { '29_90': 0, '12k': 0, '80k': 0 },
    totalActivities: 0,
    activitiesByType: { intensivo: 0, mentoria: 0, evento: 0 },
    totalIndications: 0,
    indicationsBySource: { call: 0, intensivo: 0 },
    closedIndications: 0,
    indicationConversionRate: 0
  }
}
