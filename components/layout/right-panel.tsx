"use client"

import { useState } from 'react'
import { Trash2, ChevronDown, ChevronRight, Box, Layers } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function RightPanel() {
  const {
    modelInfo,
    modelMesh,
    selectedFaceIndices,
    selectionState,
    unit,
    setUnit,
    cutParts,
    removeCutPart,
  } = useAppStore()

  const [infoOpen, setInfoOpen] = useState(true)
  const [selectionOpen, setSelectionOpen] = useState(true)
  const [partsOpen, setPartsOpen] = useState(true)

  const hasSelection = selectedFaceIndices.size > 0 && selectionState === 'selected'
  const unitMultiplier = unit === 'cm' ? 0.1 : unit === 'm' ? 0.001 : unit === 'in' ? 0.0393701 : 1

  const fmt = (val: number) => (val * unitMultiplier).toFixed(2)

  return (
    <aside
      className="flex flex-col w-60 border-l border-border overflow-y-auto shrink-0"
      style={{ background: 'oklch(0.09 0 0)' }}
      aria-label="Informações do modelo"
    >
      {/* Header do painel */}
      <div className="section-header flex items-center justify-between">
        <span>Propriedades</span>
        {modelInfo && (
          <span className="text-[9px] text-foreground/40 font-mono normal-case tracking-normal truncate max-w-28" title={modelInfo.name}>
            {modelInfo.name}
          </span>
        )}
      </div>

      {/* Sem modelo */}
      {!modelMesh && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
          <Box className="w-8 h-8 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/40 font-mono leading-relaxed">
            Nenhum modelo<br />carregado
          </p>
        </div>
      )}

      {/* Informações do modelo */}
      {modelInfo && (
        <Section
          title="Modelo"
          open={infoOpen}
          onToggle={() => setInfoOpen(!infoOpen)}
        >
          <StatRow label="Vértices" value={modelInfo.vertices.toLocaleString()} />
          <StatRow label="Faces" value={modelInfo.faces.toLocaleString()} />
          <StatRow label="Arquivo" value={modelInfo.fileSize} />

          {/* Unidade */}
          <div className="stat-row">
            <span className="stat-label">Unidade</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as any)}
              className="text-xs font-mono bg-transparent text-foreground border-none outline-none cursor-pointer"
              aria-label="Unidade de medida"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="in">in</option>
            </select>
          </div>

          {/* Dimensões */}
          <div className="pt-1 mt-1">
            <p className="stat-label mb-2">Dimensões</p>
            <DimensionBar axis="X" value={fmt(modelInfo.width)} unit={unit} color="#ff3333" />
            <DimensionBar axis="Y" value={fmt(modelInfo.height)} unit={unit} color="#33ff66" />
            <DimensionBar axis="Z" value={fmt(modelInfo.depth)} unit={unit} color="#3366ff" />
          </div>
        </Section>
      )}

      {/* Seleção atual */}
      {modelMesh && (
        <Section
          title="Seleção SmartCut"
          open={selectionOpen}
          onToggle={() => setSelectionOpen(!selectionOpen)}
          badge={hasSelection ? selectedFaceIndices.size.toLocaleString() : undefined}
          badgeColor="orange"
        >
          {!hasSelection ? (
            <p className="text-[11px] text-muted-foreground/40 font-mono py-2">
              Clique em uma região do modelo para selecionar
            </p>
          ) : (
            <>
              <StatRow
                label="Triângulos"
                value={selectedFaceIndices.size.toLocaleString()}
                highlight
              />
              <StatRow
                label="% do modelo"
                value={`${((selectedFaceIndices.size / (modelInfo?.faces ?? 1)) * 100).toFixed(1)}%`}
              />
            </>
          )}
        </Section>
      )}

      {/* Partes cortadas */}
      {modelMesh && (
        <Section
          title="Partes Cortadas"
          open={partsOpen}
          onToggle={() => setPartsOpen(!partsOpen)}
          badge={cutParts.length > 0 ? String(cutParts.length) : undefined}
        >
          {cutParts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/40 font-mono py-2">
              Nenhuma parte cortada ainda
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {cutParts.map((part, i) => (
                <div
                  key={part.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-secondary/50 group"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: 'oklch(0.70 0.22 42)' }}
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-mono text-foreground">{part.name}</span>
                  </div>
                  <button
                    onClick={() => removeCutPart(part.id)}
                    className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Remover ${part.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Espaço flex para empurrar tudo para cima */}
      <div className="flex-1" />

      {/* Rodapé do painel */}
      <div
        className="px-3 py-2 border-t border-border flex items-center gap-2"
        style={{ background: 'oklch(0.08 0 0)' }}
      >
        <Layers className="w-3 h-3 text-muted-foreground/30" />
        <span className="text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest">
          Nativos Cut v1.0
        </span>
      </div>
    </aside>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: string
  badgeColor?: 'orange' | 'default'
}

function Section({ title, open, onToggle, children, badge, badgeColor = 'default' }: SectionProps) {
  return (
    <div className="border-b border-border/50">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 hover:bg-secondary/30 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/50" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
          )}
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
        </div>
        {badge && (
          <span
            className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded',
              badgeColor === 'orange'
                ? 'text-background'
                : 'bg-secondary text-muted-foreground'
            )}
            style={
              badgeColor === 'orange'
                ? { background: 'oklch(0.70 0.22 42)' }
                : undefined
            }
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  )
}

interface StatRowProps {
  label: string
  value: string
  highlight?: boolean
}

function StatRow({ label, value, highlight }: StatRowProps) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span
        className={cn('stat-value', highlight && 'font-bold')}
        style={highlight ? { color: 'oklch(0.70 0.22 42)' } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

interface DimensionBarProps {
  axis: string
  value: string
  unit: string
  color: string
}

function DimensionBar({ axis, value, unit, color }: DimensionBarProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-[10px] font-mono font-bold w-3 shrink-0"
        style={{ color }}
      >
        {axis}
      </span>
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] font-mono text-foreground">
        {value}
        <span className="text-muted-foreground ml-0.5">{unit}</span>
      </span>
    </div>
  )
}
