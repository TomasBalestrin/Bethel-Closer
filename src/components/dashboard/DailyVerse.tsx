import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Quote } from 'lucide-react'
import { getDailyVerse } from '@/lib/verses'

export function DailyVerse() {
  const { data: verse, isLoading } = useQuery({
    queryKey: ['daily-verse'],
    queryFn: async () => {
      const dayOfYear = Math.floor(
        (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
      )

      // Try to fetch from database first
      const { data, error } = await supabase
        .from('daily_verses')
        .select('verse_text, reference')
        .eq('day_of_year', dayOfYear)
        .single()

      if (error || !data) {
        // Fallback to local verses
        return getDailyVerse()
      }

      return {
        text: data.verse_text,
        reference: data.reference
      }
    },
    staleTime: 1000 * 60 * 60 // 1 hour
  })

  if (isLoading) {
    return (
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/4" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Quote className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm italic text-foreground">
              "{verse?.text}"
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              — {verse?.reference}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
