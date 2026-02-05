import { useState } from 'react'
import { Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format, parseISO, startOfMonth, endOfMonth, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface DateRangePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
}

export function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState<string>(
    dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''
  )
  const [toDate, setToDate] = useState<string>(
    dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''
  )

  const handleApply = () => {
    if (fromDate || toDate) {
      onDateRangeChange({
        from: fromDate ? parseISO(fromDate) : undefined,
        to: toDate ? parseISO(toDate) : undefined
      })
    }
    setOpen(false)
  }

  const handleClear = () => {
    setFromDate('')
    setToDate('')
    onDateRangeChange(undefined)
    setOpen(false)
  }

  const handlePreset = (from: Date, to: Date) => {
    setFromDate(format(from, 'yyyy-MM-dd'))
    setToDate(format(to, 'yyyy-MM-dd'))
    onDateRangeChange({ from, to })
    setOpen(false)
  }

  const presets = [
    {
      label: 'Últimos 7 dias',
      fn: () => handlePreset(subDays(new Date(), 7), new Date())
    },
    {
      label: 'Últimos 30 dias',
      fn: () => handlePreset(subDays(new Date(), 30), new Date())
    },
    {
      label: 'Esta semana',
      fn: () => handlePreset(startOfWeek(new Date(), { locale: ptBR }), endOfWeek(new Date(), { locale: ptBR }))
    },
    {
      label: 'Este mês',
      fn: () => handlePreset(startOfMonth(new Date()), endOfMonth(new Date()))
    }
  ]

  const displayText = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'dd/MM/yy')} - ${format(dateRange.to, 'dd/MM/yy')}`
      : format(dateRange.from, 'dd/MM/yyyy')
    : 'Selecionar período'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal h-9"
        >
          <Calendar className="mr-2 h-4 w-4" />
          <span className="text-sm">{displayText}</span>
          {dateRange?.from && (
            <X
              className="ml-2 h-3 w-3 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleClear()
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={preset.fn}
              >
                {preset.label}
              </Button>
            ))}
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
              <label className="text-xs text-muted-foreground">Até</label>
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
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Limpar
            </Button>
            <Button size="sm" onClick={handleApply}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
