"use client"

import { Scissors, GitBranch, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { extractSubMesh, removeSubMesh } from '@/lib/smart-cut'
import * as THREE from 'three'
import { cn } from '@/lib/utils'

export function CutActions() {
  const {
    selectionState,
    selectedFaceIndices,
    modelMesh,
    modelInfo,
    setModelMesh,
    setModelInfo,
    addCutPart,
    clearSelection,
    setStatus,
    cutParts,
    pushHistory,
  } = useAppStore()

  const hasSelection = selectedFaceIndices.size > 0 && selectionState === 'selected'

  if (!hasSelection) return null

  // Cortar → a parte selecionada é removida do modelo (some de vez).
  const handleCut = () => {
    if (!modelMesh) return
    const removedCount = selectedFaceIndices.size
    // Grava estado atual no histórico antes de cortar (permite desfazer)
    pushHistory()
    setStatus('cutting', 'Removendo parte selecionada...')

    setTimeout(() => {
      const geo = modelMesh.geometry as THREE.BufferGeometry
      const newGeo = removeSubMesh(geo, selectedFaceIndices)

      // Nova malha com o mesmo material do modelo (mantém aparência)
      const newMesh = new THREE.Mesh(newGeo, modelMesh.material)
      newMesh.castShadow = true
      newMesh.receiveShadow = true
      newMesh.position.copy(modelMesh.position)
      newMesh.rotation.copy(modelMesh.rotation)
      newMesh.scale.copy(modelMesh.scale)

      setModelMesh(newMesh)

      // Atualiza contagens/dimensões exibidas
      if (modelInfo) {
        const bb = newGeo.boundingBox
        const posCount = newGeo.getAttribute('position').count
        setModelInfo({
          ...modelInfo,
          vertices: posCount,
          faces: Math.floor(posCount / 3),
          width:  bb ? bb.max.x - bb.min.x : modelInfo.width,
          height: bb ? bb.max.y - bb.min.y : modelInfo.height,
          depth:  bb ? bb.max.z - bb.min.z : modelInfo.depth,
        })
      }

      clearSelection()
      setStatus('loaded', `Parte removida — ${removedCount.toLocaleString()} triângulos apagados`)
    }, 100)
  }

  // Separar → mantém a parte como uma peça vermelha à parte (não some).
  const handleSeparate = () => {
    if (!modelMesh) return
    pushHistory()
    setStatus('cutting', 'Separando peça...')

    setTimeout(() => {
      const geo = modelMesh.geometry as THREE.BufferGeometry
      const subGeo = extractSubMesh(geo, selectedFaceIndices)

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#ff6600'),
        roughness: 0.5,
        metalness: 0.15,
        side: THREE.DoubleSide,
        flatShading: false,
      })

      const cutMesh = new THREE.Mesh(subGeo, mat)
      cutMesh.castShadow = true
      cutMesh.receiveShadow = true
      cutMesh.position.x += 0.5 // Offset visual para separar

      const partId = `cut-${Date.now()}`
      addCutPart({
        id: partId,
        name: `Parte ${cutParts.length + 1}`,
        mesh: cutMesh,
        faceIndices: Array.from(selectedFaceIndices),
        color: '#ff6600',
      })

      clearSelection()
      setStatus('loaded', `Peça separada com sucesso — ${selectedFaceIndices.size.toLocaleString()} triângulos`)
    }, 100)
  }

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 animate-fade-in pointer-events-auto">
      <div
        className="flex items-center gap-2 p-2 rounded-xl border"
        style={{
          background: 'oklch(0.10 0 0 / 95%)',
          backdropFilter: 'blur(16px)',
          borderColor: 'oklch(0.22 0 0)',
          boxShadow: '0 8px 32px oklch(0 0 0 / 60%)',
        }}
      >
        {/* Botão Cortar — remove a parte (some) */}
        <CutActionBtn
          icon={<Scissors className="w-4 h-4" />}
          label="Cortar"
          variant="primary"
          onClick={handleCut}
          title="Remove a parte selecionada do modelo (ela desaparece)"
        />

        {/* Botão Separar — mantém a parte como peça à parte */}
        <CutActionBtn
          icon={<GitBranch className="w-4 h-4" />}
          label="Separar"
          variant="secondary"
          onClick={handleSeparate}
          title="Separa a parte como uma peça vermelha (não some)"
        />

        {/* Divisor */}
        <div className="w-px h-8 bg-border mx-1" />

        {/* Botão Cancelar */}
        <CutActionBtn
          icon={<X className="w-4 h-4" />}
          label="Cancelar"
          variant="ghost"
          onClick={clearSelection}
        />
      </div>
    </div>
  )
}

interface CutActionBtnProps {
  icon: React.ReactNode
  label: string
  variant: 'primary' | 'secondary' | 'ghost'
  onClick: () => void
  title?: string
}

function CutActionBtn({ icon, label, variant, onClick, title }: CutActionBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all duration-150',
        variant === 'primary' && 'text-background hover:opacity-90 selection-glow',
        variant === 'secondary' && 'border border-border text-foreground hover:bg-secondary',
        variant === 'ghost' && 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
      )}
      style={
        variant === 'primary'
          ? { background: 'oklch(0.70 0.22 42)' }
          : undefined
      }
    >
      {icon}
      {label}
    </button>
  )
}
