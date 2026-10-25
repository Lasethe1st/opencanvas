import { Gltf, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Object3D } from 'three';
import type { ThreeObject, ThreeSceneDoc, Vec3 } from '../../../shared/three';
import type { ThreeTransformMode } from './types';

function GeometryOf({ primitive }: { primitive?: ThreeObject['primitive'] }) {
  switch (primitive) {
    case 'sphere':
      return <sphereGeometry args={[0.5, 32, 32]} />;
    case 'plane':
      return <planeGeometry args={[8, 8]} />;
    case 'cylinder':
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case 'torus':
      return <torusGeometry args={[0.45, 0.18, 16, 48]} />;
    case 'cone':
      return <coneGeometry args={[0.5, 1, 32]} />;
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

function MaterialOf({ object }: { object: ThreeObject }) {
  const m = object.material;
  if (m?.type === 'shader' && m.vertexShader && m.fragmentShader) {
    return <shaderMaterial vertexShader={m.vertexShader} fragmentShader={m.fragmentShader} />;
  }
  if (m?.type === 'basic') {
    return <meshBasicMaterial color={m.color} transparent={!!m.transparent} opacity={m.opacity ?? 1} />;
  }
  return (
    <meshStandardMaterial
      color={m?.color ?? '#8b9bb4'}
      metalness={m?.metalness ?? 0.1}
      roughness={m?.roughness ?? 0.55}
      transparent={!!m?.transparent}
      opacity={m?.opacity ?? 1}
    />
  );
}

function LightOf({ object }: { object: ThreeObject }) {
  const intensity = object.intensity ?? 1;
  const pos = object.position;
  switch (object.light) {
    case 'ambient':
      return <ambientLight intensity={intensity} />;
    case 'hemisphere':
      return <hemisphereLight intensity={intensity} position={pos} />;
    case 'point':
      return <pointLight intensity={intensity} position={pos} castShadow={!!object.castShadow} />;
    case 'spot':
      return <spotLight intensity={intensity} position={pos} castShadow={!!object.castShadow} />;
    default:
      return <directionalLight intensity={intensity} position={pos} castShadow={!!object.castShadow} />;
  }
}

function SceneObject({
  object,
  onSelect,
  register,
}: {
  object: ThreeObject;
  onSelect: (id: string) => void;
  register: (id: string, obj: Object3D | null) => void;
}) {
  const ref = useRef<Object3D>(null);
  useLayoutEffect(() => {
    register(object.id, ref.current);
    return () => register(object.id, null);
  }, [object.id, register]);

  if (!object.visible) return null;
  if (object.kind === 'light') return <LightOf object={object} />;
  if (object.kind === 'camera') return null;

  if (object.kind === 'gltf' && object.assetPath) {
    return (
      <Suspense fallback={null}>
        <group
          ref={ref}
          position={object.position}
          rotation={object.rotation}
          scale={object.scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(object.id);
          }}
        >
          <Gltf src={object.assetPath} />
        </group>
      </Suspense>
    );
  }

  if (object.kind === 'group') {
    return (
      <group
        ref={ref}
        name={object.name}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(object.id);
        }}
      />
    );
  }

  if (object.kind !== 'mesh') return null;
  return (
    <mesh
      ref={ref as never}
      name={object.name}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id);
      }}
    >
      <GeometryOf primitive={object.primitive} />
      <MaterialOf object={object} />
    </mesh>
  );
}

function WebGlCleanup() {
  const { gl, scene } = useThree();
  useEffect(() => {
    return () => {
      scene.traverse((obj) => {
        const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose?: () => void } | { dispose?: () => void }[] };
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) m.dispose?.();
        }
      });
      gl.dispose();
    };
  }, [gl, scene]);
  return null;
}

export function ThreeViewport({
  doc,
  transformMode,
  onSelect,
  onChange,
}: {
  doc: ThreeSceneDoc;
  transformMode: ThreeTransformMode;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<ThreeObject>) => void;
}) {
  const objectsRef = useRef(new Map<string, Object3D>());
  const [, bump] = useState(0);
  const selectedId = doc.selectedIds[0] ?? null;
  const selectedObj = selectedId ? objectsRef.current.get(selectedId) : null;
  const selectedMeta = useMemo(() => doc.objects.find((o) => o.id === selectedId) ?? null, [doc, selectedId]);

  const register = (id: string, obj: Object3D | null) => {
    if (obj) objectsRef.current.set(id, obj);
    else objectsRef.current.delete(id);
    bump((n) => n + 1);
  };

  const cam = doc.objects.find((o) => o.id === doc.activeCameraId) ?? doc.objects.find((o) => o.kind === 'camera');
  const canTransform =
    selectedObj &&
    selectedMeta &&
    !selectedMeta.locked &&
    (selectedMeta.kind === 'mesh' || selectedMeta.kind === 'group' || selectedMeta.kind === 'gltf');

  return (
    <div className="three-viewport" data-tw="">
      <Canvas
        shadows={doc.environment.shadows}
        dpr={[1, 1.75]}
        camera={{
          position: cam?.position ?? [4, 3, 6],
          fov: cam?.fov ?? 50,
          near: cam?.near ?? 0.1,
          far: cam?.far ?? 200,
        }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => onSelect(null)}
      >
        <WebGlCleanup />
        <color attach="background" args={[doc.environment.background]} />
        <ambientLight intensity={doc.environment.ambientIntensity} />
        {doc.environment.fog ? (
          <fog attach="fog" args={[doc.environment.fog.color, doc.environment.fog.near, doc.environment.fog.far]} />
        ) : null}
        {doc.objects.map((o) => (
          <SceneObject key={o.id} object={o} onSelect={(id) => onSelect(id)} register={register} />
        ))}
        {canTransform ? (
          <TransformControls
            object={selectedObj}
            mode={transformMode}
            onMouseUp={() => {
              const o = selectedObj;
              if (!o || !selectedId) return;
              onChange(selectedId, {
                position: o.position.toArray() as Vec3,
                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                scale: o.scale.toArray() as Vec3,
              });
            }}
          />
        ) : null}
        <OrbitControls makeDefault enableDamping />
        <gridHelper args={[20, 20, '#3a3f48', '#2a2e35']} />
      </Canvas>
    </div>
  );
}
