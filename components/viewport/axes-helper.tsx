"use client"

import { useRef } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

export function AxesHelper() {
  const size = 1.5

  return (
    <group position={[-4.5, -1.8, -4.5]}>
      {/* Eixo X — vermelho */}
      <arrowHelper
        args={[
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, 0),
          size,
          0xff3333,
          0.15,
          0.08,
        ]}
      />
      {/* Eixo Y — verde */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 0),
          size,
          0x33ff66,
          0.15,
          0.08,
        ]}
      />
      {/* Eixo Z — azul */}
      <arrowHelper
        args={[
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, 0),
          size,
          0x3366ff,
          0.15,
          0.08,
        ]}
      />
    </group>
  )
}
