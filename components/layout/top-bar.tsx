"use client"

import { useRef } from 'react'
import {
  FolderOpen,
  Save,
  Download,
  Settings,
  Grid3x3,
  Axis3d,
  Wifi,
  Lock,
  LockOpen,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { loadModel } from '@/lib/model-loader'
import { cn } from '@/lib/utils'

interface TopBarProps {
  onExport?: () => void
}

export function TopBar({ onExport }: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    setStatus,
    setModelMesh,
    setModelInfo,
    setOriginalGeometry,
    modelMesh,
    showGrid,
    showAxes,
    showWireframe,
    toggleGrid,
    toggleAxes,
    toggleWireframe,
    allowCutPartSelection,
    toggleCutPartSelection,
    status,
  } = useAppStore()

  const handleOpenFile = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    e.target.value = ''
    setStatus('loading', `Carregando ${file.name}...`)

    try {
      const { mesh, info, wasDecimated } = await loadModel(file)
      setModelMesh(mesh)
      setModelInfo(info)
      setOriginalGeometry(mesh.geometry.clone())
      const decimNote = wasDecimated ? ' (decimado para fluidez)' : ''
      setStatus('loaded', `Modelo carregado — ${info.name}${decimNote}`)
    } catch (err: any) {
      setStatus('error', `Erro: ${err.message}`)
    }
  }

  return (
    <header
      className="flex items-center h-11 px-4 border-b border-border shrink-0 z-10"
      style={{ background: 'oklch(0.08 0 0)' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.obj,.ply,.glb,.gltf,.fbx,.3mf"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Abrir arquivo 3D"
      />

      {/* Logo */}
      <div className="flex items-center gap-2.5 mr-6">
        <LogoMark />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-foreground uppercase font-mono">
            NATIVOS
          </span>
          <span
            className="text-[10px] font-mono tracking-widest"
            style={{ color: 'oklch(0.70 0.22 42)' }}
          >
            CUT
          </span>
        </div>
        <div
          className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border"
          style={{
            color: 'oklch(0.70 0.22 42)',
            borderColor: 'oklch(0.70 0.22 42 / 30%)',
            background: 'oklch(0.70 0.22 42 / 8%)',
          }}
        >
          PRO
        </div>
      </div>

      {/* Separador */}
      <div className="h-6 w-px bg-border mr-4" />

      {/* Ações principais */}
      <div className="flex items-center gap-1">
        <TopBarBtn
          icon={<FolderOpen className="w-3.5 h-3.5" />}
          label="Abrir"
          shortcut="Ctrl+O"
          onClick={handleOpenFile}
          highlight={!modelMesh}
        />
        <TopBarBtn
          icon={<Save className="w-3.5 h-3.5" />}
          label="Salvar"
          shortcut="Ctrl+S"
          disabled={!modelMesh}
        />
        <TopBarBtn
          icon={<Download className="w-3.5 h-3.5" />}
          label="Exportar"
          shortcut="Ctrl+E"
          disabled={!modelMesh}
          onClick={onExport}
        />
      </div>

      {/* Separador */}
      <div className="h-6 w-px bg-border mx-3" />

      {/* Controles de visualização */}
      <div className="flex items-center gap-1">
        <ViewToggleBtn
          icon={<Grid3x3 className="w-3.5 h-3.5" />}
          label="Grid"
          active={showGrid}
          onClick={toggleGrid}
        />
        <ViewToggleBtn
          icon={<Axis3d className="w-3.5 h-3.5" />}
          label="Eixos"
          active={showAxes}
          onClick={toggleAxes}
        />
        <ViewToggleBtn
          icon={<Wifi className="w-3.5 h-3.5 rotate-90" />}
          label="Wireframe"
          active={showWireframe}
          onClick={toggleWireframe}
        />
        <ViewToggleBtn
          icon={
            allowCutPartSelection
              ? <LockOpen className="w-3.5 h-3.5" />
              : <Lock className="w-3.5 h-3.5" />
          }
          label={allowCutPartSelection ? 'Peças ✓' : 'Peças'}
          active={allowCutPartSelection}
          onClick={toggleCutPartSelection}
          title={
            allowCutPartSelection
              ? 'Seleção de peças cortadas: LIBERADA — clique nas peças vermelhas'
              : 'Seleção de peças cortadas: BLOQUEADA — peças vermelhas não podem ser selecionadas'
          }
        />
      </div>

      {/* Espaço flexível */}
      <div className="flex-1" />

      {/* Status de carregamento */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 mr-4 animate-fade-in">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'oklch(0.70 0.22 42)' }}
          />
          <span className="text-xs font-mono text-muted-foreground">Carregando...</span>
        </div>
      )}

      {/* Configurações */}
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label="Configurações"
      >
        <Settings className="w-3.5 h-3.5" />
        <span className="font-mono text-[11px] hidden md:block">Config</span>
      </button>
    </header>
  )
}

function LogoMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <polygon
        points="11,1 21,6.5 21,15.5 11,21 1,15.5 1,6.5"
        stroke="oklch(0.70 0.22 42)"
        strokeWidth="1.5"
        fill="none"
      />
      <line x1="11" y1="1" x2="11" y2="21" stroke="oklch(0.70 0.22 42 / 40%)" strokeWidth="1" />
      <line x1="1" y1="11" x2="21" y2="11" stroke="oklch(0.70 0.22 42 / 40%)" strokeWidth="1" />
      <polygon
        points="11,6 16,9 16,13 11,16 6,13 6,9"
        fill="oklch(0.70 0.22 42)"
        opacity="0.8"
      />
    </svg>
  )
}

interface TopBarBtnProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
  highlight?: boolean
}

function TopBarBtn({ icon, label, shortcut, onClick, disabled, highlight }: TopBarBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all duration-150',
        disabled
          ? 'text-muted-foreground/30 cursor-not-allowed'
          : highlight
          ? 'text-background font-medium hover:opacity-90'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      )}
      style={
        !disabled && highlight
          ? { background: 'oklch(0.70 0.22 42)', color: 'oklch(0.08 0 0)' }
          : undefined
      }
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

interface ViewToggleBtnProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  title?: string
}

function ViewToggleBtn({ icon, label, active, onClick, title }: ViewToggleBtnProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-all duration-150',
        active
          ? 'text-foreground bg-secondary'
          : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50'
      )}
      title={title ?? label}
    >
      {icon}
      <span className="hidden lg:block">{label}</span>
    </button>
  )
}
