import { memo } from 'react'
import { Phone, Flame, Link2, MoreVertical, Pencil, Trash2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { CrmCallClient, CrmCallStage, KanbanColumnDef } from '@/types'
import { differenceInDays } from 'date-fns'

interface ClientCardProps {
  client: CrmCallClient
  isDragging: boolean
  columns: KanbanColumnDef[]
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onEdit: () => void
  onDelete: () => void
  onMoveToStage: (stage: CrmCallStage) => void
}

function ClientCardComponent({
  client,
  isDragging,
  columns,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
  onMoveToStage
}: ClientCardProps) {
  // Calculate days in current column
  const daysInColumn = client.stage_entered_at
    ? differenceInDays(new Date(), new Date(client.stage_entered_at))
    : client.created_at
    ? differenceInDays(new Date(), new Date(client.created_at))
    : 0

  // Truncate name if too long
  const truncatedName = client.name.length > 25
    ? client.name.substring(0, 22) + '...'
    : client.name

  // Format phone for WhatsApp link
  const getWhatsAppLink = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '')
    // Add Brazil country code if not present
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
    return `https://wa.me/${fullPhone}`
  }

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragging ? 'opacity-50 scale-95 ring-2 ring-primary' : 'hover:shadow-md'
      }`}
    >
      <CardContent className="p-3">
        {/* Header with name and menu */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate" title={client.name}>
              {truncatedName}
            </h4>
            {client.company && (
              <p className="text-xs text-muted-foreground truncate" title={client.company}>
                {client.company}
              </p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1 flex-shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {columns.filter(col => col.id !== client.stage).map(col => (
                <DropdownMenuItem key={col.id} onClick={() => onMoveToStage(col.id)}>
                  <div className={`h-3 w-3 rounded-full mr-2 ${col.bgColor}`} />
                  <span className="truncate">Mover para {col.title}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Phone with clickable link */}
        {client.phone && (
          <div className="mb-2">
            <a
              href={getWhatsAppLink(client.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3 w-3" />
              <span>{client.phone}</span>
            </a>
          </div>
        )}

        {/* Badges and days counter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Super Hot badge */}
            {client.is_super_hot && (
              <Badge variant="outline" className="h-5 px-1.5 bg-yellow-50 border-yellow-300 text-yellow-700">
                <Flame className="h-3 w-3" />
              </Badge>
            )}
            {/* Indication badge */}
            {client.is_indication && (
              <Badge variant="outline" className="h-5 px-1.5 bg-green-50 border-green-300 text-green-700">
                <Link2 className="h-3 w-3" />
              </Badge>
            )}
          </div>

          {/* Days in column */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{daysInColumn}d</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Memoize to prevent unnecessary re-renders during drag operations
export const ClientCard = memo(ClientCardComponent)

export default ClientCard
