import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Text, Clouds, Cloud, ScrollControls, Scroll, useScroll, Environment, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

// Import our generated Shoreline image
import shorelineImg from './assets/images/shoreline_sunset.jpg';

// Custom Gemini Star Texture Generator (Astroid curve shape)
const getStarTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, 128, 128);
    const cx = 64;
    const cy = 64;
    const r = 48; 

    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    // Draw the 4 inward curves of the Gemini star
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx - r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r);
    ctx.closePath();
    
    // Glowing white star, the particle color will tint it
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ffffff";
    
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
};

// 1. Particle System that reacts to scroll speed and cursor
const Particles = ({ count = 800 }) => {
  const points = useRef<THREE.Points>(null);
  const scroll = useScroll();
  const { camera } = useThree();
  
  const starTexture = useMemo(() => getStarTexture(), []);

  const [originalPositions] = useState(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Broaden the spread to cover the entire descent trajectory
        arr[i * 3]     = (Math.random() - 0.5) * 100; // x spread
        arr[i * 3 + 1] = (Math.random() - 0.5) * 120 + 0; // y spread (-60 to 60)
        arr[i * 3 + 2] = (Math.random() - 0.5) * 80 - 20; // z spread (-60 to 20)
    }
    return arr;
  });

  const [colors] = useState(() => {
    const arr = new Float32Array(count * 3);
    const palette = [
      [0.26, 0.52, 0.96], // Blue (#4285F4)
      [0.92, 0.26, 0.21], // Red (#EA4335)
      [0.98, 0.73, 0.02], // Yellow (#FBBC05)
      [0.20, 0.66, 0.33], // Green (#34A853)
      [1.0,  1.0,  1.0],  // White
      [0.8,  0.9,  1.0],  // Soft Blue
    ];
    for (let i = 0; i < count; i++) {
        const c = palette[Math.floor(Math.random() * palette.length)];
        arr[i * 3]     = c[0];
        arr[i * 3 + 1] = c[1];
        arr[i * 3 + 2] = c[2];
    }
    return arr;
  });

  const positions = useMemo(() => new Float32Array(originalPositions), [originalPositions]);
  const targetMouse = useRef(new THREE.Vector3());

  useFrame((state) => {
    if (!points.current) return;
    const s = scroll.offset;
    
    // Approximate mouse position in 3D space
    // Track pointer smoothly to avoid stutter
    targetMouse.current.x = THREE.MathUtils.lerp(targetMouse.current.x, (state.pointer.x * state.viewport.width) / 2, 0.1);
    targetMouse.current.y = THREE.MathUtils.lerp(targetMouse.current.y, (state.pointer.y * state.viewport.height) / 2, 0.1);
    targetMouse.current.z = camera.position.z - 15;

    const posAttr = points.current.geometry.attributes.position;

    const colorAttr = points.current.geometry.attributes.color;

    for (let i = 0; i < count; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        let x = originalPositions[ix];
        const initialY = originalPositions[iy];
        let z = originalPositions[iz];

        const Math_PI = 3.14159;
        // Make them spin softly
        const angle = state.clock.elapsedTime * 0.05 + (s * 0.3) + (i * Math_PI * 2 / count);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = x * cos - z * sin;
        const nz = x * sin + z * cos;
        
        let cy = initialY + (s * 60); 
        let cx = nx;
        let cz = nz;

        const pPos = new THREE.Vector3(cx, cy, cz);
        const dist = pPos.distanceTo(targetMouse.current);

        if (dist < 10) {
            const pushDir = pPos.clone().sub(targetMouse.current).normalize();
            const pushStrength = Math.pow(10 - dist, 2) * 0.05;
            cx += pushDir.x * pushStrength;
            cy += pushDir.y * pushStrength;
            cz += pushDir.z * pushStrength;
        }

        posAttr.array[ix] = cx;
        posAttr.array[iy] = cy;
        posAttr.array[iz] = cz;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial 
        size={1.5} 
        map={starTexture} 
        alphaTest={0.01} 
        depthWrite={false} 
        vertexColors 
        transparent 
        opacity={0.9} 
        sizeAttenuation 
      />
    </points>
  );
};

// 2. Parallax Cloud Group Wrapper (With slow organic drift)
const CloudGroup = ({ children, speed, startPos, driftSpeed = 0.5 }: { children: React.ReactNode, speed: number, startPos: [number, number, number], driftSpeed?: number }) => {
  const group = useRef<THREE.Group>(null);
  const scroll = useScroll();

  useFrame((state) => {
    if (!group.current) return;
    const s = scroll.offset;
    // Enhanced movement: Parallax + drift + swirling rotation
    const time = state.clock.elapsedTime;
    
    group.current.position.y = startPos[1] + s * speed + Math.sin(time * driftSpeed) * 0.8;
    group.current.position.x = startPos[0] + Math.cos(time * driftSpeed) * 1.5;
    group.current.rotation.y = Math.sin(time * driftSpeed * 0.2) * 0.1;
    
    // Add volumetric pulsing animation
    const pulse = 1 + Math.sin(time * driftSpeed * 2) * 0.05;
    group.current.scale.setScalar(pulse);
  });

  return <group ref={group} position={startPos}>{children}</group>;
};

// 3. The Main Scene
const Scene = () => {
  const scroll = useScroll();
  const shorelineRef = useRef<THREE.MeshBasicMaterial>(null);
  
  // Evening sky progression
  const bgRef = useRef<THREE.Color>(new THREE.Color('#3A7BD5'));
  const texture = useTexture(shorelineImg);
  const { scene, viewport } = useThree();

  useEffect(() => {
      scene.background = bgRef.current;
  }, [scene]);

  useFrame((state) => {
    const offset = scroll.offset; // 0 to 1
    
    // Smooth, cinematic curve to ease out of the sky
    const easeOutQuad = (x: number): number => {
      return 1 - (1 - x) * (1 - x);
    };
    
    // We want the start to be slow and majestic, then accelerate downwards smoothly
    // using basic power easing so we don't get stuck in the middle.
    const e = Math.pow(offset, 1.5); 
    
    // Camera dive trajectory
    // Start high in a bright blue sky, end low looking at the twilight Shoreline.
    const startY = 22;
    const startZ = 45;
    const endY = -45;
    const endZ = 15;
    
    const currentY = THREE.MathUtils.lerp(startY, endY, e);
    const currentZ = THREE.MathUtils.lerp(startZ, endZ, e);
    
    state.camera.position.set(0, currentY, currentZ);
    
    // Target to look at. Starts by looking slightly up at the 9 (at y=16)
    // Finishes looking deep down into the amphitheater (-45 y, -60 z)
    const lookAtY = THREE.MathUtils.lerp(16, -55, easeOutQuad(offset)); 
    const lookAtZ = THREE.MathUtils.lerp(-10, -60, easeOutQuad(offset));
    
    state.camera.lookAt(0, lookAtY, lookAtZ);

    // Background color shifts from bright sky blue to a magical dusk
    const startColor = new THREE.Color('#4DA8DA'); // Bright, uplifting sky blue
    const endColor = new THREE.Color('#3A2A55');   // Dusk transition
    bgRef.current.lerpColors(startColor, endColor, offset);
    scene.background = bgRef.current;

    // Reveal the Shoreline Amphitheater smoothly at the very end
    if (shorelineRef.current) {
      shorelineRef.current.opacity = THREE.MathUtils.smoothstep(offset, 0.7, 1.0);
    }
  });

  return (
    <>
      <Environment preset="sunset" />
      <ambientLight intensity={0.6} color="#ffffff" />
      <directionalLight position={[10, 20, 10]} intensity={1.5} color="#fff1e0" />
      <pointLight position={[0, 10, -5]} intensity={2.0} color="#ffb0ff" distance={40} />
      
      {/* 3D Immersive Majestic 9 */}
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.4}>
        <Text
          fontSize={35}
          color="#FFB800"
          anchorX="center"
          anchorY="bottom"
          position={[0, 16, -10]}
          font="https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf"
          fontWeight="700"
        >
          9
          <meshStandardMaterial 
            color="#FFB800"
            roughness={0.15}
            metalness={0.3}
            emissive="#FF8C00"
            emissiveIntensity={0.5}
          />
        </Text>
      </Float>

      {/* Volumetric Cloud Layers - Full at the top, scattering down with more variety! */}
      <Clouds material={THREE.MeshLambertMaterial} limit={400}>
        
        {/* The Cloud the '9' is sitting on */}
        <CloudGroup speed={12} startPos={[0, 14, -12]} driftSpeed={0.2}>
          <Cloud seed={1} segments={40} bounds={[20, 3, 12]} volume={20} color="#ffffff" opacity={0.9} />
        </CloudGroup>

        {/* Top Left Major Cloud Bank */}
        <CloudGroup speed={16} startPos={[-25, 25, -20]} driftSpeed={0.3}>
          <Cloud seed={2} segments={40} bounds={[35, 12, 25]} volume={30} color="#e6f0ff" opacity={0.8} />
        </CloudGroup>
        
        {/* Top Right Major Cloud Bank */}
        <CloudGroup speed={18} startPos={[25, 20, -15]} driftSpeed={0.4}>
          <Cloud seed={3} segments={45} bounds={[35, 12, 25]} volume={30} color="#ffffff" opacity={0.75} />
        </CloudGroup>
        
        {/* Mid-Dive Cloud (Tunnel effect) */}
        <CloudGroup speed={10} startPos={[-30, 0, -25]} driftSpeed={0.25}>
          <Cloud seed={4} segments={35} bounds={[30, 20, 20]} volume={25} color="#d4e0ff" opacity={0.65} />
        </CloudGroup>

        <CloudGroup speed={14} startPos={[30, -10, -20]} driftSpeed={0.35}>
          <Cloud seed={5} segments={35} bounds={[30, 20, 20]} volume={25} color="#ffe6f0" opacity={0.65} />
        </CloudGroup>
        
        {/* Low Clouds over the Amphitheater */}
        <CloudGroup speed={22} startPos={[-15, -35, -30]} driftSpeed={0.5}>
          <Cloud seed={6} segments={25} bounds={[40, 15, 25]} volume={30} color="#b090ff" opacity={0.5} />
        </CloudGroup>
        
        <CloudGroup speed={24} startPos={[15, -40, -25]} driftSpeed={0.6}>
          <Cloud seed={7} segments={25} bounds={[40, 15, 25]} volume={30} color="#ffccdd" opacity={0.45} />
        </CloudGroup>

      </Clouds>


      <Particles count={800} />

      {/* Massive Shoreline Reveal */}
      <mesh position={[0, -55, -25]} rotation={[-0.2, 0, 0]}>
        <planeGeometry args={[160, 90]} />
        <meshBasicMaterial 
          ref={shorelineRef}
          map={texture} 
          transparent 
          opacity={0}
          toneMapped={false} /* Prevents blowing out with Bloom */
        />
      </mesh>

      <EffectComposer>
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.5} intensity={0.6} />
      </EffectComposer>
    </>
  );
};

