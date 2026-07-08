/**
 * SmartCut — Segmentação por Curvatura Acumulada (Dijkstra Budget)
 *
 * Problema dos algoritmos BFS simples: param em cada aresta afiada,
 * quebrando a seleção no meio de uma peça orgânica.
 *
 * Solução: Dijkstra com "budget" de curvatura total.
 * - Cada aresta tem custo = ângulo diedro entre as normais das faces.
 * - O algoritmo expande faces em ordem de custo acumulado.
 * - Quando o custo acumulado de uma face ultrapassa o budget, ela é bloqueada.
 * - Isso fecha peças inteiras (óculos, cabelo) mesmo com bordas suaves.
 *
 * Para modelos STL binários (não-indexados), a adjacência é construída
 * via hash de posição (quantização 1e4) — resolve o problema de vértices
 * duplicados com posições iguais.
 */

import * as THREE from 'three'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type SelectionMode = 'island' | 'curvature'

export interface SmartCutOptions {
  /** Budget total de curvatura em graus. Menor = mais restrito. Padrão: 30 */
  sharpAngle: number
  maxFaces: number
  /**
   * 'island'   → seleciona a peça inteira (componente conexo) clicada.
   *              Ideal para modelos com partes separadas (cabelo, óculos, roupa).
   * 'curvature'→ expande por budget de curvatura, sem sair da peça clicada.
   */
  mode: SelectionMode
}

export const DEFAULT_OPTIONS: SmartCutOptions = {
  sharpAngle: 30,
  maxFaces: 2_000_000,
  mode: 'island',
}

// ─── Cache de adjacência ──────────────────────────────────────────────────────
interface GeomCache {
  /** adjList[f] = índices das faces vizinhas */
  adjList: Int32Array[]
  /** edgeCost[f][i] = custo em graus de atravessar a aresta para adjList[f][i] */
  edgeCost: Float32Array[]
  faceNormals: Float32Array
  faceCount: number
  /** compLabel[f] = id da ilha (componente conexo) a que a face pertence */
  compLabel: Int32Array
  /** compSize[label] = número de faces na ilha */
  compSize: Int32Array
  /** número total de ilhas */
  compCount: number
  built: boolean
}

const geomCache = new WeakMap<THREE.BufferGeometry, GeomCache>()

export function invalidateAdjacencyCache(geo: THREE.BufferGeometry): void {
  geomCache.delete(geo)
}

