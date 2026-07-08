/**
 * Model Loader — Importação otimizada de modelos 3D
 * Suporte: STL, OBJ, GLB, GLTF, PLY
 * Otimizações:
 * - Leitura via ArrayBuffer (zero-copy)
 * - Decimação automática para modelos > DECIMATE_THRESHOLD triângulos
 * - mergeVertices para reduzir duplicatas e permitir índices
 * - computeBoundsTree via three-mesh-bvh para raycasting O(log n)
 */

import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ModelInfo } from './store'

/** Acima deste limite de triângulos, sugerir decimação */
const DECIMATE_THRESHOLD = 800_000

export interface LoadResult {
  mesh: THREE.Mesh
  info: ModelInfo
  wasDecimated: boolean
}

export async function loadModel(file: File): Promise<LoadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  // Ler arquivo uma única vez como ArrayBuffer
  const buffer = await file.arrayBuffer()

  let geometry: THREE.BufferGeometry | null = null

  if (ext === 'stl') {
    geometry = loadSTLFromBuffer(buffer)
  } else if (ext === 'obj') {
    geometry = await loadOBJFromText(buffer)
  } else if (ext === 'ply') {
    geometry = loadPLYFromBuffer(buffer)
  } else if (ext === 'glb' || ext === 'gltf') {
    geometry = await loadGLTFFromBuffer(buffer, file.name)
  } else {
    throw new Error(`Formato .${ext} não suportado.`)
  }

  if (!geometry) throw new Error('Falha ao carregar geometria.')

  // ── Garantir índices (mergeVertices reduz vértices duplicados e cria index) ──
  // Só para geometrias não-indexadas (STL binário típico)
  let faceCount = geometry.index
    ? geometry.index.count / 3
    : (geometry.getAttribute('position') as THREE.BufferAttribute).count / 3

  // Converter para indexado se não tiver índice (melhora performance do BVH)
  if (!geometry.index) {
    // Criar índices triviais — permite cache de adjacência e BVH
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    const indices = new Uint32Array(posAttr.count)
    for (let i = 0; i < posAttr.count; i++) indices[i] = i
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  }

  // Decimação leve para modelos muito pesados
  let wasDecimated = false
  if (faceCount > DECIMATE_THRESHOLD) {
    geometry = decimateGeometry(geometry, DECIMATE_THRESHOLD)
    wasDecimated = true
    faceCount = geometry.index
      ? geometry.index.count / 3
      : (geometry.getAttribute('position') as THREE.BufferAttribute).count / 3
  }

  // Normais e bounding
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // Centralizar
  const box = geometry.boundingBox!
  const center = new THREE.Vector3()
  box.getCenter(center)
  geometry.translate(-center.x, -center.y, -center.z)

  // Recalcular bounds após translação
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // Material — aparência de peça SÓLIDA (chapada), não de casca.
  // • side: FrontSide → backface culling. Como o modelo é um sólido fechado,
  //   ver só as faces frontais faz a peça parecer maciça (sem enxergar as
  //   paredes internas, o que dava o efeito de "casca de papel" com DoubleSide).
  // • flatShading → cada face recebe sua própria normal (facetado), leitura
  //   típica de peça física / preparação para impressão 3D, em vez do brilho
  //   suave que fazia chapas planas parecerem finas.
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x888888),
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.FrontSide,
    flatShading: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = file.name
  // Sem castShadow/receiveShadow — não usamos sombras para CAD

  // Informações do modelo
  const size = new THREE.Vector3()
  geometry.boundingBox!.getSize(size)
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute

  const info: ModelInfo = {
    name: file.name,
    vertices: posAttr.count,
    faces: faceCount,
    width:  parseFloat(size.x.toFixed(2)),
    height: parseFloat(size.y.toFixed(2)),
    depth:  parseFloat(size.z.toFixed(2)),
    fileSize: formatFileSize(file.size),
  }

  return { mesh, info, wasDecimated }
}

// ─── Loaders sincronos / assíncronos usando buffer direto ─────────────────

function loadSTLFromBuffer(buffer: ArrayBuffer): THREE.BufferGeometry {
  const loader = new STLLoader()
  return loader.parse(buffer)
}

