import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, Wireframe } from '@react-three/drei';
import * as THREE from 'three';

function AnimatedMesh() {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.rotation.x += delta * 0.1;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={2}>
      <group ref={meshRef}>
        <mesh>
          <torusGeometry args={[2, 1]} />
          <meshStandardMaterial color="#FF6A00" wireframe />
        </mesh>
        <mesh scale={0.9}>
          <icosahedronGeometry args={[1.5, 0]} />
          <meshStandardMaterial color="#151515" flatShading />
        </mesh>
      </group>
    </Float>
  );
}

export function HeroCanvas() {
  return (
    <div className="w-full h-full absolute inset-0 -z-10 pointer-events-none opacity-60 mix-blend-screen">
      <Canvas camera={{ position: [0, 0, 8], fov: 35 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[10, 10, 5]} intensity={2} color="#FF6A00" />
        <directionalLight position={[-10, -10, -5]} intensity={1} color="#444444" />
        <AnimatedMesh />
      </Canvas>
    </div>
  );
}
