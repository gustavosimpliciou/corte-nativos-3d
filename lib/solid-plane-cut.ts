/**
 * Solid Plane Cut — Corte de sólido por plano (watertight manifold)
 * ------------------------------------------------------------------
 * Ao contrário de um simples "surface split" (que só divide a casca e deixa
 * buracos), este algoritmo trata a malha como um SÓLIDO FECHADO e produz DUAS
 * peças volumétricas independentes, cada uma fechada com uma tampa triangulada
 * exatamente sobre o plano de corte — exatamente como Blender (Bisect + Fill),
 * Meshmixer, Bambu Studio, PrusaSlicer e Cura.
 *
 * Pipeline:
 *   1. Classifica cada vértice em relação ao plano (positivo / negativo / sobre).
 *   2. Divide (clip) cada triângulo interceptado, gerando vértices de interseção.
 *   3. Detecta o segmento de interseção de cada triângulo que cruza o plano.
 *   4. Reconstrói os segmentos em loops de aresta fechados (closed edge loops).
 *   5. Triangula os loops (com detecção de furos/concavidade) → tampas.
 *   6. Corrige as normais das tampas (para fora de cada metade).
 *   7. Exporta duas BufferGeometry fechadas, prontas para o fatiador preencher.
 */

import * as THREE from 'three'

export interface PlaneCutResult {
  /** Metade no lado +normal do plano (sólida e fechada). */
  positive: THREE.BufferGeometry
  /** Metade no lado -normal do plano (sólida e fechada). */
  negative: THREE.BufferGeometry
  /** Número de loops de contorno fechados usados para gerar as tampas. */
  capLoops: number
  /** Triângulos de tampa gerados no total (positivo + negativo). */
  capTriangles: number
}

// Vértice com posição + normal interpoláveis ao longo das arestas cortadas.
interface Vtx {
  p: THREE.Vector3
  n: THREE.Vector3
}

export type PlaneAxis = 'x' | 'y' | 'z'

/**
 * Deriva a normal e o ponto do plano a partir de um eixo do mundo e um offset
 * normalizado (0..1) dentro da bounding box da geometria.
 */
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

// Acumulador de sopa de triângulos (posição + normal) para uma metade.
class SideBuilder {
  pos: number[] = []
  nrm: number[] = []

  pushTri(a: Vtx, b: Vtx, c: Vtx): void {
    this.pos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z, c.p.x, c.p.y, c.p.z)
    this.nrm.push(a.n.x, a.n.y, a.n.z, b.n.x, b.n.y, b.n.z, c.n.x, c.n.y, c.n.z)
  }

  // Triângulo de tampa com uma única normal plana (flat shading no corte).
  pushCapTri(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
    n: THREE.Vector3,
  ): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    this.nrm.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z)
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

/** Base ortonormal (u, v) do plano tal que u × v = n. */
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
  const n = new THREE.Vector3().lerpVectors(a.n, b.n, t)
  if (n.lengthSq() > 1e-12) n.normalize()
  return { p, n }
}