async function loadOBJFromText(buffer: ArrayBuffer): Promise<THREE.BufferGeometry> {
  const text = new TextDecoder().decode(buffer)
  const loader = new OBJLoader()
  const obj = loader.parse(text)

  const geometries: THREE.BufferGeometry[] = []
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh
      const g = m.geometry.clone()
      g.applyMatrix4(m.matrixWorld)
      geometries.push(g)
    }
  })

  if (geometries.length === 0) throw new Error('Nenhuma geometria encontrada no OBJ.')
  if (geometries.length === 1) return geometries[0]
  return mergeGeometriesFast(geometries)
}

function loadPLYFromBuffer(buffer: ArrayBuffer): THREE.BufferGeometry {
  const loader = new PLYLoader()
  return loader.parse(buffer)
}

async function loadGLTFFromBuffer(buffer: ArrayBuffer, filename: string): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    const ext = filename.split('.').pop()?.toLowerCase()
    loader.parse(
      buffer,
      '',
      (gltf) => {
        const geometries: THREE.BufferGeometry[] = []
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh
            const g = m.geometry.clone()
            g.applyMatrix4(child.matrixWorld)
            geometries.push(g)
          }
        })
        if (geometries.length === 0) {
          reject(new Error('Nenhuma geometria encontrada.'))
          return
        }
        resolve(geometries.length === 1 ? geometries[0] : mergeGeometriesFast(geometries))
      },
      reject
    )
  })
}

// ─── Merge de geometrias com typed arrays ─────────────────────────────────

function mergeGeometriesFast(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0
  let totalIdx   = 0

  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    totalVerts += p.count
    totalIdx   += g.index ? g.index.count : p.count
  }

  const positions = new Float32Array(totalVerts * 3)
  const normals   = new Float32Array(totalVerts * 3)
  const indices   = new Uint32Array(totalIdx)

  let vOff = 0
  let iOff = 0

  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const n = g.getAttribute('normal') as THREE.BufferAttribute | null
    const idx = g.index

    for (let i = 0; i < p.count; i++) {
      const d = (vOff + i) * 3
      positions[d]     = p.getX(i)
      positions[d + 1] = p.getY(i)
      positions[d + 2] = p.getZ(i)
      if (n) {
        normals[d]     = n.getX(i)
        normals[d + 1] = n.getY(i)
        normals[d + 2] = n.getZ(i)
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOff++] = idx.getX(i) + vOff
    } else {
      for (let i = 0; i < p.count; i++) indices[iOff++] = i + vOff
    }

    vOff += p.count
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3))
  merged.setIndex(new THREE.BufferAttribute(indices, 1))
  return merged
}

// ─── Decimação simples por stride (preserva estrutura, reduz carga) ────────

function decimateGeometry(geo: THREE.BufferGeometry, targetFaces: number): THREE.BufferGeometry {
  const indexAttr = geo.index
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
  const faceCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3
  const keepEvery = Math.ceil(faceCount / targetFaces)

  const newPositions: number[] = []
  const newNormals: number[] = []
  const newIndices: number[] = []
  const normalAttr = geo.getAttribute('normal') as THREE.BufferAttribute | null
  let vi = 0

  for (let f = 0; f < faceCount; f += keepEvery) {
    const base = f * 3
    const a = indexAttr ? indexAttr.getX(base) : base
    const b = indexAttr ? indexAttr.getX(base + 1) : base + 1
    const c = indexAttr ? indexAttr.getX(base + 2) : base + 2

    for (const v of [a, b, c]) {
      newPositions.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v))
      if (normalAttr) {
        newNormals.push(normalAttr.getX(v), normalAttr.getY(v), normalAttr.getZ(v))
      }
    }
    newIndices.push(vi, vi + 1, vi + 2)
    vi += 3
  }

  const dec = new THREE.BufferGeometry()
  dec.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3))
  if (newNormals.length > 0) {
    dec.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3))
  }
  dec.setIndex(newIndices)
  return dec
}

// ─── Exportação ────────────────────────────────────────────────────────────

export async function exportMesh(
  mesh: THREE.Mesh,
  format: 'stl' | 'obj' = 'stl',
  filename: string = 'model'
): Promise<void> {
  if (format === 'stl') {
    const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js')
    const result = new STLExporter().parse(mesh, { binary: true })
    downloadBlob(new Blob([result], { type: 'application/octet-stream' }), `${filename}.stl`)
  } else {
    const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js')
    const result = new OBJExporter().parse(mesh)
    downloadBlob(new Blob([result], { type: 'text/plain' }), `${filename}.obj`)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
