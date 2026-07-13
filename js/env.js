// ============================================================
// MOOSE RACER — shared PMREM environment for car-paint
// reflections: a tiny procedural "studio sky" with bright
// softbox highlights, prefiltered once at boot.
// ============================================================
import * as THREE from 'three';

let _env = null;

export function initEnv(renderer) {
  if (_env) return _env;
  const scene = new THREE.Scene();
  // gradient dome: warm bright top, cool dim floor
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y * 0.5 + 0.5;
        vec3 col = mix(vec3(0.18, 0.16, 0.30), vec3(0.95, 0.98, 1.1), smoothstep(0.15, 0.9, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 16, 12), domeMat));
  // softbox highlight panels — these become the glints on the clearcoat
  const panel = (w, h, intensity, x, y, z, ry) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity) }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(18, 6, 2.2, 0, 14, -12, 0);
  panel(10, 4, 1.6, -16, 8, 6, 0);
  panel(10, 4, 1.3, 16, 8, 6, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  _env = pmrem.fromScene(scene, 0.05).texture;
  pmrem.dispose();
  return _env;
}

export function getEnv() { return _env; }