// ─── Construção do grafo de adjacência por posição ────────────────────────────
export function buildAdjacencyCache(
  geometry: THREE.BufferGeometry,
  _sharpAngle = 30 // mantido para compatibilidade mas não usado aqui
): void {
  if (geomCache.get(geometry)?.built) return

  const posAttr  = geometry.getAttribute('position') as THREE.BufferAttribute
  const idxAttr  = geometry.index
  const pos      = posAttr.array as Float32Array
  const faceCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3

  // ── Normais por face ──────────────────────────────────────────────────────
  const faceNormals = new Float32Array(faceCount * 3)
  for (let f = 0; f < faceCount; f++) {
    const b3 = f * 3
    const ai = idxAttr ? idxAttr.getX(b3)     : b3
    const bi = idxAttr ? idxAttr.getX(b3 + 1) : b3 + 1
    const ci = idxAttr ? idxAttr.getX(b3 + 2) : b3 + 2

    const ax = pos[ai*3], ay = pos[ai*3+1], az = pos[ai*3+2]
    const bx = pos[bi*3], by = pos[bi*3+1], bz = pos[bi*3+2]
    const cx = pos[ci*3], cy = pos[ci*3+1], cz = pos[ci*3+2]

    let nx = (by-ay)*(cz-az) - (bz-az)*(cy-ay)
    let ny = (bz-az)*(cx-ax) - (bx-ax)*(cz-az)
    let nz = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax)
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
    if (len > 1e-10) { nx/=len; ny/=len; nz/=len }
    faceNormals[f*3] = nx; faceNormals[f*3+1] = ny; faceNormals[f*3+2] = nz
  }

  // ── Hash de posição para fundir vértices duplicados (STL binário) ─────────
  const Q = 1e4
  const posKey = (vi: number) => {
    const x = Math.round(pos[vi*3]   * Q)
    const y = Math.round(pos[vi*3+1] * Q)
    const z = Math.round(pos[vi*3+2] * Q)
    return `${x},${y},${z}`
  }

  const posToUID = new Map<string, number>()
  const faceVerts = new Int32Array(faceCount * 3)

  for (let f = 0; f < faceCount; f++) {
    for (let c = 0; c < 3; c++) {
      const raw = idxAttr ? idxAttr.getX(f*3+c) : f*3+c
      const key = posKey(raw)
      let uid = posToUID.get(key)
      if (uid === undefined) { uid = posToUID.size; posToUID.set(key, uid) }
      faceVerts[f*3+c] = uid
    }
  }

  // ── vertFaces: lista invertida uid→[faces] ────────────────────────────────
  const uniq = posToUID.size
  const vfCnt = new Int32Array(uniq)
  for (let i = 0; i < faceCount*3; i++) vfCnt[faceVerts[i]]++
  const vfOff = new Int32Array(uniq+1)
  for (let v = 0; v < uniq; v++) vfOff[v+1] = vfOff[v] + vfCnt[v]
  const vfList = new Int32Array(vfOff[uniq])
  const vfPtr  = new Int32Array(uniq)
  for (let f = 0; f < faceCount; f++) {
    for (let c = 0; c < 3; c++) {
      const v = faceVerts[f*3+c]
      vfList[vfOff[v] + vfPtr[v]++] = f
    }
  }

  // ── Construir adjList e edgeCost ──────────────────────────────────────────
  const adjList:  Int32Array[]   = new Array(faceCount)
  const edgeCost: Float32Array[] = new Array(faceCount)
  const tmp = new Int32Array(512)
  const RAD2DEG = 180 / Math.PI

  for (let f = 0; f < faceCount; f++) {
    let cnt = 0
    for (let c = 0; c < 3; c++) {
      const v = faceVerts[f*3+c]
      for (let j = vfOff[v]; j < vfOff[v+1]; j++) {
        const nb = vfList[j]
        if (nb === f) continue
        let dup = false
        for (let k = 0; k < cnt; k++) if (tmp[k] === nb) { dup = true; break }
        if (!dup && cnt < tmp.length) tmp[cnt++] = nb
      }
    }

    adjList[f]  = new Int32Array(cnt)
    edgeCost[f] = new Float32Array(cnt)

    const fnx = faceNormals[f*3], fny = faceNormals[f*3+1], fnz = faceNormals[f*3+2]

    for (let k = 0; k < cnt; k++) {
      const nb  = tmp[k]
      adjList[f][k] = nb
      const dot = Math.max(-1, Math.min(1,
        fnx*faceNormals[nb*3] + fny*faceNormals[nb*3+1] + fnz*faceNormals[nb*3+2]
      ))
      // custo = ângulo em graus entre as normais (0=plano, 180=opostas)
      edgeCost[f][k] = Math.acos(dot) * RAD2DEG
    }
  }

  // ── Rotular ilhas (componentes conexos) via BFS ───────────────────────────
  // Duas faces estão na mesma ilha se compartilham posição (vértice soldado),
  // independente da curvatura. Isso identifica peças fisicamente separadas
  // como cabelo, óculos e roupa em modelos exportados/mesclados.
  const compLabel = new Int32Array(faceCount).fill(-1)
  const compSizeArr: number[] = []
  const stack = new Int32Array(faceCount)
  let compCount = 0

  for (let start = 0; start < faceCount; start++) {
    if (compLabel[start] !== -1) continue
    const label = compCount++
    let size = 0
    let sp = 0
    stack[sp++] = start
    compLabel[start] = label
    while (sp > 0) {
      const f = stack[--sp]
      size++
      const adj = adjList[f]
      for (let i = 0; i < adj.length; i++) {
        const nb = adj[i]
        if (compLabel[nb] === -1) {
          compLabel[nb] = label
          stack[sp++] = nb
        }
      }
    }
    compSizeArr.push(size)
  }

  const compSize = Int32Array.from(compSizeArr)

  geomCache.set(geometry, {
    adjList, edgeCost, faceNormals, faceCount,
    compLabel, compSize, compCount, built: true,
  })
}

// ─── Dijkstra com budget de curvatura ────────────────────────────────────────
/**
 * Expande a seleção a partir de clickedFaceIndex usando custo acumulado.
 * Faces com custo acumulado <= budget são incluídas.
 * Isso fecha peças inteiras mesmo com bordas suaves.
 */
