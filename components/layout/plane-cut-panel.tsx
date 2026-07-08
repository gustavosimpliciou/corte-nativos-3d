"use client"

import { Scissors, FlipHorizontal2 } from 'lucide-react'
import * as THREE from 'three'
import { useAppStore } from '@/lib/store'
import { solidPlaneCut, planeFromAxisOffset, type PlaneAxis } from '@/lib/solid-plane-cut'
import { cn } from '@/lib/utils'

const AXES: { id: PlaneAxis; label: string; color: string }[] = [
  { id: 'x', label: 'X', color: 'oklch(0.65 0.22 25)' },
  { id: 'y', label: 'Y', color: 'oklch(0.72 0.20 145)' },
  { id: 'z', label: 'Z', color: 'oklch(0.65 0.20 250)' },
]

export function PlaneCutPanel() {
  const {
    activeTool,
    modelMesh,
    modelInfo,
    cutPlaneAxis,
    cutPlaneOffset,
    cutPlaneFlip,
    setCutPlaneAxis,
    setCutPlaneOffset,
    toggleCutPlaneFlip,
    setModelMesh,
    setModelInfo,
    addCutPart,
    cutParts,
    setStatus,
    pushHistory,
    clearSelection,
  } = useAppStore()

  if (activeTool !== 'cut' || !modelMesh) return null

  const handleExecute = () => {
    if (!modelMesh) return
    pushHistory()
    setStatus('cutting', 'Executando corte de sólido (watertight)...')

    setTimeout(() => {
      const geo = modelMesh.geometry as THREE.BufferGeometry
      if (!geo.boundingBox) geo.computeBoundingBox()
      const bbox = geo.boundingBox!

      const { normal, point } = planeFromAxisOffset(bbox, cutPlaneAxis, cutPlaneOffset, cutPlaneFlip)

      let result
      try {
        result = solidPlaneCut(geo, normal, point)
      } catch (err) {
        console.log('[v0] Erro no corte de sólido:', (err as Error).message)
        setStatus('error', 'Falha ao cortar o sólido.')
        return
      }

      const { positive, negative, capLoops, capTriangles } = result

      const posCount = positive.getAttribute('position')?.count ?? 0
      const negCount = negative.getAttribute('position')?.count ?? 0
      if (posCount === 0 || negCount === 0) {
        setStatus('error', 'O plano não intercepta o modelo. Ajuste a posição do corte.')
        return
      }

      // Metade positiva → vira o modelo principal (mesmo material cinza).
      const mainMesh = new THREE.Mesh(positive, modelMesh.material)
      mainMesh.position.copy(modelMesh.position)
      mainMesh.rotation.copy(modelMesh.rotation)
      mainMesh.scale.copy(modelMesh.scale)

      // Metade negativa → peça separada (laranja), afastada para visualização.
      // Mesmo material sólido do modelo: FrontSide + flatShading para a peça
      // parecer maciça (a tampa de corte é fechada, então não há vazamento).
      const partMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ff6600'),
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.FrontSide,
        flatShading: true,
      })
      const partMesh = new THREE.Mesh(negative, partMat)
      partMesh.position.copy(modelMesh.position)
      partMesh.rotation.copy(modelMesh.rotation)
      partMesh.scale.copy(modelMesh.scale)

      // Afasta a peça ~18% do tamanho ao longo da normal (para não sobrepor).
      const size = new THREE.Vector3()
      bbox.getSize(size)
      const spread = Math.max(size.x, size.y, size.z) * 0.18
      partMesh.position.add(normal.clone().multiplyScalar(-spread))

      setModelMesh(mainMesh)

      if (modelInfo) {
        const bb = positive.boundingBox
        const s = new THREE.Vector3()
        bb?.getSize(s)
        setModelInfo({
          ...modelInfo,
          vertices: posCount,
          faces: Math.floor(posCount / 3),
          width: bb ? parseFloat(s.x.toFixed(2)) : modelInfo.width,
          height: bb ? parseFloat(s.y.toFixed(2)) : modelInfo.height,
          depth: bb ? parseFloat(s.z.toFixed(2)) : modelInfo.depth,
        })
      }

      addCutPart({
        id: `plane-${Date.now()}`,
        name: `Metade ${cutParts.length + 1}`,
        mesh: partMesh,
        faceIndices: [],
        color: '#ff6600',
      })

      clearSelection()
      setStatus(
        'loaded',
        `Corte de sólido concluído — 2 peças fechadas · ${capLoops} contorno(s) · ${capTriangles.toLocaleString()} triângulos de tampa`,
      )
    }, 60)
  }

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 animate-fade-in pointer-events-auto">
      <div
        className="flex flex-col gap-3 p-3 rounded-xl border min-w-[340px]"
        style={{
          background: 'oklch(0.10 0 0 / 95%)',
          backdropFilter: 'blur(16px)',
          borderColor: 'oklch(0.22 0 0)',
          boxShadow: '0 8px 32px oklch(0 0 0 / 60%)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Corte de sólido por plano
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/50">watertight</span>
        </div>

        {/* Seletor de eixo */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/70 w-10">Eixo</span>
          <div className="flex gap-1 flex-1">
            {AXES.map((ax) => (
              <button
                key={ax.id}
                onClick={() => setCutPlaneAxis(ax.id)}
                className={cn(
                  'flex-1 rounded py-1.5 text-xs font-mono font-medium transition-all duration-150',
                  cutPlaneAxis === ax.id
                    ? 'text-background'
                    : 'border border-border text-muted-foreground hover:text-foreground',
                )}
                style={cutPlaneAxis === ax.id ? { background: ax.color } : undefined}
                aria-pressed={cutPlaneAxis === ax.id}
              >
                {ax.label}
              </button>
            ))}
          </div>
        </div>

        {/* Slider de posição */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/70 w-10">Pos.</span>
          <input
            type="range"
            min={0.02}
            max={0.98}
            step={0.005}
            value={cutPlaneOffset}
            onChange={(e) => setCutPlaneOffset(Number(e.target.value))}
            className="flex-1 cursor-pointer"
            style={{ accentColor: 'oklch(0.70 0.22 42)' }}
            aria-label="Posição do plano de corte"
          />
          <span className="text-[10px] font-mono tabular-nums w-9 text-right" style={{ color: 'oklch(0.70 0.22 42)' }}>
            {Math.round(cutPlaneOffset * 100)}%
          </span>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCutPlaneFlip}
            title="Inverte qual metade fica com o modelo principal"
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono transition-all duration-150',
              cutPlaneFlip
                ? 'text-background'
                : 'border border-border text-muted-foreground hover:text-foreground',
            )}
            style={cutPlaneFlip ? { background: 'oklch(0.55 0.02 250)' } : undefined}
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
            Inverter
          </button>

          <button
            onClick={handleExecute}
            className="flex items-center justify-center gap-2 flex-1 px-4 py-2 rounded-lg text-sm font-mono font-medium text-background hover:opacity-90 selection-glow transition-all duration-150"
            style={{ background: 'oklch(0.70 0.22 42)' }}
          >
            <Scissors className="w-4 h-4" />
            Executar corte
          </button>
        </div>
      </div>
    </div>
  )
}
