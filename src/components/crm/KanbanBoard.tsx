import { useState, useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { KanbanColumn } from './KanbanColumn'
import { SaleFormDialog } from './SaleFormDialog'
import { useDragAutoScroll } from '@/hooks/useDragAutoScroll'
import { useColumnSettings } from '@/hooks/useColumnSettings'
import type { CrmCallClient, CrmCallStage, KanbanColumnDef } from '@/types'

// Column definitions for 10-column Kanban
export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: 'call_realizada',
    title: 'Call Realizada',
    subtitle: 'Preencher dados',
    color: 'blue',
    borderColor: 'border-t-blue-500',
    bgColor: 'bg-blue-500'
  },
  {
    id: 'repitch',
    title: 'RePitch',
    subtitle: '',
    color: 'orange',
    borderColor: 'border-t-orange-500',
    bgColor: 'bg-orange-500'
  },
  {
    id: 'pos_call_0_2',
    title: 'Pos Call 0-2 dias',
    subtitle: 'Depoimentos e Conexao',
    color: 'cyan',
    borderColor: 'border-t-cyan-500',
    bgColor: 'bg-cyan-500'
  },
  {
    id: 'pos_call_3_7',
    title: 'Pos Call 3-7 dias',
    subtitle: 'Presente e Mentoria',
    color: 'green',
    borderColor: 'border-t-green-500',
    bgColor: 'bg-green-500'
  },
  {
    id: 'pos_call_8_15',
    title: 'Pos Call 8-15 dias',
    subtitle: 'Feedback e Oferta',
    color: 'yellow',
    borderColor: 'border-t-yellow-500',
    bgColor: 'bg-yellow-500'
  },
  {
    id: 'pos_call_16_21',
    title: 'Pos Call 16-21 dias',
    subtitle: 'Convite Intensivo',
    color: 'purple',
    borderColor: 'border-t-purple-500',
    bgColor: 'bg-purple-500'
  },
  {
    id: 'sinal_compromisso',
    title: 'Sinal de Compromisso',
    subtitle: '',
    color: 'indigo',
    borderColor: 'border-t-indigo-500',
    bgColor: 'bg-indigo-500'
  },
  {
    id: 'venda_realizada',
    title: 'Venda Realizada',
    subtitle: '',
    color: 'emerald',
    borderColor: 'border-t-emerald-500',
    bgColor: 'bg-emerald-500'
  },
  {
    id: 'aluno_nao_fit',
    title: 'Aluno Nao Fit',
    subtitle: '',
    color: 'red',
    borderColor: 'border-t-red-500',
    bgColor: 'bg-red-500'
  },
  {
    id: 'pos_21_carterizacao',
    title: 'Pos 21 dias',
    subtitle: 'Carterizacao',
    color: 'slate',
    borderColor: 'border-t-slate-500',
    bgColor: 'bg-slate-500'
  }
]

interface KanbanBoardProps {
  clients: CrmCallClient[]
  isLoading: boolean
  onUpdateClient: (id: string, data: Partial<CrmCallClient>) => void
  onEditClient: (client: CrmCallClient) => void
  onDeleteClient: (clientId: string) => void
  onPortfolioMigration?: (client: CrmCallClient) => void
}