// 4. Final Component
export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#4DA8DA] select-none font-sans">
      <Canvas camera={{ position: [0, 25, 45], fov: 60, near: 0.1, far: 1000 }}>
        <React.Suspense fallback={null}>
          <ScrollControls pages={4} damping={0.3}>
            <Scene />
            
            <Scroll html style={{ width: '100%', height: '100%' }}>
              <div className="absolute top-[10vh] w-full flex flex-col items-center justify-center pointer-events-none">
                <style>
                  {`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');`}
                </style>
                <h1 
                  className="text-white text-6xl md:text-8xl font-black drop-shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-center tracking-normal"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  Shoreline in 9.
                </h1>
              </div>
              
              <div className="absolute top-[340vh] w-full flex flex-col items-center justify-center pointer-events-none">
                    <h2 
                        className="text-white text-6xl md:text-9xl font-bold tracking-tight text-center"
                        style={{ fontFamily: '"Playfair Display", serif', textShadow: '0 2px 40px rgba(0,0,0,0.7), 0 0px 120px rgba(0,0,0,0.4)' }}
                    >
                      See you at Shoreline.
                    </h2>
                    <p 
                      className="text-center text-white/95 mt-8 text-2xl md:text-3xl font-light tracking-[0.25em] uppercase"
                      style={{ textShadow: '0 2px 20px rgba(0,0,0,0.6)' }}
                    >
                      Google I/O 2026
                    </p>
              </div>
            </Scroll>

          </ScrollControls>
        </React.Suspense>
      </Canvas>
    </div>
  );
}
