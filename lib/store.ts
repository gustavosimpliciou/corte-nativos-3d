"use client"

import { create } from 'zustand'
import * as THREE from 'three'

export type Tool = 'select' | 'erase' | 'cut' | 'measure' | 'reset'
export type SelectionState = 'idle' | 'hovering' | 'selected' | 'cutting'
export type AppStatus = 'idle' | 'loading' | 'loaded' | 'selecting' | 'cutting' | 'exporting' | 'error'
export type SelectionMode = 'new' | 'add' | 'subtract'
/** Método de seleção do SmartCut: peça inteira (ilha) ou por curvatura */
export type CutMode = 'island' | 'curvature'

export interface ModelInfo {
  name: string
  vertices: number
  faces: number
  width: number
  height: number
  depth: number
  fileSize: string
}

export interface CutPart {
  id: string
  name: string
  mesh: THREE.Mesh
  faceIndices: number[]
  color: string
}

// Snapshot do estado versionável para desfazer/refazer
export interface HistorySnapshot {
  selectedFaceIndices: Set<number>
  cutParts: CutPart[]
  selectionState: SelectionState
  activeCutPartId: string | null
  // Malha e info do modelo — necessários para desfazer o corte destrutivo
  modelMesh: THREE.Mesh | null
  modelInfo: ModelInfo | null
}

export interface AppState {
  // Status geral
  status: AppStatus
  statusMessage: string
  fps: number

  // Arquivo e modelo
  modelInfo: ModelInfo | null
  modelMesh: THREE.Mesh | null
  originalGeometry: THREE.BufferGeometry | null

  // Ferramentas
  activeTool: Tool
  unit: 'mm' | 'cm' | 'm' | 'in'

  // Seleção SmartCut
  selectionState: SelectionState
  selectionMode: SelectionMode
  selectedFaceIndices: Set<number>
  hoveredFaceIndices: Set<number>
  cutParts: CutPart[]
  activeCutPartId: string | null

  // Configurações de visualização
  showGrid: boolean
  showAxes: boolean
  showWireframe: boolean

  // Permite selecionar/clicar nas peças já cortadas (vermelhas).
  // Quando false (padrão), a seleção da peça cortada fica bloqueada.
  allowCutPartSelection: boolean

  // Configurações SmartCut
  sharpAngle: number
  cutMode: CutMode

  // Borracha (raio do pincel em % do tamanho do modelo)
  eraserSize: number

  // Corte por plano (Solid Plane Cut)
  /** Eixo do plano de corte no espaço do mundo. */
  cutPlaneAxis: 'x' | 'y' | 'z'
  /** Posição do plano ao longo do eixo, normalizada 0..1 na bounding box. */
  cutPlaneOffset: number
  /** Inverte qual metade é considerada "positiva". */
  cutPlaneFlip: boolean

  // Histórico (desfazer/refazer)
  past: HistorySnapshot[]
  future: HistorySnapshot[]

  // Ações
  setStatus: (status: AppStatus, message?: string) => void
  setFps: (fps: number) => void
  setModelInfo: (info: ModelInfo | null) => void
  setModelMesh: (mesh: THREE.Mesh | null) => void
  setOriginalGeometry: (geo: THREE.BufferGeometry | null) => void
  setActiveTool: (tool: Tool) => void
  setUnit: (unit: 'mm' | 'cm' | 'm' | 'in') => void
  setSelectionState: (state: SelectionState) => void
  setSelectionMode: (mode: SelectionMode) => void
  setSelectedFaceIndices: (indices: Set<number>) => void
  setHoveredFaceIndices: (indices: Set<number>) => void
  addCutPart: (part: CutPart) => void
  removeCutPart: (id: string) => void
  setActiveCutPartId: (id: string | null) => void
  setSharpAngle: (angle: number) => void
  setCutMode: (mode: CutMode) => void
  setEraserSize: (size: number) => void
  setCutPlaneAxis: (axis: 'x' | 'y' | 'z') => void
  setCutPlaneOffset: (offset: number) => void
  toggleCutPlaneFlip: () => void
  toggleGrid: () => void
  toggleAxes: () => void
  toggleWireframe: () => void
  toggleCutPartSelection: () => void
  clearSelection: () => void
  resetAll: () => void

  // Histórico
  pushHistory: () => void
  undo: () => void
  redo: () => void
}

const MAX_HISTORY = 50

