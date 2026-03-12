import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/services/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { DatePickerWithRange } from '@/components/ui/date-picker'
import {
  DollarSign,
  Cpu,
  FileText,
  Zap
} from 'lucide-react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ApiCost } from '@/types'
import { DateRange } from 'react-day-picker'

export function CostDashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date()
  })
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [modelFilter, setModelFilter] = useState<string>('all')

  // Fetch costs
  const { data: costs } = useQuery({
    queryKey: ['api-costs', dateRange, serviceFilter, modelFilter],
    queryFn: async () => {
      let query = supabase
        .from('api_costs')
        .select('*')
        .order('created_at', { ascending: false })

      if (dateRange?.from) {
        query = query.gte('created_at', startOfDay(dateRange.from).toISOString())
      }
      if (dateRange?.to) {
        query = query.lte('created_at', endOfDay(dateRange.to).toISOString())
      }
      if (serviceFilter !== 'all') {
        query = query.eq('service', serviceFilter)
      }
      if (modelFilter !== 'all') {
        query = query.eq('model', modelFilter)
      }

      const { data, error } = await query.limit(500)

      if (error) throw error
      return data as ApiCost[]
    }
  })

  // Calculate aggregates
  const aggregates = costs?.reduce(
    (acc, cost) => {
      acc.totalCost += cost.estimated_cost_usd
      acc.totalTokensInput += cost.tokens_input
      acc.totalTokensOutput += cost.tokens_output
      acc.totalOperations++

      // By model
      if (!acc.byModel[cost.model || 'unknown']) {
        acc.byModel[cost.model || 'unknown'] = {
          cost: 0,
          tokensInput: 0,
          tokensOutput: 0,
          operations: 0
        }
      }
      acc.byModel[cost.model || 'unknown'].cost += cost.estimated_cost_usd
      acc.byModel[cost.model || 'unknown'].tokensInput += cost.tokens_input
      acc.byModel[cost.model || 'unknown'].tokensOutput += cost.tokens_output
      acc.byModel[cost.model || 'unknown'].operations++

      // By service
      if (!acc.byService[cost.service]) {
        acc.byService[cost.service] = {
          cost: 0,
          operations: 0
        }
      }
      acc.byService[cost.service].cost += cost.estimated_cost_usd
      acc.byService[cost.service].operations++

      return acc
    },
    {
      totalCost: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalOperations: 0,
      byModel: {} as Record<string, { cost: number; tokensInput: number; tokensOutput: number; operations: number }>,
      byService: {} as Record<string, { cost: number; operations: number }>
    }
  ) || {
    totalCost: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalOperations: 0,
    byModel: {},
    byService: {}
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(value)
  }

  const formatTokens = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toString()
  }

  const uniqueModels = [...new Set(costs?.map(c => c.model).filter(Boolean) || [])]
  const uniqueServices = [...new Set(costs?.map(c => c.service) || [])]

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <DatePickerWithRange
              date={dateRange}
              onDateChange={setDateRange}
            />

            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Servico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos servicos</SelectItem>
                {uniqueServices.map(service => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos modelos</SelectItem>
                {uniqueModels.map(model => (
                  <SelectItem key={model} value={model!}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custo Total</p>
                <p className="text-2xl font-bold text-green-500">
                  {formatCurrency(aggregates.totalCost)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tokens Input</p>
                <p className="text-2xl font-bold">
                  {formatTokens(aggregates.totalTokensInput)}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tokens Output</p>
                <p className="text-2xl font-bold">
                  {formatTokens(aggregates.totalTokensOutput)}
                </p>
              </div>
              <Cpu className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Operacoes</p>
                <p className="text-2xl font-bold">{aggregates.totalOperations}</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost by Model */}
      <Card>
        <CardHeader>
          <CardTitle>Custo por Modelo</CardTitle>
          <CardDescription>Distribuicao de custos por modelo de IA</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(aggregates.byModel)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([model, data]) => (
                <Card key={model}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">{model}</Badge>
                      <span className="text-lg font-bold text-green-500">
                        {formatCurrency(data.cost)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div>
                        <span>Input: </span>
                        <span className="text-foreground">{formatTokens(data.tokensInput)}</span>
                      </div>
                      <div>
                        <span>Output: </span>
                        <span className="text-foreground">{formatTokens(data.tokensOutput)}</span>
                      </div>
                      <div className="col-span-2">
                        <span>Operacoes: </span>
                        <span className="text-foreground">{data.operations}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Cost by Service */}
      <Card>
        <CardHeader>
          <CardTitle>Custo por Servico</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servico</TableHead>
                <TableHead className="text-right">Operacoes</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(aggregates.byService)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([service, data]) => (
                  <TableRow key={service}>
                    <TableCell>
                      <Badge variant="secondary">{service}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{data.operations}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(data.cost)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {aggregates.totalCost > 0
                        ? ((data.cost / aggregates.totalCost) * 100).toFixed(1)
                        : 0}%
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Operacoes Recentes</CardTitle>
          <CardDescription>Ultimas 50 operacoes com custo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Servico</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Operacao</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs?.slice(0, 50).map(cost => (
                  <TableRow key={cost.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(cost.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{cost.service}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{cost.model || '-'}</TableCell>
                    <TableCell className="text-sm">{cost.operation || '-'}</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatTokens(cost.tokens_input)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatTokens(cost.tokens_output)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-500">
                      {formatCurrency(cost.estimated_cost_usd)}
                    </TableCell>
                  </TableRow>
                ))}

                {(!costs || costs.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum custo registrado no periodo
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
