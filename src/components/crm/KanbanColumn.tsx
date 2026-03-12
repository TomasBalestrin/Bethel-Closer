import { memo, useState, useCallback } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClientCard } from './ClientCard'
import { ColumnSettingsDialog } from './ColumnSettingsDialog'
import type { CrmCallClient, CrmCallStage, KanbanColumnDef } from '@/types'

interface KanbanColumnProps {
  column: KanbanColumnDef
  clients: CrmCallClient[]
  allColumns: KanbanColumnDef[]
  draggedClientId: string | null
  isDragOver: boolean
  customTitle?: string
  customSubtitle?: string
  onDragStart: (clientId: string, e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onEditClient: (client: CrmCallClient) => void
  onDeleteClient: (clientId: string) => void
  onMoveToStage: (clientId: string, stage: CrmCallStage) => void
}

function KanbanColumnComponent({
  column,
  clients,
  allColumns,
  draggedClientId,
  isDragOver,
  customTitle,
  customSubtitle,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onEditClient,
  onDeleteClient,
  onMoveToStage
}: KanbanColumnProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const displayTitle = customTitle || column.title
  const displaySubtitle = customSubtitle !== undefined ? customSubtitle : column.subtitle

  // Handle column-level drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver(e)
  }, [onDragOver])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    onDrop(e)
  }, [onDrop])

  return (
    <>
      <div
        className={`flex-shrink-0 w-[260px] sm:w-[280px] rounded-lg border-t-4 ${column.borderColor} bg-card border border-border flex flex-col transition-all ${
          isDragOver ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
      >
        {/* Column Header */}
        <div className="p-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-3 w-3 rounded-full ${column.bgColor} flex-shrink-0`} />
              <span className="font-semibold text-sm truncate" title={displayTitle}>
                {displayTitle}
              </span>
              <Badge variant="secondary" className="h-5 min-w-[20px] flex items-center justify-center text-xs flex-shrink-0">
                {clients.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground flex-shrink-0"
              onClick={() => setIsSettingsOpen(true)}
              title="Configuracoes da coluna"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          {displaySubtitle && (
            <p className="text-xs text-muted-foreground mt-1 truncate" title={displaySubtitle}>
              {displaySubtitle}
            </p>
          )}
        </div>

        {/* Column Content - Scrollable */}
        <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-[200px] max-h-[calc(100vh-280px)]">
          {clients.length === 0 ? (
            <div className={`flex items-center justify-center h-[120px] border-2 border-dashed rounded-lg transition-colors ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}>
              <p className="text-sm text-muted-foreground">
                {isDragOver ? 'Solte aqui' : 'Arraste clientes aqui'}
              </p>
            </div>
          ) : (
            clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                isDragging={draggedClientId === client.id}
                columns={allColumns}
                onDragStart={(e) => onDragStart(client.id, e)}
                onDragEnd={onDragEnd}
                onEdit={() => onEditClient(client)}
                onDelete={() => onDeleteClient(client.id)}
                onMoveToStage={(stage) => onMoveToStage(client.id, stage)}
              />
            ))
          )}
        </div>
      </div>

      {/* Column Settings Dialog */}
      <ColumnSettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        column={column}
        currentTitle={customTitle}
        currentSubtitle={customSubtitle}
      />
    </>
  )
}

// Memoize to prevent unnecessary re-renders
export const KanbanColumn = memo(KanbanColumnComponent)

export default KanbanColumn