export const useAppStore = create<AppState>((set) => ({
  status: 'idle',
  statusMessage: 'Pronto. Abra um modelo 3D para começar.',
  fps: 60,

  modelInfo: null,
  modelMesh: null,
  originalGeometry: null,

  activeTool: 'select',
  unit: 'mm',

  selectionState: 'idle',
  selectionMode: 'new',
  selectedFaceIndices: new Set(),
  hoveredFaceIndices: new Set(),
  cutParts: [],
  activeCutPartId: null,

  showGrid: true,
  showAxes: true,
  showWireframe: false,

  allowCutPartSelection: false,

  sharpAngle: 10,
  cutMode: 'island',

  eraserSize: 5,

  cutPlaneAxis: 'y',
  cutPlaneOffset: 0.5,
  cutPlaneFlip: false,

  past: [],
  future: [],

  setStatus: (status, message) =>
    set({ status, statusMessage: message ?? getDefaultMessage(status) }),

  setFps: (fps) => set({ fps }),

  setModelInfo: (info) => set({ modelInfo: info }),

  setModelMesh: (mesh) => set({ modelMesh: mesh }),

  setOriginalGeometry: (geo) => set({ originalGeometry: geo }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setUnit: (unit) => set({ unit }),

  setSelectionState: (selectionState) => set({ selectionState }),

  setSelectionMode: (selectionMode) => set({ selectionMode }),

  setSelectedFaceIndices: (selectedFaceIndices) => set({ selectedFaceIndices }),

  setHoveredFaceIndices: (hoveredFaceIndices) => set({ hoveredFaceIndices }),

  addCutPart: (part) =>
    set((state) => ({ cutParts: [...state.cutParts, part] })),

  removeCutPart: (id) =>
    set((state) => ({ cutParts: state.cutParts.filter((p) => p.id !== id) })),

  setActiveCutPartId: (id) => set({ activeCutPartId: id }),

  setSharpAngle: (sharpAngle) => set({ sharpAngle }),

  setCutMode: (cutMode) => set({ cutMode }),

  setEraserSize: (eraserSize) => set({ eraserSize }),

  setCutPlaneAxis: (cutPlaneAxis) => set({ cutPlaneAxis }),

  setCutPlaneOffset: (cutPlaneOffset) => set({ cutPlaneOffset }),

  toggleCutPlaneFlip: () => set((state) => ({ cutPlaneFlip: !state.cutPlaneFlip })),

  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),

  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),

  toggleWireframe: () => set((state) => ({ showWireframe: !state.showWireframe })),

  toggleCutPartSelection: () =>
    set((state) => ({
      allowCutPartSelection: !state.allowCutPartSelection,
      // Ao desligar, remove o destaque de qualquer peça cortada ativa
      activeCutPartId: !state.allowCutPartSelection ? state.activeCutPartId : null,
    })),

  clearSelection: () =>
    set({
      selectedFaceIndices: new Set(),
      hoveredFaceIndices: new Set(),
      selectionState: 'idle',
    }),

  resetAll: () =>
    set((state) => ({
      past: pushSnapshot(state.past, snapshotOf(state)),
      future: [],
      selectionState: 'idle',
      selectedFaceIndices: new Set(),
      hoveredFaceIndices: new Set(),
      activeCutPartId: null,
      status: 'loaded',
      statusMessage: 'Seleção resetada.',
    })),

  // Grava o estado atual no histórico antes de uma mudança
  pushHistory: () =>
    set((state) => ({
      past: pushSnapshot(state.past, snapshotOf(state)),
      future: [],
    })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {}
      const previous = state.past[state.past.length - 1]
      const newPast = state.past.slice(0, -1)
      return {
        past: newPast,
        future: [snapshotOf(state), ...state.future].slice(0, MAX_HISTORY),
        selectedFaceIndices: previous.selectedFaceIndices,
        cutParts: previous.cutParts,
        selectionState: previous.selectionState,
        activeCutPartId: previous.activeCutPartId,
        modelMesh: previous.modelMesh,
        modelInfo: previous.modelInfo,
        hoveredFaceIndices: new Set(),
        status: 'loaded',
        statusMessage: 'Ação desfeita.',
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {}
      const next = state.future[0]
      const newFuture = state.future.slice(1)
      return {
        past: pushSnapshot(state.past, snapshotOf(state)),
        future: newFuture,
        selectedFaceIndices: next.selectedFaceIndices,
        cutParts: next.cutParts,
        selectionState: next.selectionState,
        activeCutPartId: next.activeCutPartId,
        modelMesh: next.modelMesh,
        modelInfo: next.modelInfo,
        hoveredFaceIndices: new Set(),
        status: 'loaded',
        statusMessage: 'Ação refeita.',
      }
    }),
}))

// ── Helpers de histórico ──────────────────────────────────────────────────────
function snapshotOf(state: AppState): HistorySnapshot {
  return {
    selectedFaceIndices: new Set(state.selectedFaceIndices),
    cutParts: [...state.cutParts],
    selectionState: state.selectionState,
    activeCutPartId: state.activeCutPartId,
    modelMesh: state.modelMesh,
    modelInfo: state.modelInfo,
  }
}

function pushSnapshot(past: HistorySnapshot[], snap: HistorySnapshot): HistorySnapshot[] {
  const next = [...past, snap]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

function getDefaultMessage(status: AppStatus): string {
  switch (status) {
    case 'idle': return 'Pronto. Abra um modelo 3D para começar.'
    case 'loading': return 'Carregando modelo...'
    case 'loaded': return 'Modelo carregado. Clique em uma região para selecionar.'
    case 'selecting': return 'Selecionando... SmartCut analisando geometria.'
    case 'cutting': return 'Processando corte...'
    case 'exporting': return 'Exportando...'
    case 'error': return 'Erro ao processar.'
    default: return ''
  }
}