export function smartSelect(
  geometry: THREE.BufferGeometry,
  clickedFaceIndex: number,
  options: Partial<SmartCutOptions> = {}
): Set<number> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  buildAdjacencyCache(geometry, opts.sharpAngle)
  const cache = geomCache.get(geometry)!
  const { adjList, edgeCost, faceCount, compLabel, compCount } = cache

  if (clickedFaceIndex < 0 || clickedFaceIndex >= faceCount) return new Set()

  const clickedIsland = compLabel[clickedFaceIndex]

  // ── Modo ILHA: seleciona a peça inteira (componente conexo) ────────────────
  // Se o modelo tem partes separadas, isto captura exatamente a peça clicada
  // (só o cabelo, só os óculos, só a roupa) sem vazar para nada mais.
  // Fallback: se o modelo é uma única malha soldada (1 ilha), não faz sentido
  // "selecionar tudo", então caímos no modo curvatura automaticamente.
  if (opts.mode === 'island' && compCount > 1) {
    const selected = new Set<number>()
    for (let f = 0; f < faceCount; f++) {
      if (compLabel[f] === clickedIsland) selected.add(f)
    }
    return selected
  }

  // ── Modo CURVATURA: Dijkstra com budget, restrito à ilha clicada ───────────
  // Nunca cruza a fronteira para outra peça (compLabel diferente), evitando
  // vazamento entre partes fisicamente separadas.
  const budget = opts.sharpAngle       // budget = o sharpAngle (graus acumulados)
  const INF    = 1e9

  const dist    = new Float32Array(faceCount).fill(INF)
  const visited = new Uint8Array(faceCount)
  dist[clickedFaceIndex] = 0

  // Heap binário mínimo: [dist, faceIdx]
  const heap: number[] = [0, clickedFaceIndex]

  const selected = new Set<number>()
  selected.add(clickedFaceIndex)

  while (heap.length > 0 && selected.size < opts.maxFaces) {
    // pop min
    const cost = heap.shift()!
    const f    = heap.shift()!

    if (visited[f]) continue
    visited[f] = 1

    const adj  = adjList[f]
    const cost_ = edgeCost[f]

    for (let i = 0; i < adj.length; i++) {
      const nb = adj[i]
      if (visited[nb]) continue
      // Não sai da peça clicada
      if (compLabel[nb] !== clickedIsland) continue

      // custo acumulado = custo até f + custo da aresta f→nb
      const newCost = cost + cost_[i]
      if (newCost <= budget && newCost < dist[nb]) {
        dist[nb] = newCost
        selected.add(nb)
        // inserir no heap mantendo ordem (inserção simples — suficiente para < 1M faces)
        heapPush(heap, newCost, nb)
      }
    }
  }

  return selected
}

// MinHeap helper (inserção ordenada compacta)
function heapPush(heap: number[], cost: number, face: number): void {
  let lo = 0, hi = heap.length / 2
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (heap[mid * 2] <= cost) lo = mid + 1
    else hi = mid
  }
  heap.splice(lo * 2, 0, cost, face)
}

// ─── Centróides de face (cache) ───────────────────────────────────────────────
// Usado pela borracha para testar quais faces caem dentro do raio do pincel.
const centroidCache = new WeakMap<THREE.BufferGeometry, Float32Array>()

export function getFaceCentroids(geometry: THREE.BufferGeometry): Float32Array {
  const cached = centroidCache.get(geometry)
  if (cached) return cached

  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const idx = geometry.index
  const faceCount = idx ? idx.count / 3 : pos.count / 3
  const centroids = new Float32Array(faceCount * 3)

  for (let f = 0; f < faceCount; f++) {
    const a = idx ? idx.getX(f * 3)     : f * 3
    const b = idx ? idx.getX(f * 3 + 1) : f * 3 + 1
    const c = idx ? idx.getX(f * 3 + 2) : f * 3 + 2
    centroids[f * 3]     = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3
    centroids[f * 3 + 1] = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3
    centroids[f * 3 + 2] = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
  }

  centroidCache.set(geometry, centroids)
  return centroids
}

