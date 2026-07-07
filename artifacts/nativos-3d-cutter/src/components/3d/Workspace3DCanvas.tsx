import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useSelectionStore } from '@/stores/use-selection-store';

/** Inner scene — rendered inside <Canvas>, so R3F hooks are safe here */
function SceneContent() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { clearSelection } = useSelectionStore();

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <>
      <color attach="background" args={['#090909']} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />

      <Grid
        renderOrder={-1}
        position={[0, -2, 0]}
        infiniteGrid
        fadeDistance={30}
        fadeStrength={5}
        cellSize={1}
        sectionSize={5}
        cellColor="#2A2A2A"
        sectionColor="#3A3A3A"
      />

      {/* Solid base mesh */}
      <mesh ref={meshRef} onClick={clearSelection}>
        <icosahedronGeometry args={[2.48, 2]} />
        <meshStandardMaterial color="#3A3A3A" flatShading />
      </mesh>

      {/* Wireframe overlay */}
      <mesh>
        <icosahedronGeometry args={[2.5, 2]} />
        <meshStandardMaterial
          color="#FF6A00"
          wireframe
          transparent
          opacity={0.15}
        />
      </mesh>

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={20}
      />
    </>
  );
}

export function Workspace3DCanvas() {
  return (
    <div className="w-full h-full relative cursor-crosshair">
      <Canvas camera={{ position: [0, 5, 10], fov: 45 }}>
        <SceneContent />
      </Canvas>
    </div>
  );
}
