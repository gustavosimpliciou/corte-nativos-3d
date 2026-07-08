/**
 * Solid Plane Cut — Corte de sólido por plano (watertight manifold)
 * ------------------------------------------------------------------
 * Implementa o pipeline completo descrito na especificação técnica:
 *   1. Calcular a interseção do plano com todos os triângulos.
 *   2. Gerar segmentos de interseção (directed half-edges).
 *   3. Organizar os segmentos em loops fechados (chain following).
 *   4. Triangular o contorno (Ear Clipping via THREE.ShapeUtils).
 *   5. Criar as faces do CAP com winding correto para cada metade.
 *   6. Soldar vértices duplicados (quantized snapping).
 *   7. Recalcular normais.
 *   8. Garantir que a malha seja watertight.
 */

import * as THREE from 'three'

export interface PlaneCutResult {
  positive: THREE.BufferGeometry
  negative: THREE.BufferGeometry
  capLoops: number
  capTriangles: number
}

interface Vtx {
  p: THREE.Vector3
  n: THREE.Vector3
}

export type PlaneAxis = 'x' | 'y' | 'z'

export function planeFromAxisOffset(
  bbox: THREE.Box3,
  axis: PlaneAxis,
  offset: number,
  flip = false,
): { normal: THREE.Vector3; point: THREE.Vector3 } {
  const center = new THREE.Vector3()
  bbox.getCenter(center)
  const normal = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0,
  )
  if (flip) normal.negate()

  const min = bbox.min[axis]
  const max = bbox.max[axis]
  const coord = min + (max - min) * offset

  const point = center.clone()
  point[axis] = coord
  return { normal, point }
}

// ---------------------------------------------------------------------------
// Acumulador de triângulos para cada metade do corte
// ---------------------------------------------------------------------------
class SideBuilder {
  pos: number[] = []
  nrm: number[] = []

  pushTri(a: Vtx, b: Vtx, c: Vtx): void {
    this.pos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z, c.p.x, c.p.y, c.p.z)
    this.nrm.push(a.n.x, a.n.y, a.n.z, b.n.x, b.n.y, b.n.z, c.n.x, c.n.y, c.n.z)
  }

  pushCapTri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    capN: THREE.Vector3,
  ): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    this.nrm.push(
      capN.x, capN.y, capN.z,
      capN.x, capN.y, capN.z,
      capN.x, capN.y, capN.z,
    )
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }
}

