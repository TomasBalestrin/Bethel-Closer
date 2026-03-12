import { useState } from 'react'
import { Calendar, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format, parseISO, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { PortfolioFilters as PortfolioFiltersType } from '@/types'

interface PortfolioFiltersProps {
  filters: PortfolioFiltersType
  onFiltersChange: (filters: PortfolioFiltersType) => void
}

export function PortfolioFilters({ filters, onFiltersChange }: PortfolioFiltersProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [fromDate, setFromDate] = useState<string>(
    filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : ''
  )
  const [toDate, setToDate] = useState<string>(
    filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : ''
  )

  const handleApplyDateRange = () => {
    if (fromDate || toDate) {
      onFiltersChange({
        ...filters,
        dateRange: {
          from: fromDate ? parseISO(fromDate) : new Date(),
          to: toDate ? parseISO(toDate) : new Date()
        },
        month: undefined
      })
    }
    setDatePickerOpen(false)
  }

  const handleClearDateRange = () => {
    setFromDate('')
    setToDate('')
    onFiltersChange({
      ...filters,
      dateRange: undefined
    })
    setDatePickerOpen(false)
  }

  const handlePreset = (from: Date, to: Date) => {
    setFromDate(format(from, 'yyyy-MM-dd'))
    setToDate(format(to, 'yyyy-MM-dd'))
    onFiltersChange({
      ...filters,
      dateRange: { from, to },
      month: undefined
    })
    setDatePickerOpen(false)
  }

  const dateDisplayText = filters.dateRange?.from
    ? filters.dateRange.to
      ? `${format(filters.dateRange.from, 'dd/MM/yy')} - ${format(filters.dateRange.to, 'dd/MM/yy')}`
      : format(filters.dateRange.from, 'dd/MM/yyyy')
    : 'Selecionar periodo'

  // Generate month options (last 12 months)
  const monthOptions: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const value = format(date, 'yyyy-MM')
    const label = format(date, 'MMMM yyyy', { locale: ptBR })
    monthOptions.push({
      value,
      label: label.charAt(0).toUpperCase() + label.slice(1)
    })
  }

  const hasActiveFilters =
    filters.ticketType !== 'all' ||
    filters.activities !== 'all' ||
    filters.indications !== 'all' ||
    filters.dateRange ||
    filters.month

  const clearAllFilters = () => {
    onFiltersChange({
      ticketType: 'all',
      activities: 'all',
      indications: 'all',
      dateRange: undefined,
      month: undefined
    })
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros:</span>
        </div>

        {/* Ticket Type Filter */}
        <Select
          value={filters.ticketType}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, ticketType: value as PortfolioFiltersType['ticketType'] })
          }
        >
          <SelectTrigger className="w-[150px] h-9 bg-card">
            <SelectValue placeholder="Ticket" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tickets</SelectItem>
            <SelectItem value="29_90">R$ 29,90</SelectItem>
            <SelectItem value="12k">R$ 12K</SelectItem>
            <SelectItem value="80k">R$ 80K</SelectItem>
          </SelectContent>
        </Select>

        {/* Activities Filter */}
        <Select
          value={filters.activities}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, activities: value as PortfolioFiltersType['activities'] })
          }
        >
          <SelectTrigger className="w-[160px] h-9 bg-card">
            <SelectValue placeholder="Atividades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Atividades</SelectItem>
            <SelectItem value="with">Com Atividades</SelectItem>
            <SelectItem value="without">Sem Atividades</SelectItem>
            <SelectItem value="intensivo">Intensivo</SelectItem>
            <SelectItem value="mentoria">Mentoria</SelectItem>
            <SelectItem value="evento">Evento</SelectItem>
          </SelectContent>
        </Select>

        {/* Indications Filter */}
        <Select
          value={filters.indications}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, indications: value as PortfolioFiltersType['indications'] })
          }
        >
          <SelectTrigger className="w-[160px] h-9 bg-card">
            <SelectValue placeholder="Indicacoes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Indicacoes</SelectItem>
            <SelectItem value="with">Com Indicacoes</SelectItem>
            <SelectItem value="without">Sem Indicacoes</SelectItem>
          </SelectContent>
        </Select>

        {/* Date Range Picker */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal h-9">
              <Calendar className="mr-2 h-4 w-4" />
              <span className="text-sm">{dateDisplayText}</span>
              {filters.dateRange?.from && (
                <X
                  className="ml-2 h-3 w-3 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClearDateRange()
                  }}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="end">
            <div className="space-y-4">
              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handlePreset(subDays(new Date(), 7), new Date())}
                >
                  Ultimos 7 dias
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handlePreset(subDays(new Date(), 30), new Date())}
                >
                  Ultimos 30 dias
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handlePreset(startOfMonth(new Date()), endOfMonth(new Date()))}
                >
                  Este mes
                </Button>
              </div>

              {/* Custom range */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">De</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Ate</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleClearDateRange}>
                  Limpar
                </Button>
                <Button size="sm" onClick={handleApplyDateRange}>
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Month Selector */}
        <Select
          value={filters.month || ''}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              month: value || undefined,
              dateRange: value ? undefined : filters.dateRange
            })
          }
        >
          <SelectTrigger className="w-[160px] h-9 bg-card">
            <SelectValue placeholder="Selecionar mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos os meses</SelectItem>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear All */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-9 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
