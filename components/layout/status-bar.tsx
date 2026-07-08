"use client"

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Activity, Cpu, HardDrive } from 'lucide-react'

export function StatusBar() {
  const { status, statusMessage, fps, unit, modelInfo, selectionState, selectedFaceIndices } =
    useAppStore()

  const isError = status === 'error'
  const isLoading = status === 'loading'
  const isSelecting = selectionState === 'selecting' as any

  return (
    <footer
      className="flex items-center h-7 px-4 border-t border-border gap-4 shrink-0 z-10"
      style={{ background: 'oklch(0.07 0 0)' }}
      aria-label="Barra de status"
    >
      {/* Status principal */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <StatusDot status={status} />
        <span
          className={cn(
            'text-[11px] font-mono truncate',
            isError ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {statusMessage}
        </span>

        {/* Loader animado */}
        {(isLoading || isSelecting) && (
          <div className="flex gap-0.5 items-center ml-1 shrink-0">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full animate-bounce"
                style={{
                  background: 'oklch(0.70 0.22 42)',
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '0.8s',
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>

      {/* Separadores e métricas */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Faces do modelo */}
        {modelInfo && (
          <StatusItem
            icon={<HardDrive className="w-2.5 h-2.5" />}
            label={`${modelInfo.faces.toLocaleString()} tri`}
          />
        )}

        {/* Seleção */}
        {selectedFaceIndices.size > 0 && (
          <StatusItem
            icon={
              <div
                className="w-2 h-2 rounded-sm"
                style={{ background: 'oklch(0.70 0.22 42)' }}
              />
            }
            label={`${selectedFaceIndices.size.toLocaleString()} sel.`}
            highlight
          />
        )}

        {/* Separador */}
        <div className="h-3 w-px bg-border" />

        {/* Unidade */}
        <StatusItem
          icon={<Cpu className="w-2.5 h-2.5" />}
          label={unit.toUpperCase()}
        />

        {/* FPS */}
        <div className="flex items-center gap-1">
          <Activity className="w-2.5 h-2.5 text-muted-foreground/40" aria-hidden="true" />
          <span
            className={cn(
              'text-[11px] font-mono tabular-nums',
              fps >= 55 ? '' : fps >= 30 ? 'text-yellow-500' : 'text-destructive'
            )}
            style={fps >= 55 ? { color: 'oklch(0.70 0.22 42 / 80%)' } : undefined}
          >
            {fps}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/30">FPS</span>
        </div>

        {/* Separador */}
        <div className="h-3 w-px bg-border" />

        {/* SmartCut badge */}
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
          style={{
            borderColor: 'oklch(0.70 0.22 42 / 20%)',
            background: 'oklch(0.70 0.22 42 / 5%)',
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'oklch(0.70 0.22 42)' }}
            aria-hidden="true"
          />
          <span
            className="text-[9px] font-mono uppercase tracking-widest"
            style={{ color: 'oklch(0.70 0.22 42 / 70%)' }}
          >
            SmartCut
          </span>
        </div>
      </div>
    </footer>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'error'
      ? 'bg-destructive'
      : status === 'loading' || status === 'cutting'
      ? ''
      : status === 'loaded' || status === 'loaded'
      ? ''
      : 'bg-muted-foreground/30'

  return (
    <div
      className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        status === 'error' && 'bg-destructive',
        (status === 'loading' || status === 'cutting') && 'animate-pulse',
        status === 'idle' && 'bg-muted-foreground/30'
      )}
      style={
        status !== 'error' && status !== 'idle'
          ? { background: 'oklch(0.70 0.22 42)' }
          : undefined
      }
      aria-hidden="true"
    />
  )
}

interface StatusItemProps {
  icon: React.ReactNode
  label: string
  highlight?: boolean
}

function StatusItem({ icon, label, highlight }: StatusItemProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground/40" aria-hidden="true">
        {icon}
      </span>
      <span
        className="text-[11px] font-mono"
        style={highlight ? { color: 'oklch(0.70 0.22 42)' } : { color: 'oklch(0.50 0 0)' }}
      >
        {label}
      </span>
    </div>
  )
}