function planeBasis(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const a =
    Math.abs(n.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(a, n).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  return { u, v }
}

function lerpVtx(a: Vtx, b: Vtx, t: number): Vtx {
  const p = new THREE.Vector3().lerpVectors(a.p, b.p, t)
  const nm = new THREE.Vector3().lerpVectors(a.n, b.n, t)
  if (nm.lengthSq() > 1e-12) nm.normalize()
  return { p, n: nm }
}

// ---------------------------------------------------------------------------
// Algoritmo principal
// ---------------------------------------------------------------------------
export function solidPlaneCut(
  geometry: THREE.BufferGeometry,
  planeNormal: THREE.Vector3,
  planePoint: THREE.Vector3,
  eps?: number,
): PlaneCutResult {
  const n = planeNormal.clone().normalize()

  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const nrmAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null
  const idxAttr = geometry.index
  const triCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3

  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  const scale = geometry.boundingSphere ? geometry.boundingSphere.radius : 1
  const EPS = eps ?? Math.max(1e-9, scale * 1e-6)

  const positive = new SideBuilder()
  const negative = new SideBuilder()

  // Armazena segmentos de interseção como pares de pontos [ax,ay,az, bx,by,bz]
  // com direção consistente: visto de +n, o material NEGATIVO fica à ESQUERDA.
  const segFlat: number[] = []

  const idxA = idxAttr ? (idxAttr.array as ArrayLike<number>) : null
  const tmpFaceN = new THREE.Vector3()
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()

  const readVtx = (vi: number, faceN: THREE.Vector3): Vtx => {
    const p = new THREE.Vector3(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi))
    let nm: THREE.Vector3
    if (nrmAttr) {
      nm = new THREE.Vector3(nrmAttr.getX(vi), nrmAttr.getY(vi), nrmAttr.getZ(vi))
      if (nm.lengthSq() < 1e-12) nm.copy(faceN)
    } else {
      nm = faceN.clone()
    }
    return { p, n: nm }
  }

  // ---------------------------------------------------------------------------
  // PASSO 1-2: classifica e divide cada triângulo pelo plano
  // ---------------------------------------------------------------------------
  for (let f = 0; f < triCount; f++) {
    const i0 = idxA ? idxA[f * 3]     : f * 3
    const i1 = idxA ? idxA[f * 3 + 1] : f * 3 + 1
    const i2 = idxA ? idxA[f * 3 + 2] : f * 3 + 2

    va.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0))
    vb.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1))
    vc.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2))

    tmpFaceN.crossVectors(vb.clone().sub(va), vc.clone().sub(va))
    if (tmpFaceN.lengthSq() > 1e-20) tmpFaceN.normalize()

    const V: Vtx[] = [
      readVtx(i0, tmpFaceN),
      readVtx(i1, tmpFaceN),
      readVtx(i2, tmpFaceN),
    ]

    const d = [
      V[0].p.clone().sub(planePoint).dot(n),
      V[1].p.clone().sub(planePoint).dot(n),
      V[2].p.clone().sub(planePoint).dot(n),
    ]

    // Classifica: snap vértices muito próximos do plano para cima/baixo
    const side = d.map((di) =>
      di > EPS ? 1 : di < -EPS ? -1 : 0,
    )

    const dMin = Math.min(d[0], d[1], d[2])
    const dMax = Math.max(d[0], d[1], d[2])

    // ── Triângulo inteiramente acima (ou coplanar) → lado positivo ──────────
    if (dMin >= -EPS) {
      positive.pushTri(V[0], V[1], V[2])

      // Aresta coplanar: dois vértices sobre o plano, terceiro acima.
      // Segmento deve ser emitido com o lado NEGATIVO à ESQUERDA visto de +n.
      // Como o winding do triângulo (CCW de +n) tem o positivo à esquerda,
      // a aresta coplanar a→b no sentido CCW deixa o interior positivo à
      // esquerda → inverte para b→a (negativo à esquerda).
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3
        const k = (i + 2) % 3
        if (side[i] === 0 && side[j] === 0 && side[k] >= 0) {
          const a = V[i].p, b = V[j].p
          if (a.distanceToSquared(b) > EPS * EPS) {
            // Inverte: emite b→a
            segFlat.push(b.x, b.y, b.z, a.x, a.y, a.z)
          }
        }
      }
      continue
    }

    // ── Triângulo inteiramente abaixo → lado negativo ──────────────────────
    if (dMax <= EPS) {
      negative.pushTri(V[0], V[1], V[2])

      // Aresta coplanar com terceiro vértice abaixo: emite a→b direto
      // (winding CCW de +n já coloca o negativo à esquerda pois o tri está abaixo)
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3
        const k = (i + 2) % 3
        if (side[i] === 0 && side[j] === 0 && side[k] <= 0) {
          const a = V[i].p, b = V[j].p
          if (a.distanceToSquared(b) > EPS * EPS) {
            segFlat.push(a.x, a.y, a.z, b.x, b.y, b.z)
          }
        }
      }
      continue
    }

    // ── Straddle: triângulo cruza o plano ──────────────────────────────────
    // Usa clip explícito com rastreamento de quais vértices estão sobre o plano.
    clipTriangle(V, d, side, EPS, positive, negative, segFlat)
  }

  // ---------------------------------------------------------------------------
  // PASSOS 3-4: reconstrói loops fechados a partir dos segmentos
  // ---------------------------------------------------------------------------
  const loops = buildLoops(segFlat, scale, EPS)

  // ---------------------------------------------------------------------------
  // PASSOS 5-7: triangula os loops e gera as tampas
  // ---------------------------------------------------------------------------
  const { u, v } = planeBasis(n)
  let capTriangles = 0
  if (loops.length > 0) {
    capTriangles = buildCaps(loops, n, u, v, planePoint, positive, negative)
  }

  return {
    positive: positive.toGeometry(),
    negative: negative.toGeometry(),
    capLoops: loops.length,
    capTriangles,
  }
}

