// Development-only scene for inspecting models and poses (not part of the game build).
// ?sheet=phantom:idle@0,ironfang:f_jab@7&yaw=30
import * as THREE from 'three';
import { buildCharacter } from './characters/appearance';
import { getClips, sampleClip } from './characters/clips';
import { createPose, PoseApplier } from './characters/Pose';
import { Renderer } from './render/Renderer';
import { Arena } from './world/Arena';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const r = new Renderer(canvas, scene, camera);
const arena = new Arena(scene, r.webgl, 256, () => {});
const sheet = (params.get('sheet') ?? 'phantom:idle@0,ironfang:idle@0').split(',');
const spacing = Number(params.get('spacing') ?? 1.5);
const facing = Number(params.get('face') ?? 0) * Math.PI / 180;
const labels = document.createElement('div');
labels.style.cssText = 'position:fixed;left:0;right:0;bottom:4px;display:flex;justify-content:space-around;color:#fff;font:12px monospace';
document.body.appendChild(labels);
const models = sheet.map((entry, i) => {
  const [id, rest] = entry.split(':');
  const [clipName, frame] = (rest ?? 'idle@0').split('@');
  const m = buildCharacter(id as 'phantom' | 'ironfang', 256);
  m.root.position.set((i - (sheet.length - 1) / 2) * spacing, 0, 0);
  m.root.rotation.y = facing;
  if (id === 'ironfang') m.root.scale.setScalar(1.1);
  scene.add(m.root);
  for (const rb of m.ribbons) scene.add(rb.mesh);
  const pose = createPose();
  const clip = getClips(m.id)[clipName];
  if (clip) sampleClip(clip, Number(frame ?? 0), pose);
  new PoseApplier(m.skel).apply(pose);
  const l = document.createElement('span');
  l.textContent = `${clipName}@${frame}`;
  labels.appendChild(l);
  return m;
});
const yaw = Number(params.get('yaw') ?? 0) * Math.PI / 180;
const dist = Number(params.get('dist') ?? Math.max(4.5, sheet.length * spacing * 1.9));
const ty = Number(params.get('ty') ?? 1.0);
camera.position.set(Math.sin(yaw) * dist, ty + Number(params.get('cy') ?? 0.3), Math.cos(yaw) * dist);
camera.lookAt(0, ty, 0);
camera.aspect = innerWidth / innerHeight;
camera.updateProjectionMatrix();
if (params.get('noshadow')) r.webgl.shadowMap.enabled = false;
if (params.get('norefl')) arena.reflection.enabled = false;
let frames = 0;
function loop() {
  arena.update(1 / 60);
  for (const m of models) for (const rb of m.ribbons) rb.update(1 / 60, new THREE.Vector3(0.5, 0, 0));
  arena.reflection.update(r.webgl, scene, camera, [arena.floor]);
  r.render(1 / 60);
  frames++;
  if (frames === 20) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(loop);
}
loop();
