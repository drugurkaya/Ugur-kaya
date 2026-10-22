import * as THREE from 'three';
import { MonitorScreen } from '../render/Screens';
import { Area, type Shot } from './Area';
import { box, cyl, emissive, mat, physical, plane, room, sphere } from './kit';
import { fabric, linoleum, tiles } from './textures';

/** Operating theatre 2: table along Z (patient's head towards -Z), surgeon on the patient's right (-X). */
export class ORArea extends Area {
  monitor = new MonitorScreen();
  private lampLights: THREE.SpotLight[] = [];

  build() {
    this.walkable = false;
    this.ambience = 'or';
    this.exposure = 0.85;
    const g = this.group;
    const c = this.colliders;
    const floor = mat(0xffffff, { map: linoleum(0x8a9a9c, [4, 4]), roughness: 0.25 });
    const wall = mat(0xffffff, { map: tiles(0x8fbcb4, 0x6f948d, 10, [3, 2]), roughness: 0.35 });
    g.add(room({ x: 0, z: 0, w: 8, d: 8, h: 3.2, floor, wall, ceiling: mat(0xe8eeee, { roughness: 1 }) }, c));
    g.add(new THREE.HemisphereLight(0xe6f2f2, 0x334040, 0.55));
    const ceilingPanel = box(3.2, 0.04, 3.2, emissive(0xeaf6ff, 0.9), 0, 3.18, 0);
    g.add(ceilingPanel);
    const fill = new THREE.PointLight(0xeaf6ff, 5, 12, 1.2);
    fill.position.set(0, 2.9, 1.5);
    g.add(fill);

    // Table and draped patient
    g.add(cyl(0.18, 0.28, 0.75, mat(0x6f7a80, { metalness: 0.6, roughness: 0.3 }), 0, 0.375, 0.2, 16));
    g.add(box(0.6, 0.12, 2.0, mat(0x2a2f33), 0, 0.82, 0.1, 0.02));
    const drape = mat(0xffffff, { map: fabric(0x2c7f6f, 'plain', 0xffffff, [3, 3]), roughness: 1 });
    g.add(box(0.95, 0.18, 1.6, drape, 0, 0.98, 0.45, 0.07));
    // anaesthesia screen (drape bar) near the head
    g.add(box(1.1, 0.03, 0.03, mat(0xcccccc, { metalness: 0.9 }), 0, 1.45, -0.55));
    g.add(box(1.0, 0.55, 0.02, drape, 0, 1.2, -0.56));
    // sterile field: retractor and lit opening
    g.add(box(0.32, 0.02, 0.36, mat(0x7a2a2a, { roughness: 0.4 }), 0, 1.08, -0.12));
    g.add(box(0.36, 0.03, 0.04, mat(0xd8dde0, { metalness: 1, roughness: 0.15 }), 0, 1.1, -0.32));
    g.add(box(0.36, 0.03, 0.04, mat(0xd8dde0, { metalness: 1, roughness: 0.15 }), 0, 1.1, 0.08));
    // head of the patient visible behind the screen
    const head = sphere(0.1, mat(0xc4a08e, { roughness: 0.6 }), 0, 0.98, -0.85);
    g.add(head);

    // Surgical lights
    for (const [x, z] of [
      [-0.5, -0.2],
      [0.55, 0.3],
    ]) {
      const arm = cyl(0.03, 0.03, 0.9, mat(0xd0d4d8, { metalness: 0.6 }), x, 2.75, z, 8);
      g.add(arm);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.12, 24), mat(0xe8ecee, { metalness: 0.3, roughness: 0.3 }));
      dish.position.set(x, 2.25, z);
      g.add(dish);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), emissive(0xffffff, 3));
      glow.rotation.x = Math.PI / 2;
      glow.position.set(x, 2.18, z);
      g.add(glow);
      const sp = new THREE.SpotLight(0xfffaf0, 28, 5, 0.35, 0.5, 1.0);
      sp.position.set(x, 2.15, z);
      sp.target.position.set(0, 1.0, -0.1);
      sp.castShadow = this.ctx.preset.shadows;
      sp.shadow.mapSize.setScalar(this.ctx.preset.shadowSize / 2);
      g.add(sp, sp.target);
      this.lampLights.push(sp);
    }

    // Anaesthesia machine with the live monitor
    g.add(box(0.7, 1.3, 0.6, mat(0xdfe5e8, { roughness: 0.35 }), -0.5, 0.65, -1.7, 0.04));
    g.add(box(0.62, 0.44, 0.06, mat(0x1d1f22), -0.5, 1.6, -1.55));
    const scr = plane(0.56, 0.38, new THREE.MeshBasicMaterial({ map: this.monitor.texture }));
    scr.position.set(-0.5, 1.6, -1.515);
    g.add(scr);
    // Heart-lung machine: console, roller pumps, reservoir
    const hlm = new THREE.Group();
    hlm.add(box(0.9, 0.8, 0.6, mat(0x3f4a52, { roughness: 0.4 }), 0, 0.4, 0, 0.03));
    for (let i = 0; i < 4; i++) {
      hlm.add(cyl(0.12, 0.12, 0.08, mat(0xb8c0c6, { metalness: 0.8, roughness: 0.25 }), -0.32 + i * 0.21, 0.86, 0, 18));
    }
    hlm.add(cyl(0.08, 0.06, 0.3, physical(0xffeeee, { transmission: 0.5, transparent: true, opacity: 0.6 }), 0.2, 1.35, 0.1));
    hlm.add(cyl(0.02, 0.02, 1.0, mat(0xcccccc, { metalness: 0.9 }), 0.3, 1.2, 0.0, 6));
    hlm.add(box(0.4, 0.3, 0.05, emissive(0x29d0a0, 0.7), -0.1, 1.25, 0.25));
    hlm.position.set(1.7, 0, 1.0);
    hlm.rotation.y = -Math.PI / 2;
    g.add(hlm);
    // Instrument table and cell saver
    g.add(box(1.0, 0.04, 0.6, mat(0xc8cfd4, { metalness: 0.8, roughness: 0.2 }), -1.4, 0.95, 1.2));
    g.add(box(0.95, 0.02, 0.55, drape, -1.4, 0.98, 1.2));
    for (let i = 0; i < 6; i++) g.add(box(0.015, 0.01, 0.18, mat(0xe0e4e8, { metalness: 1, roughness: 0.15 }), -1.75 + i * 0.12, 1.0, 1.2));
    g.add(box(0.5, 1.0, 0.5, mat(0xe8e8e8, { roughness: 0.3 }), 1.6, 0.5, -1.6, 0.04));
    // Wall monitors and clock
    g.add(box(1.2, 0.7, 0.05, mat(0x111111, { roughness: 0.2 }), -2.0, 2.0, -3.93));
    g.add(box(1.1, 0.6, 0.02, emissive(0x163a5a, 0.6), -2.0, 2.0, -3.9));

    // The team
    const murat = this.addNpc('murat', -0.5, -2.25, 0, 'idle');
    murat.root.position.set(0.3, 0, -1.35);
    murat.root.rotation.y = 0.2;
    const serkan = this.addNpc('serkan', 1.95, 0.4, -Math.PI / 2, 'type');
    const hulya = this.addNpc('hulya', -1.35, 0.75, Math.PI / 2 - 0.3, 'idle');
    const ece = this.addNpc('ece', 0.62, -0.05, -Math.PI / 2, 'surgeon');
    for (const n of [murat, serkan, hulya, ece]) {
      n.setOutfit('scrubs');
      n.setGear({ cap: true, mask: true });
    }
    this.background = new THREE.Color(0x0c1414);
    this.spawns = { surgeon: { x: -0.62, z: -0.1, yaw: Math.PI / 2 } };
  }

  shot(name: string): Shot | null {
    switch (name) {
      case 'orWide':
        return { pos: new THREE.Vector3(-2.6, 2.4, 2.6), target: new THREE.Vector3(0, 1.0, -0.2), fov: 50 };
      case 'orTable':
        return { pos: new THREE.Vector3(-0.25, 1.75, 0.55), target: new THREE.Vector3(0, 1.05, -0.15), fov: 45 };
      case 'orMonitor':
        return { pos: new THREE.Vector3(-0.35, 1.6, -0.9), target: new THREE.Vector3(-0.5, 1.6, -1.55), fov: 40 };
    }
    return null;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    super.update(dt, playerPos);
    this.monitor.tick(dt);
  }
}

