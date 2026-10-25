import { createShaderMaterialDraft, type ThreeObject, type ThreeSceneDoc, type Vec3 } from '../../../shared/three';

function Num({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="three-inspector__field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function VecFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="three-inspector__vec">
      <span className="three-inspector__label">{label}</span>
      <div className="three-inspector__vec-row">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <Num
            key={axis}
            label={axis}
            value={value[i]}
            onChange={(n) => {
              const next: Vec3 = [...value];
              next[i] = n;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function ThreeInspector({
  doc,
  onPatchObject,
  onPatchEnv,
}: {
  doc: ThreeSceneDoc;
  onPatchObject: (id: string, patch: Partial<ThreeObject>) => void;
  onPatchEnv: (patch: Partial<ThreeSceneDoc['environment']>) => void;
}) {
  const selected = doc.objects.find((o) => o.id === doc.selectedIds[0]) ?? null;

  return (
    <div className="three-inspector">
      <section className="three-inspector__section">
        <h3>Environment</h3>
        <label className="three-inspector__field">
          <span>Background</span>
          <input
            type="color"
            value={doc.environment.background}
            onChange={(e) => onPatchEnv({ background: e.target.value })}
          />
        </label>
        <Num
          label="Ambient"
          value={doc.environment.ambientIntensity}
          step={0.05}
          onChange={(n) => onPatchEnv({ ambientIntensity: n })}
        />
        <label className="three-inspector__check">
          <input
            type="checkbox"
            checked={doc.environment.shadows}
            onChange={(e) => onPatchEnv({ shadows: e.target.checked })}
          />
          Shadows
        </label>
      </section>

      {!selected ? (
        <p className="three-inspector__empty">Select an object to edit transforms, materials, and lights.</p>
      ) : (
        <section className="three-inspector__section">
          <h3>{selected.name}</h3>
          <p className="three-inspector__meta">{selected.kind}{selected.primitive ? ` · ${selected.primitive}` : ''}{selected.light ? ` · ${selected.light}` : ''}</p>
          <VecFields label="Position" value={selected.position} onChange={(position) => onPatchObject(selected.id, { position })} />
          <VecFields label="Rotation" value={selected.rotation} onChange={(rotation) => onPatchObject(selected.id, { rotation })} />
          <VecFields label="Scale" value={selected.scale} onChange={(scale) => onPatchObject(selected.id, { scale })} />

          {selected.kind === 'mesh' && selected.material ? (
            <>
              <label className="three-inspector__field">
                <span>Color</span>
                <input
                  type="color"
                  value={selected.material.color}
                  onChange={(e) =>
                    onPatchObject(selected.id, { material: { ...selected.material!, color: e.target.value } })
                  }
                />
              </label>
              <Num
                label="Metalness"
                value={selected.material.metalness ?? 0}
                step={0.05}
                onChange={(metalness) => onPatchObject(selected.id, { material: { ...selected.material!, metalness } })}
              />
              <Num
                label="Roughness"
                value={selected.material.roughness ?? 0.5}
                step={0.05}
                onChange={(roughness) => onPatchObject(selected.id, { material: { ...selected.material!, roughness } })}
              />
              <button
                type="button"
                className="three-inspector__btn"
                onClick={() =>
                  onPatchObject(selected.id, {
                    material: { ...selected.material!, ...createShaderMaterialDraft(selected.material!.color) },
                  })
                }
              >
                Use shader material
              </button>
              {selected.material.type === 'shader' ? (
                <>
                  <label className="three-inspector__area">
                    <span>Vertex shader</span>
                    <textarea
                      rows={5}
                      value={selected.material.vertexShader ?? ''}
                      onChange={(e) =>
                        onPatchObject(selected.id, {
                          material: { ...selected.material!, vertexShader: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="three-inspector__area">
                    <span>Fragment shader</span>
                    <textarea
                      rows={6}
                      value={selected.material.fragmentShader ?? ''}
                      onChange={(e) =>
                        onPatchObject(selected.id, {
                          material: { ...selected.material!, fragmentShader: e.target.value },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </>
          ) : null}

          {selected.kind === 'light' ? (
            <>
              <Num
                label="Intensity"
                value={selected.intensity ?? 1}
                step={0.05}
                onChange={(intensity) => onPatchObject(selected.id, { intensity })}
              />
              <label className="three-inspector__check">
                <input
                  type="checkbox"
                  checked={!!selected.castShadow}
                  onChange={(e) => onPatchObject(selected.id, { castShadow: e.target.checked })}
                />
                Cast shadow
              </label>
            </>
          ) : null}

          {selected.kind === 'camera' ? (
            <>
              <Num label="FOV" value={selected.fov ?? 50} step={1} onChange={(fov) => onPatchObject(selected.id, { fov })} />
              <Num label="Near" value={selected.near ?? 0.1} step={0.01} onChange={(near) => onPatchObject(selected.id, { near })} />
              <Num label="Far" value={selected.far ?? 200} step={1} onChange={(far) => onPatchObject(selected.id, { far })} />
            </>
          ) : null}

          {selected.kind === 'gltf' ? (
            <label className="three-inspector__field three-inspector__field--wide">
              <span>Asset path</span>
              <input
                type="text"
                value={selected.assetPath ?? ''}
                onChange={(e) => onPatchObject(selected.id, { assetPath: e.target.value || null })}
              />
            </label>
          ) : null}
        </section>
      )}
    </div>
  );
}