// ---------------------------------------------------------------------------
// Clip de um triângulo que cruza o plano (Sutherland-Hodgman adaptado)
// ---------------------------------------------------------------------------
function clipTriangle(
  V: Vtx[],
  d: number[],
  side: number[],
  EPS: number,
  positive: SideBuilder,
  negative: SideBuilder,
  segFlat: number[],
): void {
  // Polígonos resultantes do clip: cada vértice carrega se está sobre o plano.
  const posPoly: Vtx[] = []
  const negPoly: Vtx[] = []
  const posOn: boolean[] = []
  const negOn: boolean[] = []

  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3
    const di = d[i], dj = d[j]
    const si = side[i], sj = side[j]
    const vi = V[i], vj = V[j]

    // Adiciona vértice atual ao lado correto
    if (si >= 0) { posPoly.push(vi); posOn.push(si === 0) }
    if (si <= 0) { negPoly.push(vi); negOn.push(si === 0) }

    // Interseção estrita entre lados opostos (ignora vértices sobre o plano)
    if ((si > 0 && sj < 0) || (si < 0 && sj > 0)) {
      const t = di / (di - dj)
      const ip = lerpVtx(vi, vj, t)
      posPoly.push(ip); posOn.push(true)
      negPoly.push(ip); negOn.push(true)
    }
  }

  // Fan-triangula o polígono positivo
  for (let i = 1; i + 1 < posPoly.length; i++) {
    positive.pushTri(posPoly[0], posPoly[i], posPoly[i + 1])
  }

  // Fan-triangula o polígono negativo
  for (let i = 1; i + 1 < negPoly.length; i++) {
    negative.pushTri(negPoly[0], negPoly[i], negPoly[i + 1])
  }

  // Extrai o segmento de interseção: aresta de negPoly cujos dois extremos
  // estão sobre o plano, percorrida no sentido CCW do polígono negativo.
  // Isso garante que o material negativo fique à esquerda visto de +n.
  const m = negPoly.length
  for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m
    if (negOn[k] && negOn[k2]) {
      const a = negPoly[k].p
      const b = negPoly[k2].p
      if (a.distanceToSquared(b) > EPS * EPS) {
        segFlat.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
      // Continua procurando: pode haver múltiplos pares (ex.: um vértice está
      // exatamente sobre o plano junto com um ponto de interseção).
    }
  }
}

// ---------------------------------------------------------------------------
// PASSO 3: reconstrói loops fechados a partir dos segmentos direcionados
// ---------------------------------------------------------------------------
interface Loop {
  pts: THREE.Vector3[]
}