export function KanbanBoard({
  clients,
  isLoading,
  onUpdateClient,
  onEditClient,
  onDeleteClient,
  onPortfolioMigration
}: KanbanBoardProps) {
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<CrmCallStage | null>(null)
  const [saleFormClient, setSaleFormClient] = useState<CrmCallClient | null>(null)

  const { containerRef, handleDragMove, stopAutoScroll } = useDragAutoScroll({
    edgeSize: 100,
    scrollSpeed: 15,
    maxSpeed: 40
  })

  const { getCustomTitle, getCustomSubtitle } = useColumnSettings()

  // Group clients by stage
  const clientsByStage = useMemo(() => {
    const grouped: Record<CrmCallStage, CrmCallClient[]> = {
      call_realizada: [],
      repitch: [],
      pos_call_0_2: [],
      pos_call_3_7: [],
      pos_call_8_15: [],
      pos_call_16_21: [],
      sinal_compromisso: [],
      venda_realizada: [],
      aluno_nao_fit: [],
      pos_21_carterizacao: []
    }

    clients.forEach(client => {
      if (grouped[client.stage]) {
        grouped[client.stage].push(client)
      } else {
        // Default to first column if stage is unknown
        grouped.call_realizada.push(client)
      }
    })

    return grouped
  }, [clients])

  // Drag handlers
  const handleDragStart = useCallback((clientId: string, e: React.DragEvent) => {
    setDraggedClientId(clientId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', clientId)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedClientId(null)
    setDragOverColumnId(null)
    stopAutoScroll()
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }, [stopAutoScroll])

  const handleColumnDragOver = useCallback((columnId: CrmCallStage) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumnId(columnId)
    handleDragMove(e)
  }, [handleDragMove])

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumnId(null)
  }, [])

  const handleColumnDrop = useCallback((columnId: CrmCallStage) => (e: React.DragEvent) => {
    e.preventDefault()
    const clientId = e.dataTransfer.getData('text/plain')

    if (clientId) {
      const client = clients.find(c => c.id === clientId)
      if (client && client.stage !== columnId) {
        // Special handling for "venda_realizada" - open sale form
        if (columnId === 'venda_realizada') {
          setSaleFormClient(client)
        }
        // Special handling for "pos_21_carterizacao" - trigger portfolio migration
        else if (columnId === 'pos_21_carterizacao') {
          onUpdateClient(clientId, {
            stage: columnId,
            stage_entered_at: new Date().toISOString()
          })
          if (onPortfolioMigration) {
            onPortfolioMigration(client)
          }
        }
        // Normal move
        else {
          onUpdateClient(clientId, {
            stage: columnId,
            stage_entered_at: new Date().toISOString()
          })
        }
      }
    }

    setDraggedClientId(null)
    setDragOverColumnId(null)
    stopAutoScroll()
  }, [clients, onUpdateClient, onPortfolioMigration, stopAutoScroll])

  const handleMoveToStage = useCallback((clientId: string, stage: CrmCallStage) => {
    const client = clients.find(c => c.id === clientId)
    if (!client || client.stage === stage) return

    // Special handling for "venda_realizada" - open sale form
    if (stage === 'venda_realizada') {
      setSaleFormClient(client)
    }
    // Special handling for "pos_21_carterizacao" - trigger portfolio migration
    else if (stage === 'pos_21_carterizacao') {
      onUpdateClient(clientId, {
        stage,
        stage_entered_at: new Date().toISOString()
      })
      if (onPortfolioMigration) {
        onPortfolioMigration(client)
      }
    }
    // Normal move
    else {
      onUpdateClient(clientId, {
        stage,
        stage_entered_at: new Date().toISOString()
      })
    }
  }, [clients, onUpdateClient, onPortfolioMigration])

  const handleSaleFormClose = useCallback(() => {
    setSaleFormClient(null)
  }, [])

  const handleSaleFormSubmit = useCallback((saleData: {
    sale_value: number
    entry_value?: number
    product_offered?: string
    contract_validity?: string
    sale_notes?: string
  }) => {
    if (!saleFormClient) return

    onUpdateClient(saleFormClient.id, {
      stage: 'venda_realizada',
      stage_entered_at: new Date().toISOString(),
      is_sold: true,
      sold_at: new Date().toISOString(),
      sale_value: saleData.sale_value,
      entry_value: saleData.entry_value,
      product_offered: saleData.product_offered,
      contract_validity: saleData.contract_validity,
      sale_notes: saleData.sale_notes
    })

    setSaleFormClient(null)
  }, [saleFormClient, onUpdateClient])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        className="flex gap-4 overflow-x-auto pb-4 px-1"
        style={{ minHeight: '60vh' }}
      >
        {KANBAN_COLUMNS.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            clients={clientsByStage[column.id] || []}
            allColumns={KANBAN_COLUMNS}
            draggedClientId={draggedClientId}
            isDragOver={dragOverColumnId === column.id}
            customTitle={getCustomTitle(column.id)}
            customSubtitle={getCustomSubtitle(column.id)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleColumnDragOver(column.id)}
            onDragLeave={handleColumnDragLeave}
            onDrop={handleColumnDrop(column.id)}
            onEditClient={onEditClient}
            onDeleteClient={onDeleteClient}
            onMoveToStage={handleMoveToStage}
          />
        ))}
      </div>

      {/* Sale Form Dialog */}
      <SaleFormDialog
        open={!!saleFormClient}
        onOpenChange={(open) => !open && handleSaleFormClose()}
        client={saleFormClient}
        onSubmit={handleSaleFormSubmit}
      />
    </>
  )
}

export default KanbanBoard
