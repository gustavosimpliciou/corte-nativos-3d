"use client"

import React from 'react'
import {
  MousePointerClick,
  Scissors,
  Ruler,
  RotateCcw,
  Plus,
  Minus,
} from 'lucide-react'
import { useAppStore, type Tool } from '@/lib/store'
import { cn } from '@/lib/utils'
import { extractSubMesh } from '@/lib/smart-cut'
import * as THREE from 'three'

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; description: string }[] = [
  {
    id: 'select',
    icon: <MousePointerClick className="w-4 h-4" />,
    label: 'SmartCut',
    description: 'Seleção inteligente por região',
  },
  {
    id: 'cut',
    icon: <Scissors className="w-4 h-4" />,
    label: 'Corte',
    description: 'Executar corte da seleção',
  },
  {
    id: 'measure',
    icon: <Ruler className="w-4 h-4" />,
    label: 'Medir',
    description: 'Medir distâncias e ângulos',
  },
  {
    id: 'reset',
    icon: <RotateCcw className="w-4 h-4" />,
    label: 'Reset',
    description: 'Limpar seleção atual',
  },
]

export function LeftPanel() {
  const {
    activeTool,
    setActiveTool,
    selectionState,
    selectedFaceIndices,
    modelMesh,
    setModelMesh,
    addCutPart,
    clearSelection,
    resetAll,
    setStatus,
    cutParts,
    sharpAngle,
    setSharpAngle,
    cutMode,
    setCutMode,
  } = useAppStore()

  const hasSelection = selectedFaceIndices.size > 0 && selectionState === 'selected'

  const handleToolClick = (tool: Tool) => {
    if (tool === 'reset') {
      resetAll()
      return
    }
    setActiveTool(tool)
  }

  const handleCut = () => {
    if (!modelMesh || !hasSelection) return

    setStatus('cutting', 'Processando corte...')

    setTimeout(() => {
      const geo = modelMesh.geometry as THREE.BufferGeometry
      const subGeo = extractSubMesh(geo, selectedFaceIndices)

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xff6600),
        roughness: 0.5,
        metalness: 0.2,
        vertexColors: false,
        side: THREE.DoubleSide,
      })

      const cutMesh = new THREE.Mesh(subGeo, mat)
      cutMesh.castShadow = true
      cutMesh.receiveShadow = true

      const partId = `cut-${Date.now()}`
      addCutPart({
        id: partId,
        name: `Parte ${cutParts.length + 1}`,
        mesh: cutMesh,
        faceIndices: Array.from(selectedFaceIndices),
        color: '#ff6600',
      })

      clearSelection()
      setStatus('loaded', 'Peça separada com sucesso.')
    }, 100)
  }

  const handleSeparate = () => {
    if (!modelMesh || !hasSelection) return
    handleCut()
  }

  return (
    <aside
      className="flex flex-col items-center w-14 border-r border-border py-3 gap-1 shrink-0"
      style={{ background: 'oklch(0.09 0 0)' }}
      aria-label="Ferramentas"
    >
      {/* Ferramentas */}
      {TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          id={tool.id}
          icon={tool.icon}
          label={tool.label}
          description={tool.description}
          active={activeTool === tool.id && tool.id !== 'reset'}
          onClick={() => handleToolClick(tool.id)}
          disabled={tool.id !== 'select' && tool.id !== 'reset' && !modelMesh}
        />
      ))}

      {/* Separador */}
      <div className="w-8 h-px bg-border my-2" />

      {/* Modo de seleção: Peça inteira (ilha) vs Curvatura */}
      {activeTool === 'select' && (
        <div className="flex flex-col items-center gap-1 w-full px-1">
          <span className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">Modo</span>
          <div className="relative group flex flex-col gap-0.5 w-full">
            <button
              onClick={() => setCutMode('island')}
              className={cn(
                'w-full rounded py-1 text-[8px] font-mono uppercase tracking-wider transition-all duration-150',
                cutMode === 'island'
                  ? 'text-background font-medium'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              )}
              style={cutMode === 'island' ? { background: 'oklch(0.70 0.22 42)' } : undefined}
              aria-pressed={cutMode === 'island'}
            >
              Peça
            </button>
            <button
              onClick={() => setCutMode('curvature')}
              className={cn(
                'w-full rounded py-1 text-[8px] font-mono uppercase tracking-wider transition-all duration-150',
                cutMode === 'curvature'
                  ? 'text-background font-medium'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              )}
              style={cutMode === 'curvature' ? { background: 'oklch(0.70 0.22 42)' } : undefined}
              aria-pressed={cutMode === 'curvature'}
            >
              Curv.
            </button>
            <div className="tool-tooltip whitespace-nowrap">
              {cutMode === 'island'
                ? 'Peça inteira — seleciona só a parte clicada (cabelo, óculos, roupa)'
                : 'Por curvatura — expande pela superfície sem sair da peça'}
            </div>
          </div>
          <div className="w-8 h-px bg-border my-1" />
        </div>
      )}

      {/* Slider de sensibilidade SmartCut — só no modo curvatura */}
      {activeTool === 'select' && cutMode === 'curvature' && (
        <div className="flex flex-col items-center gap-1 w-full px-2">
          <span className="text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider">Sens.</span>
          <div className="relative group">
            <input
              type="range"
              min={1}
              max={150}
              step={1}
              value={sharpAngle}
              onChange={(e) => setSharpAngle(Number(e.target.value))}
              className="w-10 cursor-pointer"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                height: '56px',
                width: '4px',
                accentColor: 'oklch(0.70 0.22 42)',
              } as React.CSSProperties}
              aria-label={`Sensibilidade SmartCut: ${sharpAngle}°`}
            />
            {/* Tooltip do valor */}
            <div className="tool-tooltip whitespace-nowrap">
              Sensibilidade: {sharpAngle}°
              <br />
              <span className="text-muted-foreground/60 text-[9px]">
                {sharpAngle <= 5 ? 'Ultra preciso' : sharpAngle < 15 ? 'Muito restrito' : sharpAngle < 35 ? 'Padrão' : sharpAngle < 55 ? 'Amplo' : 'Máximo'}
              </span>
            </div>
          </div>
          <span className="text-[8px] font-mono tabular-nums" style={{ color: 'oklch(0.70 0.22 42)' }}>
            {sharpAngle}°
          </span>
          <div className="w-8 h-px bg-border my-1" />
        </div>
      )}

      {/* Botões de ajuste de seleção — aparecem quando há seleção */}
      {hasSelection && (
        <>
          <ToolButton
            id="add"
            icon={<Plus className="w-4 h-4" />}
            label="+"
            description="Adicionar à seleção"
            active={false}
            onClick={() => {}}
          />
          <ToolButton
            id="remove"
            icon={<Minus className="w-4 h-4" />}
            label="−"
            description="Remover da seleção"
            active={false}
            onClick={() => {}}
          />
          {/* Separador */}
          <div className="w-8 h-px bg-border my-2" />
        </>
      )}

      {/* Ações pós-seleção */}
      {hasSelection && (
        <div className="flex flex-col items-center gap-1 animate-fade-in">
          <ActionButton
            label="Cortar"
            color="orange"
            onClick={handleCut}
          />
          <ActionButton
            label="Sep."
            color="outline"
            onClick={handleSeparate}
          />
          <ActionButton
            label="Canc."
            color="ghost"
            onClick={clearSelection}
          />
        </div>
      )}
    </aside>
  )
}