// ─── Pintura de vertex colors ─────────────────────────────────────────────────
const C_SELECTED  : [number, number, number] = [1.00, 0.38, 0.00]  // laranja vivo
const C_HOVER     : [number, number, number] = [1.00, 0.65, 0.10]  // laranja hover
const C_HOVER_SUB : [number, number, number] = [0.20, 0.50, 1.00]  // azul subtract
const C_BASE      : [number, number, number] = [0.50, 0.50, 0.52]  // cinza neutro
const C_DIMMED    : [number, number, number] = [0.10, 0.10, 0.11]  // quase preto

export function ensureColorAttribute(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial
): THREE.BufferAttribute {
  material.color.set(0xffffff)
  material.vertexColors = true
  material.needsUpdate  = true

  let attr = geometry.getAttribute('color') as THREE.BufferAttribute | null
  if (attr) return attr

  const vertCount = (geometry.getAttribute('position') as THREE.BufferAttribute).count
  const colors    = new Float32Array(vertCount * 3)
  for (let i = 0; i < vertCount; i++) {
    colors[i*3] = C_BASE[0]; colors[i*3+1] = C_BASE[1]; colors[i*3+2] = C_BASE[2]
  }

  attr = new THREE.BufferAttribute(colors, 3)
  attr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('color', attr)
  return attr
}

function vertexOf(geometry: THREE.BufferGeometry, face: number, corner: number): number {
  const idx  = geometry.index
  const base = face * 3 + corner
  return idx ? idx.getX(base) : base
}

export function paintFaces(
  geometry: THREE.BufferGeometry,
  colorAttr: THREE.BufferAttribute,
  selected: Set<number>,
  hovered: Set<number>,
  mode: 'new' | 'add' | 'subtract'
): void {
  const posAttr   = geometry.getAttribute('position') as THREE.BufferAttribute
  const idxAttr   = geometry.index
  const faceCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3
  const colors    = colorAttr.array as Float32Array
  const hasSel    = selected.size > 0

  for (let f = 0; f < faceCount; f++) {
    const isSel = selected.has(f)
    const isHov = hovered.has(f)

    let col: [number, number, number]
    if (isSel && isHov && mode === 'subtract') col = C_HOVER_SUB
    else if (isSel)       col = C_SELECTED
    else if (isHov)       col = mode === 'subtract' ? C_BASE : C_HOVER
    else if (hasSel)      col = C_DIMMED
    else                  col = C_BASE

    for (let c = 0; c < 3; c++) {
      const vi = vertexOf(geometry, f, c)
      colors[vi*3] = col[0]; colors[vi*3+1] = col[1]; colors[vi*3+2] = col[2]
    }
  }
  colorAttr.needsUpdate = true
}

export function paintFacesDelta(
  geometry: THREE.BufferGeometry,
  colorAttr: THREE.BufferAttribute,
  prevSelected: Set<number>,
  nextSelected: Set<number>,
  mode: 'new' | 'add' | 'subtract'
): void {
  const colors  = colorAttr.array as Float32Array
  const hasNext = nextSelected.size > 0
  const hadPrev = prevSelected.size > 0

  const changed = new Set<number>()
  for (const f of prevSelected) if (!nextSelected.has(f)) changed.add(f)
  for (const f of nextSelected) if (!prevSelected.has(f)) changed.add(f)

  const paint = (f: number, col: [number, number, number]) => {
    for (let c = 0; c < 3; c++) {
      const vi = vertexOf(geometry, f, c)
      colors[vi*3] = col[0]; colors[vi*3+1] = col[1]; colors[vi*3+2] = col[2]
    }
  }

  for (const f of changed) {
    paint(f, nextSelected.has(f) ? C_SELECTED : hasNext ? C_DIMMED : C_BASE)
  }

  if (hadPrev !== hasNext) {
    const posAttr   = geometry.getAttribute('position') as THREE.BufferAttribute
    const idxAttr   = geometry.index
    const faceCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3
    for (let f = 0; f < faceCount; f++) {
      if (changed.has(f)) continue
      paint(f, nextSelected.has(f) ? C_SELECTED : hasNext ? C_DIMMED : C_BASE)
    }
  }

  colorAttr.needsUpdate = true
}

