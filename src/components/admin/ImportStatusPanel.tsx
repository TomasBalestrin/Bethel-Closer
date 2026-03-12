import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  RefreshCw,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ImportedFile, ImportFileStatus } from '@/types'
import { toast } from 'sonner'

export function ImportStatusPanel() {
  const queryClient = useQueryClient()
  const [processingBatch, setProcessingBatch] = useState<number | null>(null)

  // Fetch import stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['import-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('imported_files')
        .select('status')

      if (error) throw error

      const counts = {
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0
      }

      data?.forEach(file => {
        counts[file.status as ImportFileStatus]++
      })

      return counts
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  })

  // Fetch recent files
  const { data: recentFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['recent-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('imported_files')
        .select('*, profiles:user_id(name)')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data as (ImportedFile & { profiles: { name: string } | null })[]
    },
    refetchInterval: 10000
  })

  // Fetch stuck files
  const { data: stuckFiles } = useQuery({
    queryKey: ['stuck-files'],
    queryFn: async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('imported_files')
        .select('*, profiles:user_id(name)')
        .eq('status', 'processing')
        .lt('started_processing_at', fiveMinutesAgo)

      if (error) throw error
      return data as (ImportedFile & { profiles: { name: string } | null })[]
    },
    refetchInterval: 30000
  })

  // Reset stuck files mutation
  const resetStuckMutation = useMutation({
    mutationFn: async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      const { error } = await supabase
        .from('imported_files')
        .update({
          status: 'pending',
          started_processing_at: null,
          retry_count: supabase.rpc('increment_retry_count')
        })
        .eq('status', 'processing')
        .lt('started_processing_at', fiveMinutesAgo)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Arquivos resetados com sucesso')
      queryClient.invalidateQueries({ queryKey: ['import-stats'] })
      queryClient.invalidateQueries({ queryKey: ['stuck-files'] })
    },
    onError: () => {
      toast.error('Erro ao resetar arquivos')
    }
  })

  // Reset error files mutation
  const resetErrorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('imported_files')
        .update({
          status: 'pending',
          error_message: null,
          retry_count: 0
        })
        .eq('status', 'error')

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Arquivos com erro resetados')
      queryClient.invalidateQueries({ queryKey: ['import-stats'] })
      queryClient.invalidateQueries({ queryKey: ['recent-imports'] })
    },
    onError: () => {
      toast.error('Erro ao resetar arquivos')
    }
  })

  // Batch reanalyze mutation
  const batchReanalyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('batch-reanalyze', {
        body: { reanalyzeAll: true }
      })

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      toast.success(`Reanalize iniciada: ${data?.processed || 0} calls`)
    },
    onError: () => {
      toast.error('Erro ao iniciar reanalise')
    }
  })

  const getStatusBadge = (status: ImportFileStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>
      case 'processing':
        return <Badge variant="default" className="gap-1 bg-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> Processando</Badge>
      case 'completed':
        return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="w-3 h-3" /> Concluido</Badge>
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Erro</Badge>
    }
  }

  const totalFiles = stats ? stats.pending + stats.processing + stats.completed + stats.error : 0
  const completedPercent = totalFiles > 0 ? (stats?.completed || 0) / totalFiles * 100 : 0

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold">{stats?.pending || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Processando</p>
                <p className="text-2xl font-bold text-blue-500">{stats?.processing || 0}</p>
              </div>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluidos</p>
                <p className="text-2xl font-bold text-green-500">{stats?.completed || 0}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Erros</p>
                <p className="text-2xl font-bold text-red-500">{stats?.error || 0}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso Geral</span>
              <span>{completedPercent.toFixed(1)}%</span>
            </div>
            <Progress value={completedPercent} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Stuck Files Alert */}
      {stuckFiles && stuckFiles.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{stuckFiles.length} arquivo(s) preso(s) em processamento por mais de 5 minutos</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetStuckMutation.mutate()}
              disabled={resetStuckMutation.isPending}
            >
              {resetStuckMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Resetar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acoes</CardTitle>
          <CardDescription>Gerencie o processamento de arquivos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => resetErrorMutation.mutate()}
              disabled={resetErrorMutation.isPending || (stats?.error || 0) === 0}
            >
              {resetErrorMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Resetar Arquivos com Erro ({stats?.error || 0})
            </Button>

            <Button
              variant="outline"
              onClick={() => batchReanalyzeMutation.mutate()}
              disabled={batchReanalyzeMutation.isPending}
            >
              {batchReanalyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reanalisar Calls Incompletas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Files Table */}
      <Card>
        <CardHeader>
          <CardTitle>Arquivos Recentes</CardTitle>
          <CardDescription>Ultimos 50 arquivos importados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFiles?.map(file => (
                  <TableRow key={file.id}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {file.file_name}
                    </TableCell>
                    <TableCell>{file.profiles?.name || 'N/A'}</TableCell>
                    <TableCell>{getStatusBadge(file.status)}</TableCell>
                    <TableCell>{file.retry_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(file.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </TableCell>
                  </TableRow>
                ))}
                {(!recentFiles || recentFiles.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum arquivo importado ainda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