/**
 * Executa o corte de sólido por plano.
 *
 * @param geometry   malha de entrada (indexada ou não).
 * @param planeNormal normal unitária do plano.
 * @param planePoint  um ponto pertencente ao plano.
 * @param eps         tolerância (fração do tamanho do modelo) para "sobre o plano".
 */
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

  // Tolerância proporcional ao tamanho do modelo (robusto p/ qualquer escala).
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  const scale = geometry.boundingSphere ? geometry.boundingSphere.radius : 1
  const EPS = eps ?? Math.max(1e-9, scale * 1e-6)

  const positive = new SideBuilder()
  const negative = new SideBuilder()

  // Segmentos de interseção DIRECIONADOS (meia-aresta a→b) para reconstruir os
  // loops de contorno de forma determinística. A direção é derivada do winding
  // do triângulo (CCW no polígono recortado do lado negativo), o que torna a
  // reconstrução robusta em seções não-manifold, detalhes finos e múltiplas
  // ilhas — onde um grafo não-direcionado ramificaria errado.
  const segDir: number[] = [] // por segmento: [ax,ay,az, bx,by,bz] com a→b
  const idxA = idxAttr ? (idxAttr.array as ArrayLike<number>) : null

  // Helpers de leitura de vértice ------------------------------------------------
  const tmpFaceN = new THREE.Vector3()
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()

  const readVtx = (vi: number, faceN: THREE.Vector3): Vtx => {
    const p = new THREE.Vector3(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi))
    let nn: THREE.Vector3
    if (nrmAttr) {
      nn = new THREE.Vector3(nrmAttr.getX(vi), nrmAttr.getY(vi), nrmAttr.getZ(vi))
      if (nn.lengthSq() < 1e-12) nn.copy(faceN)
    } else {
      nn = faceN.clone()
    }
    return { p, n: nn }
  }

  // Loop principal: classifica + divide cada triângulo -------------------------
  for (let f = 0; f < triCount; f++) {
    const i0 = idxA ? idxA[f * 3] : f * 3
    const i1 = idxA ? idxA[f * 3 + 1] : f * 3 + 1
    const i2 = idxA ? idxA[f * 3 + 2] : f * 3 + 2

    va.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0))
    vb.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1))
    vc.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2))

    // Normal geométrica da face (fallback quando não há atributo de normal).
    tmpFaceN.crossVectors(
      vb.clone().sub(va),
      vc.clone().sub(va),
    )
    if (tmpFaceN.lengthSq() > 1e-20) tmpFaceN.normalize()

    const V: Vtx[] = [readVtx(i0, tmpFaceN), readVtx(i1, tmpFaceN), readVtx(i2, tmpFaceN)]

    // Distância com sinal ao plano: d = (p - planePoint) · n
    const d = [
      V[0].p.clone().sub(planePoint).dot(n),
      V[1].p.clone().sub(planePoint).dot(n),
      V[2].p.clone().sub(planePoint).dot(n),
    ]

    const dMin = Math.min(d[0], d[1], d[2])
    const dMax = Math.max(d[0], d[1], d[2])

    // Triângulo inteiramente de um lado (ou coplanar) → vai inteiro.
    if (dMin >= -EPS) {
      positive.pushTri(V[0], V[1], V[2])
      // Caso o plano passe por uma ARESTA inteira (2 vértices sobre o plano) e o
      // terceiro esteja estritamente acima: essa aresta é parte do contorno do
      // corte. Registra o segmento aqui (só pelo lado positivo p/ não duplicar,
      // pois o triângulo vizinho fica inteiro do lado negativo).
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3
        const k = (i + 2) % 3
        if (Math.abs(d[i]) <= EPS && Math.abs(d[j]) <= EPS && d[k] > EPS) {
          // A aresta i→j está sobre o plano e é fronteira da tampa do lado
          // negativo. Orienta de modo que o interior negativo (lado oposto ao
          // vértice k, que está acima do plano) fique à esquerda quando visto
          // de +n. Regra: se (n × e) apontar para longe de k, mantém i→j; senão
          // inverte. Isso mantém o mesmo winding dos segmentos de straddle.
          const a = V[i].p, b = V[j].p
          const e = b.clone().sub(a)
          const left = new THREE.Vector3().crossVectors(n, e) // "esquerda" vista de +n
          const towardK = V[k].p.clone().sub(a)
          if (left.dot(towardK) < 0) {
            segDir.push(a.x, a.y, a.z, b.x, b.y, b.z)
          } else {
            segDir.push(b.x, b.y, b.z, a.x, a.y, a.z)
          }
        }
      }
      continue
    }
    if (dMax <= EPS) {
      negative.pushTri(V[0], V[1], V[2])
      continue
    }

    // ── Straddle: o triângulo cruza o plano → clip Sutherland-Hodgman ─────────
    const posPoly: Vtx[] = []
    const negPoly: Vtx[] = []
    // Marca, em paralelo a negPoly, quais vértices estão sobre o plano de corte.
    const negOn: boolean[] = []

    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      const di = d[i], dj = d[j]
      const vi = V[i], vj = V[j]

      const iOn = Math.abs(di) <= EPS
      if (di >= -EPS) posPoly.push(vi)
      if (di <= EPS) { negPoly.push(vi); negOn.push(iOn) }

      // Cruzamento estrito de sinal na aresta i→j → ponto de interseção.
      if ((di > EPS && dj < -EPS) || (di < -EPS && dj > EPS)) {
        const t = di / (di - dj)
        const ip = lerpVtx(vi, vj, t)
        posPoly.push(ip)
        negPoly.push(ip)
        negOn.push(true)
      }
    }

    // Fan-triangula cada polígono do clip para o seu lado.
    for (let i = 1; i + 1 < posPoly.length; i++) {
      positive.pushTri(posPoly[0], posPoly[i], posPoly[i + 1])
    }
    for (let i = 1; i + 1 < negPoly.length; i++) {
      negative.pushTri(negPoly[0], negPoly[i], negPoly[i + 1])
    }

    // Aresta de corte orientada = a aresta de negPoly (que é CCW no winding do
    // triângulo) cujos DOIS extremos estão sobre o plano. Emitir essa aresta
    // com direção preservada dá meia-arestas consistentes para montar os loops.
    const m = negPoly.length
    if (m >= 2) {
      for (let k = 0; k < m; k++) {
        const k2 = (k + 1) % m
        if (negOn[k] && negOn[k2]) {
          const a = negPoly[k].p, b = negPoly[k2].p
          if (a.distanceToSquared(b) > EPS * EPS) {
            segDir.push(a.x, a.y, a.z, b.x, b.y, b.z)
          }
          break
        }
      }
    }
  }

  // ── Reconstrução dos loops de contorno fechados ─────────────────────────────
  const { u, v } = planeBasis(n)
  const loops = buildLoops(segDir, scale)

  // ── Triangula os loops (tampas) com detecção de furos ───────────────────────
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

