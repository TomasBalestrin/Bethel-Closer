import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SystemLog, LogLevel } from '@/types'

export function ErrorLogsPanel() {
  const [page, setPage] = useState(0)
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [, setSelectedLog] = useState<SystemLog | null>(null)

  const pageSize = 25

  // Fetch logs
  const { data: logsData } = useQuery({
    queryKey: ['system-logs', page, levelFilter, serviceFilter, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (levelFilter !== 'all') {
        query = query.eq('level', levelFilter)
      }

      if (serviceFilter !== 'all') {
        query = query.eq('service', serviceFilter)
      }

      if (searchQuery) {
        query = query.or(`error_message.ilike.%${searchQuery}%,operation.ilike.%${searchQuery}%`)
      }

      const { data, error, count } = await query

      if (error) throw error
      return { logs: data as SystemLog[], total: count || 0 }
    },
    refetchInterval: 30000
  })

  // Fetch unique services for filter
  const { data: services } = useQuery({
    queryKey: ['log-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_logs')
        .select('service')
        .limit(100)

      if (error) throw error

      const uniqueServices = [...new Set(data?.map(d => d.service) || [])]
      return uniqueServices.sort()
    }
  })

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'info':
        return <Info className="w-4 h-4 text-blue-500" />
      case 'debug':
        return <Bug className="w-4 h-4 text-gray-500" />
    }
  }

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <Badge variant="destructive">Erro</Badge>
      case 'warning':
        return <Badge className="bg-yellow-500">Aviso</Badge>
      case 'info':
        return <Badge variant="secondary">Info</Badge>
      case 'debug':
        return <Badge variant="outline">Debug</Badge>
    }
  }

  const totalPages = Math.ceil((logsData?.total || 0) / pageSize)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar em mensagens..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(0)
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            <Select
              value={levelFilter}
              onValueChange={(value) => {
                setLevelFilter(value as LogLevel | 'all')
                setPage(0)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos niveis</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="warning">Aviso</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={serviceFilter}
              onValueChange={(value) => {
                setServiceFilter(value)
                setPage(0)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Servico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos servicos</SelectItem>
                {services?.map(service => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Logs de Sistema</CardTitle>
          <CardDescription>
            {logsData?.total || 0} logs encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Nivel</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Servico</TableHead>
                  <TableHead>Operacao</TableHead>
                  <TableHead className="max-w-[300px]">Mensagem</TableHead>
                  <TableHead>Duracao</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsData?.logs.map(log => (
                  <TableRow key={log.id} className={log.level === 'error' ? 'bg-red-500/5' : ''}>
                    <TableCell>{getLevelIcon(log.level)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.service}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.operation || '-'}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm">
                      {log.error_message || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              {getLevelIcon(log.level)}
                              Log Detalhado
                            </DialogTitle>
                            <DialogDescription>
                              {format(new Date(log.created_at), "dd 'de' MMMM 'as' HH:mm:ss", { locale: ptBR })}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Nivel</p>
                                {getLevelBadge(log.level)}
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Servico</p>
                                <p className="font-medium">{log.service}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Operacao</p>
                                <p className="font-medium">{log.operation || '-'}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Duracao</p>
                                <p className="font-medium">
                                  {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                                </p>
                              </div>
                            </div>

                            {log.error_message && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Mensagem de Erro</p>
                                <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto">
                                  {log.error_message}
                                </pre>
                              </div>
                            )}

                            {log.stack_trace && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Stack Trace</p>
                                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[200px]">
                                  {log.stack_trace}
                                </pre>
                              </div>
                            )}

                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Metadata</p>
                                <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}

                {(!logsData?.logs || logsData.logs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum log encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Pagina {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Proximo
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