export function paintHoverDelta(
  geometry: THREE.BufferGeometry,
  colorAttr: THREE.BufferAttribute,
  selected: Set<number>,
  prevHover: Set<number>,
  nextHover: Set<number>,
  mode: 'new' | 'add' | 'subtract'
): void {
  const colors  = colorAttr.array as Float32Array
  const hasSel  = selected.size > 0

  const paint = (f: number, col: [number, number, number]) => {
    for (let c = 0; c < 3; c++) {
      const vi = vertexOf(geometry, f, c)
      colors[vi*3] = col[0]; colors[vi*3+1] = col[1]; colors[vi*3+2] = col[2]
    }
  }

  for (const f of prevHover) {
    if (nextHover.has(f)) continue
    paint(f, selected.has(f) ? C_SELECTED : hasSel ? C_DIMMED : C_BASE)
  }

  for (const f of nextHover) {
    if (prevHover.has(f)) continue
    if (selected.has(f) && mode !== 'subtract') continue // já laranja
    let col: [number, number, number]
    if (selected.has(f) && mode === 'subtract') col = C_HOVER_SUB
    else col = mode === 'subtract' ? C_BASE : C_HOVER
    paint(f, col)
  }

  colorAttr.needsUpdate = true
}

// ─── Normais suaves por POSIÇÃO (superfície lisa, sem facetas) ─────────────────
/**
 * Recalcula as normais suavizando por posição do vértice.
 *
 * Modelos STL/OBJ costumam ter vértices duplicados (um por triângulo). Com
 * `computeVertexNormals` cada face fica com sua própria normal → aparência
 * facetada (todos os triângulos visíveis, parecendo "só a malha").
 *
 * Aqui somamos as normais de todas as faces que compartilham a MESMA posição
 * e atribuímos a média a cada vértice. Resultado: superfície lisa, mantendo os
 * vértices independentes que o sistema de pintura por face precisa.
 */
export function computeSmoothNormalsByPosition(geometry: THREE.BufferGeometry): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const idxAttr = geometry.index
  const vertCount = posAttr.count
  const faceCount = idxAttr ? idxAttr.count / 3 : vertCount / 3

  const Q = 1e4
  const key = (v: number) =>
    `${Math.round(posAttr.getX(v) * Q)},${Math.round(posAttr.getY(v) * Q)},${Math.round(posAttr.getZ(v) * Q)}`

  // Acumula a normal (ponderada por área) por posição
  const accum = new Map<string, [number, number, number]>()

  for (let f = 0; f < faceCount; f++) {
    const a = idxAttr ? idxAttr.getX(f * 3)     : f * 3
    const b = idxAttr ? idxAttr.getX(f * 3 + 1) : f * 3 + 1
    const c = idxAttr ? idxAttr.getX(f * 3 + 2) : f * 3 + 2

    const ax = posAttr.getX(a), ay = posAttr.getY(a), az = posAttr.getZ(a)
    const bx = posAttr.getX(b), by = posAttr.getY(b), bz = posAttr.getZ(b)
    const cx = posAttr.getX(c), cy = posAttr.getY(c), cz = posAttr.getZ(c)

    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    for (const v of [a, b, c]) {
      const k = key(v)
      const cur = accum.get(k)
      if (cur) { cur[0] += nx; cur[1] += ny; cur[2] += nz }
      else accum.set(k, [nx, ny, nz])
    }
  }

  const normals = new Float32Array(vertCount * 3)
  for (let v = 0; v < vertCount; v++) {
    const n = accum.get(key(v))
    if (n) {
      const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1
      normals[v * 3]     = n[0] / len
      normals[v * 3 + 1] = n[1] / len
      normals[v * 3 + 2] = n[2] / len
    }
  }

  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  ;(geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true
}

// ─── Tampa do corte (preenche a seção → peça maciça) ──────────────────────────
/**
 * Gera triângulos que fecham o contorno aberto de um conjunto de faces.
 *
 * Uma aresta é de borda quando aparece numa só direção dentro do conjunto
 * (o reverso não existe). Ligando essas arestas formamos os laços de contorno
 * do corte, que são triangulados em leque a partir do centróide — preenchendo
 * a seção transversal para a peça parecer maciça.
 *
 * Retorna "sopa de triângulos" (posições + normais, sem índice).
 */
