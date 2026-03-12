import { useState } from 'react'
import { Settings, Zap, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { AutomationsDialog } from './AutomationsDialog'

interface CRMSettingsButtonProps {
  className?: string
}

export function CRMSettingsButton({ className }: CRMSettingsButtonProps) {
  const [isAutomationsOpen, setIsAutomationsOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={className}>
            <Settings className="h-4 w-4 mr-2" />
            Configuracoes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setIsAutomationsOpen(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Automacoes
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <LayoutGrid className="h-4 w-4 mr-2" />
            Personalizar colunas
            <span className="ml-auto text-xs text-muted-foreground">Em breve</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AutomationsDialog
        open={isAutomationsOpen}
        onOpenChange={setIsAutomationsOpen}
      />
    </>
  )
}

export default CRMSettingsButton
