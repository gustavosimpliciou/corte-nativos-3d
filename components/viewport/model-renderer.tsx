"use client"

import { useRef, useEffect, useMemo } from 'react'
import { invalidate } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore, type CutPart } from '@/lib/store'
import { ensureColorAttribute } from '@/lib/smart-cut'
import { planeFromAxisOffset } from '@/lib/solid-plane-cut'

export function ModelRenderer() {
  const { modelMesh, cutParts } = useAppStore()
  if (!modelMesh) return null

  return (
    <group>
      <ModelMesh mesh={modelMesh} />
      {cutParts.map((part) => (
        <CutPartMesh key={part.id} part={part} />
      ))}
      <PlaneCutPreview mesh={modelMesh} />
    </group>
  )
}

/** Plano de corte translúcido — visível apenas com a ferramenta "Corte" ativa. */
function PlaneCutPreview({ mesh }: { mesh: THREE.Mesh }) {
  const activeTool = useAppStore((s) => s.activeTool)
  const axis = useAppStore((s) => s.cutPlaneAxis)
  const offset = useAppStore((s) => s.cutPlaneOffset)
  const flip = useAppStore((s) => s.cutPlaneFlip)

  const data = useMemo(() => {
    const geo = mesh.geometry as THREE.BufferGeometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    const bbox = geo.boundingBox!
    const size = new THREE.Vector3()
    bbox.getSize(size)
    const { normal, point } = planeFromAxisOffset(bbox, axis, offset, flip)
    // Tamanho do quad um pouco maior que o modelo.
    const diag = Math.max(size.x, size.y, size.z) * 1.35 || 1
    // Quaternion que alinha +Z (normal do PlaneGeometry) à normal do corte.
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    return { point, quat, diag }
  }, [mesh, axis, offset, flip])

  useEffect(() => { invalidate() }, [data, activeTool])

  if (activeTool !== 'cut') return null

  return (
    <group position={data.point.toArray()} quaternion={data.quat.toArray() as [number, number, number, number]}>
      <mesh renderOrder={999}>
        <planeGeometry args={[data.diag, data.diag]} />
        <meshBasicMaterial
          color="#ff6600"
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments renderOrder={1000}>
        <edgesGeometry args={[new THREE.PlaneGeometry(data.diag, data.diag)]} />
        <lineBasicMaterial color="#ff6600" transparent opacity={0.7} depthTest={false} />
      </lineSegments>
    </group>
  )
}

/** Renderiza uma peça cortada e realça (emissive) quando está ativa/selecionada. */
function CutPartMesh({ part }: { part: CutPart }) {
  const activeCutPartId = useAppStore((s) => s.activeCutPartId)
  const isActive = activeCutPartId === part.id

  useEffect(() => {
    const mat = part.mesh.material as THREE.MeshStandardMaterial
    if (isActive) {
      mat.emissive = new THREE.Color(0xff6600)
      mat.emissiveIntensity = 0.55
    } else {
      mat.emissiveIntensity = 0
    }
    mat.needsUpdate = true
    invalidate()
  }, [isActive, part])

  return <primitive object={part.mesh} />
}

function ModelMesh({ mesh }: { mesh: THREE.Mesh }) {
  const { showWireframe } = useAppStore()
  const wireEdgesRef = useRef<THREE.EdgesGeometry | null>(null)
  const wireLineRef  = useRef<THREE.LineSegments | null>(null)
  const groupRef     = useRef<THREE.Group>(null)
  const prevWireRef  = useRef(false)

  // Garantir atributo de cor ao montar
  useEffect(() => {
    const mat = mesh.material as THREE.MeshStandardMaterial
    ensureColorAttribute(mesh.geometry, mat)
  }, [mesh])

  // Wireframe
  useEffect(() => {
    if (showWireframe === prevWireRef.current) return
    prevWireRef.current = showWireframe
    if (!groupRef.current) return
    if (showWireframe) {
      if (!wireEdgesRef.current) {
        wireEdgesRef.current = new THREE.EdgesGeometry(mesh.geometry, 15)
      }
      const mat = new THREE.LineBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.18,
      })
      wireLineRef.current = new THREE.LineSegments(wireEdgesRef.current, mat)
      groupRef.current.add(wireLineRef.current)
    } else {
      if (wireLineRef.current) {
        groupRef.current.remove(wireLineRef.current)
        wireLineRef.current.geometry.dispose();
        (wireLineRef.current.material as THREE.Material).dispose()
        wireLineRef.current = null
      }
    }
  }, [showWireframe, mesh])

  useEffect(() => {
    return () => {
      wireEdgesRef.current?.dispose()
      if (wireLineRef.current) {
        (wireLineRef.current.material as THREE.Material).dispose()
      }
    }
  }, [])

  return (
    <group ref={groupRef}>
      <primitive object={mesh} />
    </group>
  )
}