export function buildCap(
  geometry: THREE.BufferGeometry,
  faceSet: Set<number> | number[]
): { pos: Float32Array; nrm: Float32Array } {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const idxAttr = geometry.index
  const faces = Array.isArray(faceSet) ? faceSet : Array.from(faceSet)

  const Q = 1e4
  const key = (v: number) =>
    `${Math.round(posAttr.getX(v) * Q)},${Math.round(posAttr.getY(v) * Q)},${Math.round(posAttr.getZ(v) * Q)}`

  const keyToId = new Map<string, number>()
  const idPos: number[] = []
  const vId = (v: number) => {
    const k = key(v)
    let id = keyToId.get(k)
    if (id === undefined) {
      id = keyToId.size
      keyToId.set(k, id)
      idPos.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v))
    }
    return id
  }

  // Conta arestas direcionadas dentro do conjunto
  const dirEdges = new Set<number>()          // codifica x*BIG + y
  const BIG = 1e7
  const enc = (x: number, y: number) => x * BIG + y

  const facesEnc: Array<[number, number, number]> = []
  for (const f of faces) {
    const a = vId(idxAttr ? idxAttr.getX(f * 3)     : f * 3)
    const b = vId(idxAttr ? idxAttr.getX(f * 3 + 1) : f * 3 + 1)
    const c = vId(idxAttr ? idxAttr.getX(f * 3 + 2) : f * 3 + 2)
    facesEnc.push([a, b, c])
    dirEdges.add(enc(a, b))
    dirEdges.add(enc(b, c))
    dirEdges.add(enc(c, a))
  }

  // Aresta de borda: direção presente cujo reverso não existe.
  // Para a tampa, invertemos a direção (next: y → x).
  const next = new Map<number, number>()
  let boundaryCount = 0
  for (const [a, b, c] of facesEnc) {
    const edges: [number, number][] = [[a, b], [b, c], [c, a]]
    for (const [x, y] of edges) {
      if (!dirEdges.has(enc(y, x))) {
        next.set(y, x)
        boundaryCount++
      }
    }
  }

  if (boundaryCount === 0) return { pos: new Float32Array(0), nrm: new Float32Array(0) }

  // Percorre os laços de contorno e tria­ngula em leque
  const capPos: number[] = []
  const capNrm: number[] = []
  const visited = new Set<number>()

  for (const startVertex of next.keys()) {
    if (visited.has(startVertex)) continue
    const loop: number[] = []
    let cur: number | undefined = startVertex
    let guard = 0
    while (cur !== undefined && !visited.has(cur) && guard++ < boundaryCount + 5) {
      visited.add(cur)
      loop.push(cur)
      cur = next.get(cur)
      if (cur === startVertex) break
    }
    if (loop.length < 3) continue

    // Centróide do laço
    let cx = 0, cy = 0, cz = 0
    for (const id of loop) { cx += idPos[id * 3]; cy += idPos[id * 3 + 1]; cz += idPos[id * 3 + 2] }
    cx /= loop.length; cy /= loop.length; cz /= loop.length

    for (let i = 0; i < loop.length; i++) {
      const id0 = loop[i]
      const id1 = loop[(i + 1) % loop.length]
      const bx = idPos[id0 * 3], by = idPos[id0 * 3 + 1], bz = idPos[id0 * 3 + 2]
      const dx = idPos[id1 * 3], dy = idPos[id1 * 3 + 1], dz = idPos[id1 * 3 + 2]

      let nx = (by - cy) * (dz - cz) - (bz - cz) * (dy - cy)
      let ny = (bz - cz) * (dx - cx) - (bx - cx) * (dz - cz)
      let nz = (bx - cx) * (dy - cy) - (by - cy) * (dx - cx)
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= len; ny /= len; nz /= len

      capPos.push(cx, cy, cz, bx, by, bz, dx, dy, dz)
      capNrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
    }
  }

  return { pos: new Float32Array(capPos), nrm: new Float32Array(capNrm) }
}

// ─── Remoção de faces (a parte cortada "some") ────────────────────────────────
/**
 * Gera uma nova geometria contendo TODAS as faces EXCETO as selecionadas.
 * Usada pelo botão "Cortar": a parte selecionada desaparece do modelo.
 *
 * A seção do corte é fechada com uma tampa (buildCap) para a peça restante
 * ficar maciça em vez de oca.
 */
