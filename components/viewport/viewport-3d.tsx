"use client"

import { Suspense, useRef, useCallback, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree, invalidate } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useAppStore } from '@/lib/store'
import {
  smartSelect,
  buildAdjacencyCache,
  ensureColorAttribute,
  paintFaces,
  paintFacesDelta,
  paintHoverDelta,
} from '@/lib/smart-cut'
import { ModelRenderer } from './model-renderer'
import { AxesHelper } from './axes-helper'

// ─── FPS Counter ──────────────────────────────────────────────────────────────
function FpsCounter() {
  const { setFps } = useAppStore()
  const count = useRef(0)
  const last  = useRef(performance.now())
  useFrame(() => {
    count.current++
    const now = performance.now()
    const dt  = now - last.current
    if (dt >= 1000) {
      setFps(Math.round((count.current * 1000) / dt))
      count.current = 0
      last.current  = now
    }
  })
  return null
}

// ─── SmartCut Interaction ─────────────────────────────────────────────────────
function SmartCutInteraction() {
  const {
    modelMesh,
    activeTool,
    selectionMode,
    setSelectionMode,
    setSelectionState,
    setSelectedFaceIndices,
    selectedFaceIndices,
    setStatus,
    sharpAngle,
    cutMode,
    pushHistory,
    undo,
    redo,
    allowCutPartSelection,
    cutParts,
    activeCutPartId,
    setActiveCutPartId,
  } = useAppStore()

  const { camera, gl, raycaster } = useThree()

  // Refs para estado mutable sem re-render
  const mouseNDC       = useRef(new THREE.Vector2())
  const hoverRafRef    = useRef<number | null>(null)
  const pendingMouse   = useRef<{ x: number; y: number } | null>(null)
  const isOrbitingRef  = useRef(false)
  const orbitStartRef  = useRef<{ x: number; y: number } | null>(null)
  const modKeys        = useRef({ ctrl: false, alt: false })

  // Refs para estado de seleção acessível sem closure stale
  const selectedRef    = useRef<Set<number>>(new Set())
  const hoveredRef     = useRef<Set<number>>(new Set())
  const colorAttrRef   = useRef<THREE.BufferAttribute | null>(null)
  const selModeRef     = useRef<'new' | 'add' | 'subtract'>('new')

  // Sincroniza o ref de seleção com o store. Quando a mudança vem de fora do
  // fluxo normal de clique (ex.: desfazer/refazer), o objeto Set é diferente do
  // que está pintado, então repintamos o delta para refletir na geometria.
  useEffect(() => {
    const prev = selectedRef.current
    if (prev !== selectedFaceIndices) {
      const colorAttr = colorAttrRef.current
      if (modelMesh && colorAttr) {
        paintFacesDelta(modelMesh.geometry, colorAttr, prev, selectedFaceIndices, 'new')
        hoveredRef.current = new Set()
        invalidate()
      }
      selectedRef.current = selectedFaceIndices
    }
  }, [selectedFaceIndices, modelMesh])
  useEffect(() => { selModeRef.current = selectionMode as 'new' | 'add' | 'subtract' }, [selectionMode])

  // Inicializar colorAttr quando modelo carrega
  useEffect(() => {
    if (!modelMesh) {
      colorAttrRef.current = null
      hoveredRef.current   = new Set()
      return
    }
    const mat = modelMesh.material as THREE.MeshStandardMaterial
    colorAttrRef.current = ensureColorAttribute(modelMesh.geometry, mat)
    // Construir cache de adjacência com ângulo atual
    setTimeout(() => buildAdjacencyCache(modelMesh.geometry, sharpAngle ?? 35), 80)
  }, [modelMesh, sharpAngle])

  // ── Ctrl / Alt ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      modKeys.current.ctrl = e.ctrlKey || e.metaKey
      modKeys.current.alt  = e.altKey
      const next: 'new' | 'add' | 'subtract' =
        (e.ctrlKey || e.metaKey) ? 'add' : e.altKey ? 'subtract' : 'new'
      selModeRef.current = next
      setSelectionMode(next)
    }
    window.addEventListener('keydown', onKey, { passive: true })
    window.addEventListener('keyup',   onKey, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup',   onKey)
    }
  }, [setSelectionMode])

  // ── Raycast ──────────────────────────────────────────────────────────────────
  const raycastFace = useCallback(
    (clientX: number, clientY: number): number | null => {
      if (!modelMesh) return null
      const rect = gl.domElement.getBoundingClientRect()
      mouseNDC.current.set(
        ((clientX - rect.left) / rect.width)  *  2 - 1,
       -((clientY - rect.top)  / rect.height) *  2 + 1,
      )
      raycaster.setFromCamera(mouseNDC.current, camera)
      const hits = raycaster.intersectObject(modelMesh, false)
      return hits.length > 0 && hits[0].faceIndex !== undefined
        ? hits[0].faceIndex
        : null
    },
    [modelMesh, camera, gl, raycaster],
  )

  // ── Hover: direto ao BufferAttribute, zero React ─────────────────────────────
  const doHover = useCallback(
    (clientX: number, clientY: number) => {
      if (!modelMesh || activeTool !== 'select') return
      const colorAttr = colorAttrRef.current
      if (!colorAttr) return

      const faceIndex = raycastFace(clientX, clientY)
      const newHovered = faceIndex === null
        ? new Set<number>()
        : smartSelect(modelMesh.geometry, faceIndex, { sharpAngle: sharpAngle ?? 35 })

      // Só repintar se o hover mudou
      if (newHovered.size === hoveredRef.current.size) {
        // Comparação rápida: se mesmo tamanho verifica o índice da face semente
        if (faceIndex !== null && hoveredRef.current.has(faceIndex)) return
        if (faceIndex === null && hoveredRef.current.size === 0) return
      }

      const prevHover = hoveredRef.current
      hoveredRef.current = newHovered

      // Pintura cirúrgica delta: só as faces que entraram/saíram do hover
      paintHoverDelta(
        modelMesh.geometry,
        colorAttr,
        selectedRef.current,
        prevHover,
        newHovered,
        selModeRef.current,
      )
      invalidate()
    },
    [modelMesh, activeTool, raycastFace, sharpAngle],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isOrbitingRef.current) return
      pendingMouse.current = { x: e.clientX, y: e.clientY }
      if (hoverRafRef.current !== null) return
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null
        const pos = pendingMouse.current
        if (!pos) return
        pendingMouse.current = null
        doHover(pos.x, pos.y)
      })
    },
    [doHover],
  )

  // ── Click: BFS + acumulação + state ──────────────────────────────────────────
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!modelMesh || activeTool !== 'select' || isOrbitingRef.current) return
      const colorAttr = colorAttrRef.current
      if (!colorAttr) return

      // Seleção de peças já cortadas (vermelhas): só quando habilitado.
      // Se bloqueado, as peças cortadas são ignoradas pelo raycast.
      if (allowCutPartSelection && cutParts.length > 0) {
        const rect = gl.domElement.getBoundingClientRect()
        mouseNDC.current.set(
          ((e.clientX - rect.left) / rect.width)  *  2 - 1,
         -((e.clientY - rect.top)  / rect.height) *  2 + 1,
        )
        raycaster.setFromCamera(mouseNDC.current, camera)
        const partMeshes = cutParts.map((p) => p.mesh)
        const partHits = raycaster.intersectObjects(partMeshes, false)
        if (partHits.length > 0) {
          const hitMesh = partHits[0].object
          const part = cutParts.find((p) => p.mesh === hitMesh)
          if (part) {
            const nextActive = part.id === activeCutPartId ? null : part.id
            setActiveCutPartId(nextActive)
            setStatus('loaded', nextActive ? `Peça selecionada — ${part.name}` : 'Seleção da peça removida')
            invalidate()
            return
          }
        }
      }

      const faceIndex = raycastFace(e.clientX, e.clientY)

      // Clique no vazio com modo neutro → limpar tudo
      if (faceIndex === null) {
        if (!modKeys.current.ctrl && !modKeys.current.alt) {
          const prev = selectedRef.current
          if (prev.size > 0) pushHistory()
          selectedRef.current   = new Set()
          hoveredRef.current    = new Set()
          paintFacesDelta(modelMesh.geometry, colorAttr, prev, new Set(), 'new')
          setSelectedFaceIndices(new Set())
          setSelectionState('idle')
          invalidate()
        }
        return
      }

      const mode = modKeys.current.ctrl
        ? 'add' : modKeys.current.alt ? 'subtract' : 'new'

      // Grava estado atual no histórico antes de mudar a seleção
      pushHistory()

      setStatus('selecting', 'SmartCut selecionando...')

      // Roda na mesma microtask para não bloquear o frame
      const region = smartSelect(modelMesh.geometry, faceIndex, { sharpAngle: sharpAngle ?? 35, mode: cutMode })

      let next: Set<number>
      if (mode === 'add') {
        next = new Set(selectedRef.current)
        for (const f of region) next.add(f)
      } else if (mode === 'subtract') {
        next = new Set(selectedRef.current)
        for (const f of region) next.delete(f)
      } else {
        next = region
      }

      // Pintura incremental (cirúrgica)
      paintFacesDelta(modelMesh.geometry, colorAttr, selectedRef.current, next, mode)
      // Limpar hover após commit
      hoveredRef.current = new Set()

      selectedRef.current = next
      setSelectedFaceIndices(next)
      setSelectionState(next.size > 0 ? 'selected' : 'idle')

      const label =
        mode === 'add'      ? `+${region.size.toLocaleString()} faces adicionadas — ${next.size.toLocaleString()} total` :
        mode === 'subtract' ? `${region.size.toLocaleString()} faces removidas — ${next.size.toLocaleString()} total` :
                              `${next.size.toLocaleString()} faces selecionadas`
      setStatus('loaded', label)
      invalidate()
    },
    [modelMesh, activeTool, raycastFace, setSelectedFaceIndices, setSelectionState, setStatus, sharpAngle, cutMode, pushHistory, allowCutPartSelection, cutParts, activeCutPartId, setActiveCutPartId, camera, gl, raycaster],
  )

  // ── Atalhos: Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Shift+Z ou Ctrl+Y refaz ─────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // Pausar hover durante orbita
  const handlePointerDown = useCallback((e: PointerEvent) => {
    isOrbitingRef.current = true
    orbitStartRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const start = orbitStartRef.current
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4 : false
    if (!moved) isOrbitingRef.current = false
    else setTimeout(() => { isOrbitingRef.current = false }, 60)
    orbitStartRef.current = null
  }, [])

  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener('mousemove',   handleMouseMove,   { passive: true })
    canvas.addEventListener('click',       handleClick)
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: true })
    canvas.addEventListener('pointerup',   handlePointerUp,   { passive: true })
    return () => {
      canvas.removeEventListener('mousemove',   handleMouseMove)
      canvas.removeEventListener('click',       handleClick)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup',   handlePointerUp)
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current)
    }
  }, [gl.domElement, handleMouseMove, handleClick, handlePointerDown, handlePointerUp])

  return null
}

