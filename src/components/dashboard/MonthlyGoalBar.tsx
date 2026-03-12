import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Flag, Settings, TrendingUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function MonthlyGoalBar() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [goalValue, setGoalValue] = useState('')

  const isAdmin = user?.role === 'admin'
  const isLeader = user?.role === 'lider'
  const canSetGoal = isAdmin || isLeader

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-goal', user?.profileId],
    queryFn: async () => {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      // Get goal
      const { data: goal } = await supabase
        .from('monthly_goals')
        .select('*')
        .eq('closer_id', user?.profileId)
        .eq('month', month)
        .eq('year', year)
        .single()

      // Get total sales for the month
      const startOfMonth = new Date(year, now.getMonth(), 1)
      const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59)

      let salesQuery = supabase
        .from('clients')
        .select('sale_value')
        .eq('is_sold', true)
        .gte('sold_at', startOfMonth.toISOString())
        .lte('sold_at', endOfMonth.toISOString())

      if (!isAdmin && user?.profileId) {
        salesQuery = salesQuery.eq('closer_id', user.profileId)
      }

      const { data: sales } = await salesQuery

      const totalSale = sales?.reduce((sum, s) => sum + (s.sale_value || 0), 0) || 0

      return {
        goal: goal?.target_revenue || null,
        totalSale,
        progress: goal?.target_revenue ? Math.min((totalSale / goal.target_revenue) * 100, 100) : 0
      }
    },
    enabled: !!user
  })

  const setGoalMutation = useMutation({
    mutationFn: async (newGoal: number) => {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const { error } = await supabase
        .from('monthly_goals')
        .upsert({
          closer_id: user?.profileId,
          month,
          year,
          target_revenue: newGoal
        }, {
          onConflict: 'closer_id,month,year'
        })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Meta definida com sucesso!')
      queryClient.invalidateQueries({ queryKey: ['monthly-goal'] })
      setDialogOpen(false)
      setGoalValue('')
    },
    onError: () => {
      toast.error('Erro ao definir meta')
    }
  })

  const handleSetGoal = () => {
    const value = parseFloat(goalValue.replace(/\D/g, ''))
    if (value > 0) {
      setGoalMutation.mutate(value)
    }
  }

  if (isLoading) {
    return <Skeleton className="h-24" />
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  if (!data?.goal) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flag className="w-4 h-4" />
            <span>Nenhuma meta definida para este mes</span>
          </div>
          {canSetGoal && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Definir Meta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Definir Meta Mensal</DialogTitle>
                  <DialogDescription>
                    Defina a meta de vendas para este mes
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="goal">Valor da Meta (R$)</Label>
                    <Input
                      id="goal"
                      type="text"
                      placeholder="Ex: 50000"
                      value={goalValue}
                      onChange={(e) => setGoalValue(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSetGoal}
                    disabled={setGoalMutation.isPending || !goalValue}
                  >
                    {setGoalMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Salvar Meta
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Meta Mensal
          </CardTitle>
          {canSetGoal && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Settings className="w-3 h-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Alterar Meta Mensal</DialogTitle>
                  <DialogDescription>
                    Atualize a meta de vendas para este mes
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="goal">Valor da Meta (R$)</Label>
                    <Input
                      id="goal"
                      type="text"
                      placeholder={data.goal.toString()}
                      value={goalValue}
                      onChange={(e) => setGoalValue(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSetGoal}
                    disabled={setGoalMutation.isPending || !goalValue}
                  >
                    {setGoalMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Atualizar Meta
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Vendas</span>
            <span className="font-medium">
              {formatCurrency(data.totalSale)} / {formatCurrency(data.goal)}
            </span>
          </div>
          <Progress
            value={data.progress}
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{data.progress.toFixed(1)}% da meta</span>
            {data.progress >= 100 && (
              <span className="text-green-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Meta atingida!
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