export function removeSubMesh(
  geometry: THREE.BufferGeometry,
  facesToRemove: Set<number>
): THREE.BufferGeometry {
  const posAttr    = geometry.getAttribute('position') as THREE.BufferAttribute
  const normalAttr = geometry.getAttribute('normal')   as THREE.BufferAttribute | null
  const uvAttr     = geometry.getAttribute('uv')       as THREE.BufferAttribute | null
  const idxAttr    = geometry.index
  const faceCount  = idxAttr ? idxAttr.count / 3 : posAttr.count / 3

  // Faces que permanecem
  const keepFaces: number[] = []
  for (let f = 0; f < faceCount; f++) {
    if (!facesToRemove.has(f)) keepFaces.push(f)
  }

  // Tampa que fecha a seção do corte (contorno aberto das faces mantidas)
  const cap = buildCap(geometry, keepFaces)
  const capVerts = cap.pos.length / 3

  const shellVerts = keepFaces.length * 3
  const vCount     = shellVerts + capVerts
  const newPos     = new Float32Array(vCount * 3)
  const newNormal  = new Float32Array(vCount * 3)
  const newUV      = uvAttr ? new Float32Array(vCount * 2) : null

  let w = 0
  for (const f of keepFaces) {
    for (let c = 0; c < 3; c++) {
      const v = idxAttr ? idxAttr.getX(f * 3 + c) : f * 3 + c
      newPos[w * 3]     = posAttr.getX(v)
      newPos[w * 3 + 1] = posAttr.getY(v)
      newPos[w * 3 + 2] = posAttr.getZ(v)
      if (normalAttr) {
        newNormal[w * 3]     = normalAttr.getX(v)
        newNormal[w * 3 + 1] = normalAttr.getY(v)
        newNormal[w * 3 + 2] = normalAttr.getZ(v)
      }
      if (newUV) {
        newUV[w * 2]     = uvAttr!.getX(v)
        newUV[w * 2 + 1] = uvAttr!.getY(v)
      }
      w++
    }
  }

  // Anexa os vértices da tampa
  if (capVerts > 0) {
    newPos.set(cap.pos, shellVerts * 3)
    newNormal.set(cap.nrm, shellVerts * 3)
    // UV da tampa fica em (0,0) — o array já vem zerado
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormal, 3))
  if (newUV) geo.setAttribute('uv', new THREE.Float32BufferAttribute(newUV, 2))
  if (!normalAttr) geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

// ─── Extração de sub-malha com smoothing de normais ───────────────────────────
/**
 * Extrai as faces selecionadas e reconstrói normais suaves por posição.
 * Elimina o efeito de "triângulos soltos" na exportação.
 *
 * A seção aberta do corte é FECHADA com uma tampa (buildCap), tornando a peça
 * um volume fechado (watertight) → o fatiador a imprime MACIÇA (com preenchimento),
 * e não como uma casca oca. Passe `cap = false` para obter só a casca.
 */