// ─── Viewport principal ────────────────────────────────────────────────────────
export function Viewport3D() {
  const { showGrid, showAxes, modelMesh } = useAppStore()

  return (
    <div className="relative w-full h-full bg-[#060608]">
      {/* Grade decorativa de fundo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(oklch(0.18 0 0 / 30%) 1px, transparent 1px), linear-gradient(90deg, oklch(0.18 0 0 / 30%) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <Canvas
        frameloop="always"
        camera={{ position: [0, 0, 5], fov: 45, near: 0.001, far: 2000 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          outputColorSpace: THREE.SRGBColorSpace,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <FpsCounter />
        <SmartCutInteraction />

        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 5]}   intensity={1.2} />
        <directionalLight position={[-5, 3, -5]} intensity={0.35} color="#6688aa" />
        <pointLight       position={[0, -5, 0]}  intensity={0.15} color="#334455" />

        {showGrid && (
          <Grid
            args={[20, 20]}
            position={[0, -2, 0]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#1a1a1a"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#222222"
            fadeDistance={15}
            fadeStrength={1}
            followCamera={false}
          />
        )}

        {showAxes && <AxesHelper />}

        <Suspense fallback={null}>
          <ModelRenderer />
        </Suspense>

        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          rotateSpeed={0.65}
          zoomSpeed={1.2}
          panSpeed={0.85}
          minDistance={0.001}
          maxDistance={500}
          enablePan
          mouseButtons={{
            LEFT:   THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT:  THREE.MOUSE.PAN,
          }}
        />
      </Canvas>

      {!modelMesh && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-lg border border-border/30 flex items-center justify-center">
              <svg viewBox="0 0 40 40" className="w-10 h-10 text-muted-foreground/30" fill="none" stroke="currentColor" strokeWidth="1">
                <polygon points="20,4 36,14 36,26 20,36 4,26 4,14" />
                <line x1="20" y1="4"  x2="20" y2="36" />
                <line x1="4"  y1="14" x2="36" y2="14" />
                <line x1="4"  y1="26" x2="36" y2="26" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground/50 font-mono uppercase tracking-widest">
                Nenhum modelo carregado
              </p>
              <p className="text-xs text-muted-foreground/30 mt-1">STL · OBJ · PLY · GLB · GLTF</p>
            </div>
          </div>
        </div>
      )}

      <ActiveToolIndicator />
    </div>
  )
}

// ─── Indicador de modo ────────────────────────────────────────────────────────
function ActiveToolIndicator() {
  const { activeTool, selectionState, selectedFaceIndices, selectionMode } = useAppStore()
  if (activeTool !== 'select') return null

  const modeLabel =
    selectionMode === 'add'      ? '+ Adicionar  (Ctrl)' :
    selectionMode === 'subtract' ? '− Remover  (Alt)'    : null

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-2">
      {modeLabel && (
        <div
          className="glass-panel rounded px-3 py-1 text-xs font-mono tracking-wider"
          style={{
            color: selectionMode === 'add' ? 'oklch(0.75 0.22 42)' : 'oklch(0.70 0.12 250)',
            borderColor: selectionMode === 'add' ? 'oklch(0.50 0.20 42 / 60%)' : 'oklch(0.45 0.10 250 / 60%)',
          }}
        >
          {modeLabel}
        </div>
      )}

      {selectionState === 'selected' && selectedFaceIndices.size > 0 && (
        <div className="animate-fade-in glass-panel rounded-md px-4 py-2 flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: 'oklch(0.70 0.22 42)', boxShadow: '0 0 6px oklch(0.70 0.22 42)' }}
          />
          <span className="text-xs font-mono text-foreground">
            {selectedFaceIndices.size.toLocaleString()} faces selecionadas
          </span>
        </div>
      )}
    </div>
  )
}