// ── Reconstrução de loops a partir de segmentos soltos ────────────────────────
interface Loop {
  pts: THREE.Vector3[]
}

function buildLoops(segFlat: number[], scale: number): Loop[] {
  const segCount = segFlat.length / 6
  if (segCount === 0) return []

  // Solda pontos por posição quantizada → ids inteiros.
  const Q = 1 / Math.max(scale * 1e-5, 1e-9)
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

  // ── Grafo DIRECIONADO de meia-arestas (a → b) ───────────────────────────────
  // Cada aresta de corte foi emitida com direção consistente (CCW no winding do
  // triângulo do lado negativo). Percorrer o grafo respeitando essa direção
  // garante loops fechados mesmo quando um vértice é compartilhado por mais de
  // duas arestas (seções não-manifold, detalhes finos, ilhas múltiplas).
  const outEdges = new Map<number, number[]>() // a → [b, b, ...]
  const seen = new Set<string>()

  for (let s = 0; s < segCount; s++) {
    const o = s * 6
    const a = idOf(segFlat[o], segFlat[o + 1], segFlat[o + 2])
    const b = idOf(segFlat[o + 3], segFlat[o + 4], segFlat[o + 5])
    if (a === b) continue
    const dk = `${a}>${b}`
    if (seen.has(dk)) continue // remove meia-arestas duplicadas exatas
    seen.add(dk)
    ;(outEdges.get(a) ?? outEdges.set(a, []).get(a)!).push(b)
  }

  // Ponteiro de consumo por nó (quantas saídas já usamos) + total emitido.
  const consumed = new Map<number, number>()
  let totalEdges = 0
  for (const list of outEdges.values()) totalEdges += list.length

  const loops: Loop[] = []
  const maxGuard = totalEdges + 8

  for (const [start, list] of outEdges) {
    // Enquanto este nó tiver arestas de saída não consumidas, inicia um loop.
    while ((consumed.get(start) ?? 0) < list.length) {
      const loopIds: number[] = []
      let cur = start
      let guard = 0
      let closed = false

      while (guard++ < maxGuard) {
        const outs = outEdges.get(cur)
        if (!outs) break
        let ptr = consumed.get(cur) ?? 0
        if (ptr >= outs.length) break // beco sem saída (não fecha)

        loopIds.push(cur)
        const next = outs[ptr]
        consumed.set(cur, ptr + 1) // consome a meia-aresta cur→next

        cur = next
        if (cur === start) { closed = true; break }
      }

      // Só aceita loops que voltaram ao início (fechados) com ≥ 3 vértices.
      if (closed && loopIds.length >= 3) {
        loops.push({ pts: loopIds.map((id) => idPos[id]) })
      }
      // Se não fechou, as arestas já foram consumidas e são descartadas —
      // evita loop infinito e não gera tampas com buraco.
    }
  }

  return loops
}

