import * as THREE from 'three';
import { L } from '../narrative/content/helpers';
import { MonitorScreen } from '../render/Screens';
import { Area, type Shot } from './Area';
import { box, cyl, emissive, mat, physical, plane, room, solid, sphere } from './kit';
import { fabric, linoleum, paint, signTexture, skyGradient, tiles } from './textures';

/**
 * Yeşilvadi Training and Research Hospital (fictional).
 *
 *   plaza     z 5..14 (outside the entrance)
 *   lobby     x -5..5,   z 0..5
 *   corridor  x -1.2..1.2, z -16..0
 *   waiting   x 1.2..6.2, z -9..-3 (family waiting room)
 *   ICU       x -6..6,   z -26..-16
 */
export class HospitalArea extends Area {
  monitor = new MonitorScreen();
  drainLevel!: THREE.Mesh;
  private skyMat!: THREE.MeshBasicMaterial;
  evening = false;

  build() {
    this.ambience = 'hospital';
    this.exposure = 0.82;
    this.grade = { tint: [0.95, 1.02, 1.03], contrast: 0.18, saturation: 0.88 };
    this.fog = { color: 0xcfd8dc, density: 0.008 };
    const g = this.group;
    const c = this.colliders;
    const lino = mat(0xffffff, { map: linoleum(0xb9c4c6, [6, 6]), roughness: 0.22, metalness: 0.0 });
    const linoICU = mat(0xffffff, { map: linoleum(0xa9c2bf, [8, 6]), roughness: 0.2 });
    const wall = mat(0xffffff, { map: paint(0xe4e8e6) });
    const wallLobby = mat(0xffffff, { map: paint(0xd9e2e8) });
    const ceiling = mat(0xf0f2f2, { roughness: 1 });

    g.add(room({ x: 0, z: 2.5, w: 10, d: 5, h: 3.2, floor: lino, wall: wallLobby, ceiling, doors: { s: [[0, 2.2]], n: [[0, 2.4]] } }, c));
    g.add(room({ x: 0, z: -8, w: 2.4, d: 16, h: 2.8, floor: lino, wall, ceiling, open: ['s', 'n'], doors: { e: [[2, 1.4]] } }, c));
    g.add(room({ x: 3.7, z: -6, w: 5, d: 6, h: 2.8, floor: lino, wall: mat(0xffffff, { map: paint(0xe8e0d0) }), ceiling, open: ['w'], windows: { e: [[0, 2.6, 0.9, 1.4]] } }, c));
    g.add(room({ x: 0, z: -21, w: 12, d: 10, h: 3.0, floor: linoICU, wall, ceiling, doors: { s: [[0, 2.0]] } }, c));

    this.buildExterior();
    this.buildLobby();
    this.buildCorridor();
    this.buildWaiting();
    this.buildICU();

    g.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3a3a, 0.35));
    const sun = new THREE.DirectionalLight(0xffc89a, 0.6);
    sun.position.set(10, 8, 20);
    sun.target.position.set(0, 0, 5);
    sun.castShadow = this.ctx.preset.shadows;
    sun.shadow.mapSize.setScalar(this.ctx.preset.shadowSize);
    g.add(sun, sun.target);
    // Fluorescent ceiling lights; the number of real lights depends on the preset.
    const lightSpots: [number, number, number][] = [
      [0, 2.5, 2.9],
      [0, -4, 2.6],
      [0, -11, 2.6],
      [3.7, -6, 2.6],
      [-2.5, -20, 2.8],
      [2.5, -22.5, 2.8],
    ];
    lightSpots.forEach(([x, z, y], i) => {
      if (this.ctx.preset.lights === 0 && i % 2 === 1) return;
      const l = new THREE.PointLight(0xf2f7ff, this.ctx.preset.lights === 0 ? 4.5 : 3, 11, 1.3);
      l.position.set(x, y - 0.2, z);
      if (i === 5 && this.ctx.preset.shadows) l.castShadow = true;
      g.add(l);
    });

    this.spawns = {
      plaza: { x: 0, z: 10, yaw: Math.PI },
      icuBed: { x: 1.2, z: -21.6, yaw: Math.PI },
      waiting: { x: 3.7, z: -6.35, yaw: Math.PI },
      corridor: { x: 0, z: -12, yaw: Math.PI },
    };

    // Staff in the ICU, the patient in bed 3, the guard in the lobby
    this.addNpc('guard', -3.2, 2.6, Math.PI / 2, 'idle');
    this.addNpc('zeynep', 3.0, -22.7, -Math.PI / 2 - 0.4, 'idle');
    this.addNpc('ece', 0.0, -22.3, Math.PI / 2 + 0.3, 'cross');
    const ahmet = this.addNpc('ahmet', 1.5, -21.9, 0, 'lie', 0.82);
    ahmet.root.rotation.set(-Math.PI / 2, 0, 0);
    ahmet.expression = 'sleep';

    this.interactables.push(
      { id: 'guard', pos: new THREE.Vector3(-2.4, 0, 2.6), radius: 1.4, label: L('Hikmet Bey', 'Hikmet'), dialogue: 'guard', when: (s) => !s.done('dlg:guard') && !this.evening },
      { id: 'sanitizer', pos: new THREE.Vector3(-1.0, 0, -14.8), radius: 0.9, label: L('El antiseptiği', 'Hand rub'), dialogue: 'handHygiene', when: (s) => !s.flag('handHygiene') },
      { id: 'icu', pos: new THREE.Vector3(1.5, 0, -20.6), radius: 2.2, label: L('Ahmet Bey\'in yatağı', "Ahmet's bedside"), dialogue: 'icu', when: (s) => !s.flag('arrivedHospital') },
    );
    this.collectBlockers();
  }

  private buildExterior() {
    const g = this.group;
    this.skyMat = new THREE.MeshBasicMaterial({ map: skyGradient(0.55), side: THREE.BackSide, fog: false });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(120, 24, 12), this.skyMat));
    const asphalt = plane(40, 14, mat(0x2a2c30, { roughness: 0.9 }));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(0, -0.01, 12);
    g.add(asphalt);
    // Facade with the entrance opening (2.2 m wide, 2.6 m high) in front of the lobby doors.
    const facadeMat = mat(0xffffff, { map: tiles(0xd8d2c4, 0xb0a898, 6, [4, 3]) });
    g.add(box(13.9, 9, 0.4, facadeMat, -8.05, 4.5, 5.25));
    g.add(box(13.9, 9, 0.4, facadeMat, 8.05, 4.5, 5.25));
    g.add(box(2.2, 6.4, 0.4, facadeMat, 0, 5.8, 5.25));
    this.colliders.push({ minX: -15, maxX: -1.1, minZ: 5.0, maxZ: 5.45 }, { minX: 1.1, maxX: 15, minZ: 5.0, maxZ: 5.45 });
    const canopy = box(6, 0.25, 3, mat(0xdfe3e6), 0, 3.3, 6.6);
    g.add(canopy);
    for (const x of [-2.8, 2.8]) g.add(cyl(0.08, 0.08, 3.3, mat(0x9aa3a8, { metalness: 0.7 }), x, 1.65, 7.9));
    const sign = plane(8, 1.0, new THREE.MeshBasicMaterial({ map: signTexture(['YEŞİLVADİ EĞİTİM VE ARAŞTIRMA HASTANESİ'], { bg: '#0d4f7a', w: 1024, h: 128 }) }));
    sign.position.set(0, 5.6, 5.47);
    g.add(sign);
    const acil = plane(1.8, 0.6, new THREE.MeshBasicMaterial({ map: signTexture(['ACİL'], { bg: '#c0141c', w: 256, h: 96 }) }));
    acil.position.set(-3.8, 3.0, 5.47);
    g.add(acil);
    // parked car and kerb
    g.add(box(1.8, 1.2, 4.2, physical(0x2b3a4f, { metalness: 0.7, roughness: 0.3, clearcoat: 1 }), 6, 0.6, 11, 0.2));
    this.colliders.push({ minX: 5.1, maxX: 6.9, minZ: 8.9, maxZ: 13.1 });
    g.add(box(40, 0.15, 0.3, mat(0x9a9a9a), 0, 0.075, 14.2));
    this.colliders.push({ minX: -20, maxX: 20, minZ: 14, maxZ: 14.5 }, { minX: -20, maxX: -9, minZ: 5, maxZ: 14 }, { minX: 9, maxX: 20, minZ: 5, maxZ: 14 });
  }

  private buildLobby() {
    const g = this.group;
    const c = this.colliders;
    // security desk
    g.add(box(1.6, 1.05, 0.7, mat(0x3c4d5c, { roughness: 0.4 }), -3.6, 0.525, 2.6, 0.03));
    g.add(box(1.7, 0.04, 0.78, mat(0xe0e0e0, { roughness: 0.2 }), -3.6, 1.07, 2.6));
    solid(c, -3.6, 2.6, 0.85, 0.4);
    // waiting chairs
    for (let i = 0; i < 4; i++) {
      g.add(box(0.5, 0.06, 0.5, mat(0x2f6f9f), 3.0 + i * 0.55, 0.45, 1.0));
      g.add(box(0.5, 0.5, 0.06, mat(0x2f6f9f), 3.0 + i * 0.55, 0.72, 0.77));
    }
    solid(c, 3.8, 1.0, 1.2, 0.3);
    const sign = plane(1.6, 0.4, new THREE.MeshBasicMaterial({ map: signTexture(['↑ YOĞUN BAKIM · AMELİYATHANE'], { bg: '#0d4f7a', w: 512, h: 128 }) }));
    sign.position.set(0, 2.5, 0.07);
    g.add(sign);
    // plant
    g.add(cyl(0.25, 0.2, 0.45, mat(0x6b5a4a), 4.5, 0.225, 4.4));
    g.add(sphere(0.45, mat(0x2f5f34, { roughness: 0.9 }), 4.5, 0.9, 4.4));
    solid(c, 4.5, 4.4, 0.3, 0.3);
  }

  private buildCorridor() {
    const g = this.group;
    const panel = emissive(0xf4f8ff, 1.6);
    for (let z = -1.5; z > -16; z -= 2.5) g.add(box(0.6, 0.02, 1.2, panel, 0, 2.79, z));
    // handrails and doors
    const rail = mat(0xb8a080, { roughness: 0.5 });
    g.add(box(0.05, 0.05, 15.5, rail, -1.13, 0.9, -8));
    const doorMat = mat(0x8fa9b8, { roughness: 0.4 });
    for (const [z, label] of [
      [-3.5, 'SERVİS 4'],
      [-9.5, 'EKO'],
      [-13, 'DOKTOR ODASI'],
    ] as const) {
      g.add(box(0.05, 2.1, 1.0, doorMat, -1.16, 1.05, z));
      const s = plane(0.7, 0.18, new THREE.MeshBasicMaterial({ map: signTexture([label], { bg: '#ffffff', fg: '#0d4f7a', w: 256, h: 64 }) }));
      s.position.set(-1.13, 2.25, z);
      s.rotation.y = Math.PI / 2;
      g.add(s);
    }
    // sanitizer dispenser near the ICU
    g.add(box(0.12, 0.22, 0.1, mat(0xf2f2f2), -1.14, 1.3, -14.8));
    g.add(box(0.06, 0.04, 0.04, mat(0x2a7fd4), -1.1, 1.18, -14.8));
    const icuSign = plane(2.2, 0.35, new THREE.MeshBasicMaterial({ map: signTexture(['KALP DAMAR CERRAHİSİ YOĞUN BAKIM'], { bg: '#0d4f7a', w: 1024, h: 160 }) }));
    icuSign.position.set(0, 2.45, -15.9);
    icuSign.rotation.y = 0;
    g.add(icuSign);
    // sliding doors (open)
    const glass = physical(0xcfe8ff, { transmission: 0.7, roughness: 0.1, transparent: true, opacity: 0.35 });
    g.add(box(1.0, 2.1, 0.04, glass, -1.5, 1.05, -16.0));
    g.add(box(1.0, 2.1, 0.04, glass, 1.5, 1.05, -16.0));
  }

  private buildWaiting() {
    const g = this.group;
    const c = this.colliders;
    const seat = mat(0x8a3f3a, { roughness: 0.6 });
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4; i++) {
        const x = 3.0 + i * 0.6;
        const z = -7.6 + r * 2.4;
        g.add(box(0.5, 0.06, 0.5, seat, x, 0.45, z));
        g.add(box(0.5, 0.5, 0.06, seat, x, 0.72, z - 0.23));
        g.add(box(0.04, 0.45, 0.04, mat(0x777777, { metalness: 0.8 }), x, 0.22, z));
      }
    solid(c, 3.9, -7.6, 1.25, 0.3);
    solid(c, 3.9, -5.2, 1.25, 0.3);
    g.add(box(0.7, 1.8, 0.7, mat(0x1e5f8f, { roughness: 0.3 }), 5.7, 0.9, -8.5, 0.03));
    g.add(box(0.5, 1.0, 0.02, emissive(0xbfe0ff, 0.6), 5.7, 1.1, -8.14));
    solid(c, 5.7, -8.5, 0.35, 0.35);
    g.add(box(1.0, 0.6, 0.05, mat(0x050505, { roughness: 0.2 }), 3.7, 2.0, -8.95));
  }

  private buildICU() {
    const g = this.group;
    const c = this.colliders;
    const curtain = mat(0xffffff, { map: fabric(0x7fb3b0, 'check', 0xd8f0ee, [2, 3]), roughness: 1, side: THREE.DoubleSide });
    const bedMat = mat(0xdfe3e6, { roughness: 0.4, metalness: 0.2 });
    const sheet = mat(0xffffff, { map: fabric(0xe8f0f4, 'plain'), roughness: 1 });
    const bays = [-4.5, -1.5, 1.5, 4.5];
    for (const [i, x] of bays.entries()) {
      // bed
      g.add(box(1.0, 0.55, 2.1, bedMat, x, 0.45, -23.8, 0.04));
      g.add(box(0.95, 0.12, 2.0, sheet, x, 0.78, -23.8, 0.05));
      g.add(box(1.0, 0.35, 0.06, bedMat, x, 0.95, -24.85));
      solid(c, x, -23.8, 0.55, 1.1);
      // curtains between bays
      if (i < 3) {
        const geo = new THREE.PlaneGeometry(2.6, 2.1, 20, 1);
        const pos = geo.attributes.position;
        for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 9) * 0.05);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, curtain);
        m.rotation.y = Math.PI / 2;
        m.position.set(x + 1.5, 1.35, -24.2);
        g.add(m);
      }
      // monitors (only bed 3 is live)
      const mon = box(0.62, 0.42, 0.06, mat(0x1d1f22), x + 0.8, 1.75, -25.5);
      g.add(mon);
      const scr = plane(0.56, 0.36, i === 2 ? new THREE.MeshBasicMaterial({ map: this.monitor.texture }) : emissive(0x0a1a12, 0.6));
      scr.position.set(x + 0.8, 1.75, -25.465);
      g.add(scr);
      // IV pole
      g.add(cyl(0.015, 0.015, 2.0, mat(0xcccccc, { metalness: 0.9, roughness: 0.2 }), x - 0.75, 1.0, -23.0, 6));
      g.add(box(0.12, 0.2, 0.03, physical(0xeef6ff, { transmission: 0.6, transparent: true, opacity: 0.7 }), x - 0.75, 1.8, -23.0));
    }
    // Ventilator and chest-drain canister at bed 3
    g.add(box(0.45, 1.2, 0.45, mat(0xe9edf0, { roughness: 0.3 }), 0.4, 0.6, -25.2, 0.04));
    g.add(box(0.3, 0.2, 0.02, emissive(0x2fd0ff, 0.8), 0.4, 1.0, -24.97));
    g.add(box(0.22, 0.3, 0.12, physical(0xf4f4f4, { transmission: 0.5, transparent: true, opacity: 0.6 }), 2.2, 0.2, -23.0));
    this.drainLevel = box(0.2, 0.1, 0.1, mat(0x7a0a10, { roughness: 0.3 }), 2.2, 0.1, -23.0);
    g.add(this.drainLevel);
    // Nurse station
    g.add(box(3.0, 1.05, 0.8, mat(0x4f6f7f, { roughness: 0.4 }), -3.0, 0.525, -17.6, 0.04));
    g.add(box(3.1, 0.04, 0.9, mat(0xf0f0f0, { roughness: 0.2 }), -3.0, 1.07, -17.6));
    g.add(box(0.5, 0.35, 0.04, emissive(0x7fb2ff, 0.5), -3.4, 1.3, -17.7));
    solid(c, -3.0, -17.6, 1.55, 0.45);
    const sign = plane(1.2, 0.3, new THREE.MeshBasicMaterial({ map: signTexture(['YATAK 3'], { bg: '#ffffff', fg: '#0d4f7a', w: 256, h: 64 }) }));
    sign.position.set(1.5, 2.4, -25.93);
    g.add(sign);
    const panel = emissive(0xf4f8ff, 1.4);
    for (const x of [-3, 3]) for (const z of [-18.5, -23]) g.add(box(1.2, 0.02, 0.6, panel, x, 2.99, z));
  }

  shot(name: string): Shot | null {
    switch (name) {
      case 'monitor':
        return { pos: new THREE.Vector3(1.4, 1.75, -23.6), target: new THREE.Vector3(2.3, 1.72, -25.5), fov: 40 };
      case 'family':
        return { pos: new THREE.Vector3(2.1, 1.65, -5.3), target: new THREE.Vector3(3.95, 1.05, -7.1), fov: 48 };
      case 'corridor':
        return { pos: new THREE.Vector3(0.4, 1.7, -1), target: new THREE.Vector3(0, 1.3, -15), fov: 50 };
    }
    return null;
  }

  /** Re-arrange the scene for the family meeting or the evening. */
  setMode(mode: 'arrival' | 'family' | 'evening') {
    const ensure = (id: string, x: number, z: number, yaw: number, pose: 'idle' | 'sit' | 'cross' = 'idle') => {
      const n = this.npcs[id] ?? this.addNpc(id, x, z, yaw, pose);
      n.root.position.set(x, 0, z);
      n.root.rotation.y = yaw;
      n.pose = pose;
      return n;
    };
    if (mode === 'family') {
      ensure('sevim', 3.6, -7.45, 0, 'sit');
      ensure('burak', 4.55, -7.05, -0.9);
      this.npcs.ece?.root.position.set(0.3, 0, -19);
    }
    if (mode === 'evening') {
      this.evening = true;
      this.skyMat.map = skyGradient(0.25);
      ensure('ece', -0.4, -9.5, 0.2);
      ensure('murat', 0.6, -10.6, Math.PI + 0.4);
      for (const id of ['sevim', 'burak']) if (this.npcs[id]) this.npcs[id].root.visible = false;
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    super.update(dt, playerPos);
    this.monitor.tick(dt);
    if (this.monitor.patient && this.drainLevel) {
      const lvl = Math.min(1, this.monitor.patient.drainTotal / 2500);
      this.drainLevel.scale.y = 0.2 + lvl * 2.6;
      this.drainLevel.position.y = 0.06 + (0.2 + lvl * 2.6) * 0.05;
    }
  }
}