export function extractSubMesh(
  geometry: THREE.BufferGeometry,
  selectedFaces: Set<number>,
  cap = true
): THREE.BufferGeometry {
  const posAttr  = geometry.getAttribute('position') as THREE.BufferAttribute
  const uvAttr   = geometry.getAttribute('uv')       as THREE.BufferAttribute | null
  const idxAttr  = geometry.index
  const faceArr  = Array.from(selectedFaces)
  const maxV     = faceArr.length * 3

  // ── Coletar vértices únicos por posição para soldagem ──────────────────────
  const Q = 1e5
  const posKey = (v: number) => {
    const x = Math.round(posAttr.getX(v) * Q)
    const y = Math.round(posAttr.getY(v) * Q)
    const z = Math.round(posAttr.getZ(v) * Q)
    return `${x},${y},${z}`
  }

  // uid unificado por posição → novo índice
  const uidToNew = new Map<string, number>()
  const newPos: number[] = []
  const newUV:  number[] = []

  const faceRaw: number[] = [] // [a0,b0,c0, a1,b1,c1 ...] raw indices originais

  for (const fi of faceArr) {
    const b3 = fi * 3
    const a  = idxAttr ? idxAttr.getX(b3)   : b3
    const b  = idxAttr ? idxAttr.getX(b3+1) : b3+1
    const c  = idxAttr ? idxAttr.getX(b3+2) : b3+2
    faceRaw.push(a, b, c)
  }

  const rawToNew = new Int32Array(faceRaw.length)
  for (let i = 0; i < faceRaw.length; i++) {
    const v   = faceRaw[i]
    const key = posKey(v)
    let nv    = uidToNew.get(key)
    if (nv === undefined) {
      nv = newPos.length / 3
      uidToNew.set(key, nv)
      newPos.push(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v))
      if (uvAttr) newUV.push(uvAttr.getX(v), uvAttr.getY(v))
    }
    rawToNew[i] = nv
  }

  const vertCount = newPos.length / 3
  const newIdx    = new Uint32Array(faceRaw.length)
  for (let i = 0; i < faceRaw.length; i++) newIdx[i] = rawToNew[i]

  // ── Normais suaves: acumular contribuição de cada face em cada vértice ──────
  const normals = new Float32Array(vertCount * 3) // zero init

  for (let fi = 0; fi < faceArr.length; fi++) {
    const ia = newIdx[fi*3], ib = newIdx[fi*3+1], ic = newIdx[fi*3+2]

    const ax = newPos[ia*3], ay = newPos[ia*3+1], az = newPos[ia*3+2]
    const bx = newPos[ib*3], by = newPos[ib*3+1], bz = newPos[ib*3+2]
    const cx = newPos[ic*3], cy = newPos[ic*3+1], cz = newPos[ic*3+2]

    // Normal da face (não normalizada = peso pela área)
    const nx = (by-ay)*(cz-az) - (bz-az)*(cy-ay)
    const ny = (bz-az)*(cx-ax) - (bx-ax)*(cz-az)
    const nz = (bx-ax)*(cy-ay) - (by-ay)*(cx-ax)

    for (const vi of [ia, ib, ic]) {
      normals[vi*3]   += nx
      normals[vi*3+1] += ny
      normals[vi*3+2] += nz
    }
  }

  // Normalizar
  for (let v = 0; v < vertCount; v++) {
    const len = Math.sqrt(
      normals[v*3]**2 + normals[v*3+1]**2 + normals[v*3+2]**2
    )
    if (len > 1e-10) {
      normals[v*3]   /= len
      normals[v*3+1] /= len
      normals[v*3+2] /= len
    }
  }

  // ── Tampa: fecha a seção do corte → peça MACIÇA (volume fechado) ────────────
  // Sem a tampa, a peça é uma casca aberta e o fatiador não consegue preenchê-la.
  // buildCap gera os triângulos que tapam o(s) contorno(s) aberto(s) da seleção,
  // com orientação autoconsistente para este conjunto de faces.
  const capData = cap
    ? buildCap(geometry, selectedFaces)
    : { pos: new Float32Array(0), nrm: new Float32Array(0) }
  const capVertCount = capData.pos.length / 3

  const shellVertCount = vertCount                    // vértices soldados da casca
  const totalVertCount = shellVertCount + capVertCount

  // Posições: casca soldada + vértices da tampa (sopa de triângulos)
  const finalPos = new Float32Array(totalVertCount * 3)
  finalPos.set(newPos, 0)
  if (capVertCount > 0) finalPos.set(capData.pos, shellVertCount * 3)

  // Normais: casca (suaves) + tampa (planas)
  const finalNrm = new Float32Array(totalVertCount * 3)
  finalNrm.set(normals, 0)
  if (capVertCount > 0) finalNrm.set(capData.nrm, shellVertCount * 3)

  // Índices: casca (indexada) + tampa (índices sequenciais)
  const finalIdx = new Uint32Array(newIdx.length + capVertCount)
  finalIdx.set(newIdx, 0)
  for (let i = 0; i < capVertCount; i++) finalIdx[newIdx.length + i] = shellVertCount + i

  // UV: tampa fica em (0,0) — array já vem zerado
  let finalUV: Float32Array | null = null
  if (uvAttr) {
    finalUV = new Float32Array(totalVertCount * 2)
    finalUV.set(newUV, 0)
  }

  // ── Montar geometria final ─────────────────────────────────────────────────
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(finalPos, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(finalNrm, 3))
  if (finalUV) geo.setAttribute('uv', new THREE.Float32BufferAttribute(finalUV, 2))
  geo.setIndex(new THREE.BufferAttribute(finalIdx, 1))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}