// ── Triangulação das tampas (com furos e concavidade) ─────────────────────────
interface Loop2D {
  pts3d: THREE.Vector3[]
  pts2d: THREE.Vector2[]
  area: number // assinado no espaço (u, v)
}

function signedArea2D(pts: THREE.Vector2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
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
  // Projeta cada loop para 2D (u, v).
  const L: Loop2D[] = loops.map((lp) => {
    const pts2d = lp.pts.map((p) => {
      const rel = p.clone().sub(planePoint)
      return new THREE.Vector2(rel.dot(u), rel.dot(v))
    })
    return { pts3d: lp.pts, pts2d, area: signedArea2D(pts2d) }
  })

  // Classifica cada loop como contorno externo ou furo, via aninhamento.
  // profundidade par → externo; ímpar → furo.
  const depth: number[] = L.map((li, i) => {
    const rep = li.pts2d[0]
    let d = 0
    for (let j = 0; j < L.length; j++) {
      if (j === i) continue
      if (Math.abs(L[j].area) <= Math.abs(li.area)) continue
      if (pointInPoly(rep, L[j].pts2d)) d++
    }
    return d
  })

  // Associa cada furo ao menor contorno externo que o contém.
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
      // acha o outer que o contém com menor área
      let best = -1
      let bestArea = Infinity
      for (const oi of outers) {
        if (Math.abs(L[oi].area) < Math.abs(li.area)) continue
        if (pointInPoly(li.pts2d[0], L[oi].pts2d) && Math.abs(L[oi].area) < bestArea) {
          best = oi
          bestArea = Math.abs(L[oi].area)
        }
      }
      if (best >= 0) holesOf.get(best)!.push(i)
    }
  })

  let capTriangles = 0

  const to3D = (p2: THREE.Vector2): THREE.Vector3 =>
    planePoint.clone()
      .add(u.clone().multiplyScalar(p2.x))
      .add(v.clone().multiplyScalar(p2.y))

  for (const oi of outers) {
    const outer = L[oi]
    const holes = holesOf.get(oi)!.map((hi) => L[hi])

    // Contorno externo deve ser CCW (área > 0); furos CW (área < 0).
    const contour2d = outer.area >= 0 ? outer.pts2d.slice() : outer.pts2d.slice().reverse()
    const contour3d = outer.area >= 0 ? outer.pts3d.slice() : outer.pts3d.slice().reverse()

    const holes2d: THREE.Vector2[][] = []
    const holes3d: THREE.Vector3[][] = []
    for (const h of holes) {
      if (h.area <= 0) {
        holes2d.push(h.pts2d.slice())
        holes3d.push(h.pts3d.slice())
      } else {
        holes2d.push(h.pts2d.slice().reverse())
        holes3d.push(h.pts3d.slice().reverse())
      }
    }

    // Índices combinados [contour, ...holes] → posições 3D correspondentes.
    const combined3d: THREE.Vector3[] = [...contour3d]
    for (const h3 of holes3d) combined3d.push(...h3)

    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour2d, holes2d)
    } catch {
      // fallback: triangulação em leque do contorno externo
      faces = []
      for (let i = 1; i + 1 < contour2d.length; i++) faces.push([0, i, i + 1])
    }

    for (const tri of faces) {
      const A = combined3d[tri[0]]
      const B = combined3d[tri[1]]
      const C = combined3d[tri[2]]
      if (!A || !B || !C) continue

      // Faces do triangulateShape são CCW em (u, v) → normal +n.
      // Lado negativo (material em -n): tampa voltada para +n → usa como está.
      negative.pushCapTri(A, B, C, n)
      // Lado positivo (material em +n): tampa voltada para -n → inverte winding.
      const nn = n.clone().negate()
      positive.pushCapTri(A, C, B, nn)
      capTriangles += 2
    }
  }

  return capTriangles
}