/** Office used for the epilogue: legal counsel / head of department. */
export class OfficeArea extends Area {
  build() {
    this.walkable = false;
    this.ambience = 'office';
    const g = this.group;
    const c = this.colliders;
    g.add(room({ x: 0, z: 0, w: 5, d: 4.5, h: 2.8, floor: mat(0x6a5440, { roughness: 0.5 }), wall: mat(0xe4ddd0), ceiling: mat(0xf0eee8), windows: { n: [[0.6, 2.2, 0.9, 1.4]] } }, c));
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshBasicMaterial({ color: 0x9fc6e8 }));
    sky.position.set(0.6, 2, -4);
    g.add(sky);
    const hills = new THREE.Mesh(new THREE.ConeGeometry(5, 2.5, 5), new THREE.MeshBasicMaterial({ color: 0x5f7a6a }));
    hills.position.set(1.5, 0.6, -3.9);
    g.add(hills);
    g.add(new THREE.HemisphereLight(0xfff4e6, 0x4a4036, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.6);
    sun.position.set(1, 4, -6);
    sun.castShadow = this.ctx.preset.shadows;
    g.add(sun);
    const desk = mat(0x5a3d28, { roughness: 0.45 });
    g.add(box(1.8, 0.06, 0.9, desk, 0, 0.76, -0.6));
    g.add(box(0.06, 0.74, 0.8, desk, -0.85, 0.37, -0.6));
    g.add(box(0.06, 0.74, 0.8, desk, 0.85, 0.37, -0.6));
    g.add(box(0.45, 0.3, 0.03, mat(0x111111, { roughness: 0.2 }), 0.3, 1.0, -0.85));
    g.add(box(0.3, 0.02, 0.22, mat(0xf4f2ec), -0.3, 0.8, -0.5));
    for (let i = 0; i < 4; i++) g.add(box(1.2, 0.03, 0.3, desk, -2.2, 0.4 + i * 0.45, 1.4).rotateY(Math.PI / 2));
    for (let i = 0; i < 12; i++) g.add(box(0.05, 0.3, 0.22, mat([0x7a2a2a, 0x2a4a7a, 0x3a6a3a, 0x8a7a4a][i % 4]), -2.25, 0.57 + Math.floor(i / 4) * 0.45, 0.9 + (i % 4) * 0.25));
    const selin = this.addNpc('selin', 0, -1.3, 0, 'sit');
    selin.root.position.y = 0;
    this.addNpc('ergin', 1.6, -1.6, -0.4, 'cross');
    this.background = new THREE.Color(0x9fc6e8);
    this.spawns = { chair: { x: 0, z: 0.35, yaw: Math.PI } };
  }

  shot(name: string): Shot | null {
    if (name === 'office') return { pos: new THREE.Vector3(1.8, 1.6, 1.8), target: new THREE.Vector3(0, 1.0, -0.6), fov: 50 };
    return null;
  }
}
