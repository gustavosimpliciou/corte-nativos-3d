"use client"

import { useState } from 'react'
import { Download, X, FileDown, Layers, Box, GitBranch } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { exportMesh } from '@/lib/model-loader'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

interface ExportPanelProps {
  open: boolean
  onClose: () => void
}

type ExportFormat = 'stl' | 'obj'
type ExportMode = 'full' | 'cut' | 'selection' | 'all'

export function ExportPanel({ open, onClose }: ExportPanelProps) {
  const { modelMesh, cutParts, selectedFaceIndices, setStatus } = useAppStore()
  const [format, setFormat] = useState<ExportFormat>('stl')
  const [mode, setMode] = useState<ExportMode>('full')
  const [exporting, setExporting] = useState(false)

  if (!open) return null

  const handleExport = async () => {
    if (!modelMesh) return
    setExporting(true)
    setStatus('exporting', 'Exportando...')

    try {
      if (mode === 'full') {
        await exportMesh(modelMesh, format, 'modelo-completo')
      } else if (mode === 'cut' && cutParts.length > 0) {
        for (const part of cutParts) {
          await exportMesh(part.mesh, format, part.name)
        }
      } else if (mode === 'all') {
        await exportMesh(modelMesh, format, 'modelo-completo')
        for (const part of cutParts) {
          await exportMesh(part.mesh, format, part.name)
        }
      }

      setStatus('loaded', 'Exportação concluída.')
      onClose()
    } catch (err: any) {
      setStatus('error', `Erro ao exportar: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  const exportOptions: { id: ExportMode; icon: React.ReactNode; label: string; description: string }[] = [
    {
      id: 'full',
      icon: <Box className="w-4 h-4" />,
      label: 'Modelo inteiro',
      description: 'Exportar o modelo completo como um único arquivo',
    },
    {
      id: 'cut',
      icon: <GitBranch className="w-4 h-4" />,
      label: 'Peças cortadas',
      description: `${cutParts.length} peça(s) separada(s) individualmente`,
    },
    {
      id: 'all',
      icon: <Layers className="w-4 h-4" />,
      label: 'Todos os objetos',
      description: 'Modelo + todas as peças separadas',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog" aria-label="Exportar modelo">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-96 rounded-xl border border-border animate-fade-in overflow-hidden"
        style={{ background: 'oklch(0.10 0 0)', boxShadow: '0 24px 48px oklch(0 0 0 / 80%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileDown className="w-4 h-4" style={{ color: 'oklch(0.70 0.22 42)' }} />
            <span className="font-mono text-sm font-medium text-foreground uppercase tracking-wider">
              Exportar
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Formato */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Formato
            </p>
            <div className="flex gap-2">
              {(['stl', 'obj'] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider transition-all',
                    format === f
                      ? 'text-background border-transparent'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                  )}
                  style={
                    format === f
                      ? { background: 'oklch(0.70 0.22 42)' }
                      : undefined
                  }
                >
                  .{f}
                </button>
              ))}
            </div>
          </div>

          {/* Modo */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              O que exportar
            </p>
            <div className="flex flex-col gap-1.5">
              {exportOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setMode(opt.id)}
                  disabled={opt.id === 'cut' && cutParts.length === 0}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                    mode === opt.id
                      ? 'border-orange/40 text-foreground'
                      : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
                    opt.id === 'cut' && cutParts.length === 0 && 'opacity-30 cursor-not-allowed'
                  )}
                  style={
                    mode === opt.id
                      ? { background: 'oklch(0.70 0.22 42 / 10%)' }
                      : undefined
                  }
                >
                  <span style={mode === opt.id ? { color: 'oklch(0.70 0.22 42)' } : undefined}>
                    {opt.icon}
                  </span>
                  <div>
                    <p className="text-xs font-mono font-medium">{opt.label}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Botão exportar */}
          <button
            onClick={handleExport}
            disabled={exporting || !modelMesh}
            className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-mono font-medium text-background transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'oklch(0.70 0.22 42)' }}
          >
            {exporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Exportar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
