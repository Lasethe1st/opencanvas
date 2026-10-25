/** Default GLSL snippets for custom shader materials in the 3D editor. */

export const DEFAULT_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`.trim();

export const DEFAULT_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
void main() {
  vec3 col = 0.5 + 0.5 * cos(uTime + vUv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(col, 1.0);
}
`.trim();

export function createShaderMaterialDraft(colorHint = '#6ea8fe'): {
  type: 'shader';
  color: string;
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    type: 'shader',
    color: colorHint,
    vertexShader: DEFAULT_VERTEX_SHADER,
    fragmentShader: DEFAULT_FRAGMENT_SHADER,
  };
}
