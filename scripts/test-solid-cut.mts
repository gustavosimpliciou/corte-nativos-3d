import * as THREE from 'three'
import { solidPlaneCut } from '../lib/solid-plane-cut.ts'

// Conta arestas de borda (usadas por só 1 triângulo) após soldar por posição.
// Um sólido fechado (watertight) deve ter 0 arestas de borda.
function boundaryEdges(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const tri = pos.count / 3
  const Q = 1e4
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * Q)},${Math.round(pos.getY(i) * Q)},${Math.round(pos.getZ(i) * Q)}`
  const id = new Map<string, number>()
  const vid = (i: number) => {
    const k = key(i)
    let v = id.get(k)
    if (v === undefined) { v = id.size; id.set(k, v) }
    return v
  }
  const edgeCount = new Map<string, number>()
  for (let t = 0; t < tri; t++) {
    const a = vid(t * 3), b = vid(t * 3 + 1), c = vid(t * 3 + 2)
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const ek = x < y ? `${x}_${y}` : `${y}_${x}`
      edgeCount.set(ek, (edgeCount.get(ek) ?? 0) + 1)
    }
  }
  let boundary = 0
  for (const c of edgeCount.values()) if (c === 1) boundary++
  return boundary
}

function toSoup(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  return geo.index ? geo.toNonIndexed() : geo
}

function run(name: string, geo: THREE.BufferGeometry, normal: THREE.Vector3, point: THREE.Vector3) {
  const soup = toSoup(geo)
  const beforeBoundary = boundaryEdges(soup)
  const res = solidPlaneCut(soup, normal, point)
  const bp = boundaryEdges(res.positive)
  const bn = boundaryEdges(res.negative)
  const posTris = res.positive.getAttribute('position').count / 3
  const negTris = res.negative.getAttribute('position').count / 3
  const ok = bp === 0 && bn === 0 && posTris > 0 && negTris > 0
  console.log(
    `${ok ? 'PASS' : 'FAIL'} | ${name} | entrada borda=${beforeBoundary} | ` +
    `pos tris=${posTris} borda=${bp} | neg tris=${negTris} borda=${bn} | ` +
    `loops=${res.capLoops} capTris=${res.capTriangles}`,
  )
  return ok
}

let all = true

// 1. Cubo cortado ao meio no eixo Y
all = run('Cubo Y=0', new THREE.BoxGeometry(2, 2, 2), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)) && all

// 2. Cubo cortado fora do centro no eixo X
all = run('Cubo X=0.4', new THREE.BoxGeometry(2, 2, 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.4, 0, 0)) && all

// 3. Esfera cortada ao meio (contorno curvo)
all = run('Esfera Y=0', new THREE.SphereGeometry(1, 48, 32), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)) && all

// 4. Toro cortado (gera 2 loops = furo/anel em certos planos)
all = run('Toro Z=0', new THREE.TorusGeometry(1, 0.4, 24, 48), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0)) && all

// 5. Cilindro cortado no eixo Y (2 loops: topo aberto vira anel? não — sólido) 
all = run('Cilindro Y=0.2', new THREE.CylinderGeometry(1, 1, 3, 40), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.2, 0)) && all

// 6. Plano oblíquo em um cubo
all = run('Cubo obliquo', new THREE.BoxGeometry(2, 2, 2), new THREE.Vector3(1, 1, 0.5).normalize(), new THREE.Vector3(0, 0, 0)) && all

// 7. Toro cortado FORA do centro (loops assimétricos)
all = run('Toro Y=0.15', new THREE.TorusGeometry(1, 0.4, 24, 48), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.15, 0)) && all

// 8. Esfera densa cortada obliquamente (contorno curvo grande)
all = run('Esfera densa obl.', new THREE.SphereGeometry(1, 96, 64), new THREE.Vector3(0.3, 1, 0.2).normalize(), new THREE.Vector3(0.1, 0.05, 0)) && all

// 9. MÚLTIPLAS ILHAS: duas caixas separadas cortadas pelo mesmo plano (2 loops)
{
  const boxA = new THREE.BoxGeometry(1, 3, 1).translate(-1.2, 0, 0)
  const boxB = new THREE.BoxGeometry(1, 3, 1).translate(1.2, 0, 0)
  const merged = mergeGeoms([boxA, boxB])
  all = run('2 ilhas Y=0', merged, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)) && all
}

// 10. Icosaedro (faces triangulares irregulares) cortado no centro
all = run('Icosaedro X=0', new THREE.IcosahedronGeometry(1, 2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0)) && all

console.log(all ? '\nTODOS OS TESTES PASSARAM' : '\nALGUNS TESTES FALHARAM')
process.exit(all ? 0 : 1)

// Concatena geometrias não-indexadas em uma sopa de triângulos única.
function mergeGeoms(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const soups = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  const total = soups.reduce((s, g) => s + (g.getAttribute('position') as THREE.BufferAttribute).count, 0)
  const pos = new Float32Array(total * 3)
  let off = 0
  for (const g of soups) {
    const p = g.getAttribute('position') as THREE.BufferAttribute
    pos.set(p.array as Float32Array, off)
    off += p.count * 3
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.computeVertexNormals()
  return out
}