interface ToolButtonProps {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}

function ToolButton({ id, icon, label, description, active, onClick, disabled }: ToolButtonProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'tool-btn',
          active && 'active',
          disabled && 'opacity-30 cursor-not-allowed'
        )}
        aria-label={description}
        aria-pressed={active}
      >
        {icon}
        <span className="text-[8px] font-mono uppercase tracking-wider leading-none">
          {label}
        </span>
        {/* Indicador ativo */}
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
            style={{ background: 'oklch(0.70 0.22 42)' }}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Tooltip */}
      <div
        className="tool-tooltip"
        role="tooltip"
      >
        {description}
      </div>
    </div>
  )
}

interface ActionButtonProps {
  label: string
  color: 'orange' | 'outline' | 'ghost'
  onClick: () => void
}

function ActionButton({ label, color, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-10 h-8 rounded text-[9px] font-mono uppercase tracking-wider transition-all duration-150 font-medium',
        color === 'orange' && 'text-background hover:opacity-90',
        color === 'outline' && 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
        color === 'ghost' && 'text-muted-foreground/50 hover:text-muted-foreground'
      )}
      style={
        color === 'orange'
          ? { background: 'oklch(0.70 0.22 42)' }
          : undefined
      }
    >
      {label}
    </button>
  )
}
