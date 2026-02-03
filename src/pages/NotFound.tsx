import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-9xl font-bold text-primary/20">404</h1>
          <h2 className="text-2xl font-semibold">Página não encontrada</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            A página que você está procurando não existe ou foi movida para outro endereço.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild variant="outline">
            <Link to="/" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Ir para o Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