function buildLoops(segFlat: number[], scale: number, EPS: number): Loop[] {
  const segCount = segFlat.length / 6
  if (segCount === 0) return []

  // Solda pontos por posição quantizada para eliminar micro-gaps entre
  // segmentos de triângulos adjacentes.
  const Q = 1 / Math.max(scale * 1e-4, 1e-9)
  const keyToId = new Map<string, number>()
  const idPos: THREE.Vector3[] = []

  const idOf = (x: number, y: number, z: number): number => {
    const k = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`
    let id = keyToId.get(k)
    if (id === undefined) {
      id = idPos.length
      keyToId.set(k, id)
      idPos.push(new THREE.Vector3(x, y, z))
    }
    return id
  }

  // Constrói grafo direcionado a → [b1, b2, ...], removendo duplicatas.
  // Duplicatas surgem quando dois triângulos compartilham a mesma aresta
  // de corte (aresta interior da malha exatamente sobre o plano).
  const outEdges = new Map<number, number[]>()
  const seen = new Set<string>()

  for (let s = 0; s < segCount; s++) {
    const o = s * 6
    const a = idOf(segFlat[o],     segFlat[o + 1], segFlat[o + 2])
    const b = idOf(segFlat[o + 3], segFlat[o + 4], segFlat[o + 5])
    if (a === b) continue
    const key = `${a}>${b}`
    if (seen.has(key)) continue
    seen.add(key)
    const list = outEdges.get(a)
    if (list) {
      list.push(b)
    } else {
      outEdges.set(a, [b])
    }
  }

  // Chain following: percorre o grafo direcionado extraindo cadeias fechadas.
  // Usa um mapa de "próximo ponteiro" por nó para consumir arestas sem repetir.
  const nextPtr = new Map<number, number>()

  const loops: Loop[] = []

  for (const [startNode] of outEdges) {
    // Enquanto este nó ainda tiver arestas não consumidas, inicia uma cadeia.
    while (true) {
      const ptr = nextPtr.get(startNode) ?? 0
      const outs = outEdges.get(startNode)
      if (!outs || ptr >= outs.length) break

      // Percorre a cadeia até fechar o loop ou esgotar as saídas.
      const chain: number[] = []
      let cur = startNode
      const maxSteps = idPos.length + 4
      let steps = 0
      let closed = false

      while (steps++ < maxSteps) {
        const curPtr = nextPtr.get(cur) ?? 0
        const curOuts = outEdges.get(cur)
        if (!curOuts || curPtr >= curOuts.length) break // sem saída disponível

        chain.push(cur)
        const next = curOuts[curPtr]
        nextPtr.set(cur, curPtr + 1) // consome a aresta cur→next

        if (next === startNode) {
          closed = true
          break
        }
        cur = next
      }

      if (closed && chain.length >= 3) {
        loops.push({ pts: chain.map((id) => idPos[id]) })
      }
      // Se não fechou, as arestas foram consumidas igualmente — sem loop infinito.
    }
  }

  return loops
}

// ---------------------------------------------------------------------------
// PASSOS 5-6: triangulação dos loops (tampas) com suporte a furos
// ---------------------------------------------------------------------------
interface Loop2D {
  pts3d: THREE.Vector3[]
  pts2d: THREE.Vector2[]
  area: number
}

function signedArea2D(pts: THREE.Vector2[]): number {
  let a = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n]
    a += p.x * q.y - q.x * p.y
  }
  return a * 0.5
}

function pointInPoly(pt: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-30) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function buildCaps(
  loops: Loop[],
  n: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  planePoint: THREE.Vector3,
  positive: SideBuilder,
  negative: SideBuilder,
): number {
  // Projeta cada loop para o espaço 2D (u, v) do plano
  const L: Loop2D[] = loops.map((lp) => {
    const pts2d = lp.pts.map((p) => {
      const rel = p.clone().sub(planePoint)
      return new THREE.Vector2(rel.dot(u), rel.dot(v))
    })
    return { pts3d: lp.pts, pts2d, area: signedArea2D(pts2d) }
  })

  // Determina profundidade de aninhamento: par = contorno externo, ímpar = furo
  const depth = L.map((li, i) => {
    const rep = li.pts2d[0]
    let d = 0
    for (let j = 0; j < L.length; j++) {
      if (j === i) continue
      // Só conta como pai loops de área maior
      if (Math.abs(L[j].area) <= Math.abs(li.area)) continue
      if (pointInPoly(rep, L[j].pts2d)) d++
    }
    return d
  })

  const outers: number[] = []
  const holesOf = new Map<number, number[]>()
  L.forEach((_, i) => {
    if (depth[i] % 2 === 0) {
      outers.push(i)
      holesOf.set(i, [])
    }
  })
  L.forEach((li, i) => {
    if (depth[i] % 2 === 1) {
      // Encontra o menor contorno externo que contém este furo
      let best = -1
      let bestArea = Infinity
      for (const oi of outers) {
        const outerArea = Math.abs(L[oi].area)
        if (outerArea < Math.abs(li.area)) continue
        if (
          pointInPoly(li.pts2d[0], L[oi].pts2d) &&
          outerArea < bestArea
        ) {
          best = oi
          bestArea = outerArea
        }
      }
      if (best >= 0) holesOf.get(best)!.push(i)
    }
  })

  let capTriangles = 0

  for (const oi of outers) {
    const outer = L[oi]
    const holes = holesOf.get(oi)!.map((hi) => L[hi])

    // THREE.ShapeUtils.triangulateShape espera:
    //   contorno externo: CCW → área > 0 em (u,v)
    //   furos: CW → área < 0 em (u,v)
    const contour2d = outer.area >= 0
      ? outer.pts2d.slice()
      : outer.pts2d.slice().reverse()
    const contour3d = outer.area >= 0
      ? outer.pts3d.slice()
      : outer.pts3d.slice().reverse()

    const holes2d: THREE.Vector2[][] = []
    const holes3d: THREE.Vector3[][] = []
    for (const h of holes) {
      // Furos devem ser CW (área < 0)
      if (h.area < 0) {
        holes2d.push(h.pts2d.slice())
        holes3d.push(h.pts3d.slice())
      } else {
        holes2d.push(h.pts2d.slice().reverse())
        holes3d.push(h.pts3d.slice().reverse())
      }
    }

    // Constrói array combinado: [contorno, furo0, furo1, ...]
    // Os índices retornados por triangulateShape indexam neste array combinado.
    const combined3d: THREE.Vector3[] = [...contour3d]
    for (const h3 of holes3d) combined3d.push(...h3)

    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour2d, holes2d)
    } catch {
      // Fallback: fan do contorno externo (funciona para convexos)
      faces = []
      for (let i = 1; i + 1 < contour2d.length; i++) {
        faces.push([0, i, i + 1])
      }
    }

    for (const tri of faces) {
      const A = combined3d[tri[0]]
      const B = combined3d[tri[1]]
      const C = combined3d[tri[2]]
      if (!A || !B || !C) continue

      // triangulateShape retorna winding CCW em (u,v) → normal aponta para +n.
      // Tampa do lado NEGATIVO (material em -n): precisa de face voltada para +n → CCW está correto.
      negative.pushCapTri(A, B, C, n)
      // Tampa do lado POSITIVO (material em +n): precisa de face voltada para -n → inverte winding.
      positive.pushCapTri(A, C, B, n.clone().negate())
      capTriangles += 2
    }
  }

  return capTriangles
}
