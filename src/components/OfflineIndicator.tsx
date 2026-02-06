/**
 * Offline Indicator Component
 * Shows the current online/offline status and sync progress
 */

import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2, Cloud, CloudOff } from 'lucide-react';
import { useOffline } from '@/contexts/OfflineContext';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function OfflineIndicator({ className, showDetails = false }: OfflineIndicatorProps) {
  const {
    isOnline,
    isReconnecting,
    pendingSyncCount,
    isSyncing,
    lastSyncTime,
    syncError,
    triggerSync
  } = useOffline();

  // Don't show anything if online and no pending syncs
  if (isOnline && pendingSyncCount === 0 && !isSyncing && !showDetails) {
    return null;
  }

  const getStatusColor = () => {
    if (!isOnline) return 'bg-red-500';
    if (isReconnecting || isSyncing) return 'bg-yellow-500';
    if (syncError) return 'bg-orange-500';
    if (pendingSyncCount > 0) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="w-4 h-4" />;
    if (isReconnecting || isSyncing) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (syncError) return <AlertCircle className="w-4 h-4" />;
    if (pendingSyncCount > 0) return <Cloud className="w-4 h-4" />;
    return <CheckCircle2 className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isReconnecting) return 'Reconectando...';
    if (isSyncing) return 'Sincronizando...';
    if (syncError) return 'Erro de sincronização';
    if (pendingSyncCount > 0) return `${pendingSyncCount} pendente${pendingSyncCount > 1 ? 's' : ''}`;
    return 'Sincronizado';
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium transition-all duration-300',
        getStatusColor(),
        className
      )}
    >
      {getStatusIcon()}
      <span>{getStatusText()}</span>

      {/* Sync button when there are pending items */}
      {isOnline && pendingSyncCount > 0 && !isSyncing && (
        <button
          onClick={() => triggerSync()}
          className="ml-1 p-1 hover:bg-white/20 rounded-full transition-colors"
          title="Sincronizar agora"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}

      {/* Show details if requested */}
      {showDetails && lastSyncTime && (
        <span className="text-xs opacity-75 ml-2">
          Última sync: {lastSyncTime.toLocaleTimeString('pt-BR')}
        </span>
      )}
    </div>
  );
}

/**
 * Offline Banner Component
 * Shows a full-width banner when offline
 */
export function OfflineBanner() {
  const { isOnline, pendingSyncCount, isSyncing, triggerSync } = useOffline();

  if (isOnline && pendingSyncCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-white text-sm font-medium transition-all duration-300',
        !isOnline ? 'bg-red-600' : isSyncing ? 'bg-yellow-600' : 'bg-blue-600'
      )}
    >
      <div className="flex items-center justify-center gap-3">
        {!isOnline ? (
          <>
            <CloudOff className="w-4 h-4" />
            <span>Você está offline. As alterações serão salvas localmente.</span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Sincronizando dados...</span>
          </>
        ) : (
          <>
            <Cloud className="w-4 h-4" />
            <span>
              {pendingSyncCount} alteração{pendingSyncCount > 1 ? 'ões' : ''} pendente{pendingSyncCount > 1 ? 's' : ''} de sincronização
            </span>
            <button
              onClick={() => triggerSync()}
              className="ml-2 px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs"
            >
              Sincronizar agora
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compact offline status for header/navbar
 */
export function OfflineStatusBadge() {
  const { isOnline, pendingSyncCount, isSyncing } = useOffline();

  return (
    <div className="flex items-center gap-1">
      {isOnline ? (
        <Wifi className="w-4 h-4 text-green-500" />
      ) : (
        <WifiOff className="w-4 h-4 text-red-500" />
      )}
      {(pendingSyncCount > 0 || isSyncing) && (
        <span className="flex items-center justify-center w-4 h-4 text-[10px] bg-blue-500 text-white rounded-full">
          {isSyncing ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            pendingSyncCount
          )}
        </span>
      )}
    </div>
  );
}

export default OfflineIndicator;
