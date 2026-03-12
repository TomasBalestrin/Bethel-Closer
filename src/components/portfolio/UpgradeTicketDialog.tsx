import { useState } from 'react'
import { Loader2, TrendingUp, ArrowRight, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useUpgradeTicket } from '@/hooks/usePortfolio'
import { toast } from '@/hooks/use-toast'
import type { PortfolioStudent, PortfolioTicketType } from '@/types'

interface UpgradeTicketDialogProps {
  student: PortfolioStudent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ticketConfig: Record<PortfolioTicketType, {
  label: string
  value: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  '29_90': {
    label: 'Elite Premium',
    value: 'R$ 29,90',
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-50 dark:bg-pink-950/30',
    borderColor: 'border-pink-300 dark:border-pink-700'
  },
  '12k': {
    label: 'Implementacao Comercial',
    value: 'R$ 12.000',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-300 dark:border-blue-700'
  },
  '80k': {
    label: 'Mentoria Premium Julia',
    value: 'R$ 80.000',
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700'
  }
}

const upgradeOptions: Record<PortfolioTicketType, PortfolioTicketType[]> = {
  '29_90': ['12k', '80k'],
  '12k': ['80k'],
  '80k': []
}

export function UpgradeTicketDialog({ student, open, onOpenChange }: UpgradeTicketDialogProps) {
  const [selectedTicket, setSelectedTicket] = useState<PortfolioTicketType | null>(null)
  const upgradeTicket = useUpgradeTicket()

  const handleUpgrade = async () => {
    if (!student || !selectedTicket) return

    try {
      await upgradeTicket.mutateAsync({
        studentId: student.id,
        newTicket: selectedTicket
      })

      toast({
        title: 'Upgrade realizado!',
        description: `${student.name} foi promovido para ${ticketConfig[selectedTicket].value}.`
      })

      setSelectedTicket(null)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Erro ao realizar upgrade',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive'
      })
    }
  }

  const handleClose = () => {
    setSelectedTicket(null)
    onOpenChange(false)
  }

  if (!student) return null

  const currentTicket = ticketConfig[student.ticket_type]
  const availableUpgrades = upgradeOptions[student.ticket_type]

  if (availableUpgrades.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Upgrade de Ticket</DialogTitle>
            <DialogDescription>
              {student.name} ja esta no ticket maximo.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 text-center">
            <Badge className={`${currentTicket.bgColor} ${currentTicket.color} border-0 text-lg px-4 py-2`}>
              {currentTicket.value}
            </Badge>
            <p className="text-sm text-muted-foreground mt-4">
              Este aluno ja possui o ticket mais alto disponivel.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Upgrade de Ticket
          </DialogTitle>
          <DialogDescription>
            Promover {student.name} para um ticket maior
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Ticket */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Ticket Atual</p>
            <div className={`p-4 rounded-lg border-2 ${currentTicket.bgColor} ${currentTicket.borderColor}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{currentTicket.label}</p>
                  <p className={`text-lg font-bold ${currentTicket.color}`}>{currentTicket.value}</p>
                </div>
                <Check className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>

          {/* Upgrade Options */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Selecione o Novo Ticket</p>
            <div className="space-y-3">
              {availableUpgrades.map((ticket) => {
                const config = ticketConfig[ticket]
                const isSelected = selectedTicket === ticket
                return (
                  <button
                    key={ticket}
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `${config.bgColor} ${config.borderColor} ring-2 ring-primary ring-offset-2`
                        : 'bg-card border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <p className="font-semibold text-foreground">{config.label}</p>
                        <p className={`text-lg font-bold ${config.color}`}>{config.value}</p>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleUpgrade}
            disabled={!selectedTicket || upgradeTicket.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {upgradeTicket.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <TrendingUp className="mr-2 h-4 w-4" />
            Confirmar Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
