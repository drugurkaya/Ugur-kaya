import * as THREE from 'three';
import { CarDisplay } from '../render/Screens';
import { Area, type Shot } from './Area';
import { box, cyl, emissive, mat, physical } from './kit';
import { facade, roadTex, skyGradient } from './textures';

/** The commute: the protagonist's car on an empty Bursa road at dawn. The world scrolls past the car. */
export class CarArea extends Area {
  display = new CarDisplay();
  car = new THREE.Group();
  private scroll: THREE.Object3D[] = [];
  private roadMat!: THREE.MeshStandardMaterial;
  speed = 14;
  private wheels: THREE.Mesh[] = [];
  private t = 0;

  build() {
    this.walkable = false;
    this.ambience = 'car';
    this.grade = { tint: [0.92, 0.95, 1.1], lift: [0.01, 0.0, 0.03], contrast: 0.22, saturation: 0.95 };
    this.fog = { color: 0x1b2036, density: 0.012 };
    const g = this.group;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: skyGradient(0.35), side: THREE.BackSide, fog: false }));
    g.add(sky);
    g.add(new THREE.HemisphereLight(0x4a5f8f, 0x15100c, 0.5));
    const dawn = new THREE.DirectionalLight(0xffb98a, 0.6);
    dawn.position.set(30, 12, 80);
    g.add(dawn);

    this.roadMat = mat(0xffffff, { map: roadTex(), roughness: 0.6 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 400), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = 150;
    road.receiveShadow = true;
    g.add(road);
    const verge = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), mat(0x1a1d1a, { roughness: 1 }));
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(0, -0.02, 150);
    g.add(verge);

    // Streetlights and buildings scroll towards the car and wrap around.
    const poleMat = mat(0x3a3d42, { metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < 12; i++) {
      const pole = new THREE.Group();
      pole.add(cyl(0.08, 0.1, 7, poleMat, 0, 3.5, 0, 8));
      pole.add(box(1.6, 0.08, 0.1, poleMat, -0.8, 7, 0));
      pole.add(box(0.5, 0.08, 0.25, emissive(0xffc27a, 3), -1.5, 6.95, 0));
      pole.position.set(5.2, 0, i * 25);
      this.scroll.push(pole);
      g.add(pole);
    }
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      const w = 8 + (i % 3) * 4;
      const h = 10 + ((i * 5) % 4) * 6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), [
        new THREE.MeshBasicMaterial({ map: facade(i + 50, 0.22) }),
        new THREE.MeshBasicMaterial({ map: facade(i + 50, 0.22) }),
        new THREE.MeshBasicMaterial({ color: 0x15171d }),
        new THREE.MeshBasicMaterial({ color: 0x15171d }),
        new THREE.MeshBasicMaterial({ map: facade(i + 80, 0.22) }),
        new THREE.MeshBasicMaterial({ map: facade(i + 80, 0.22) }),
      ]);
      b.position.set(side * (14 + (i % 4) * 3), h / 2, (i / 2) * 25);
      this.scroll.push(b);
      g.add(b);
    }
    // Uludağ ahead, a minaret silhouette on the skyline
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(120, 55, 7), new THREE.MeshBasicMaterial({ color: 0x1b2036, fog: false }));
    mtn.position.set(60, 15, 260);
    g.add(mtn);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(28, 13, 7), new THREE.MeshBasicMaterial({ color: 0x6d7894, fog: false }));
    snow.position.set(60, 36.5, 260);
    g.add(snow);
    const minaret = new THREE.Group();
    minaret.add(cyl(0.7, 0.9, 30, new THREE.MeshBasicMaterial({ color: 0x0c0f1a }), 0, 15, 0, 8));
    minaret.add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 8), new THREE.MeshBasicMaterial({ color: 0x0c0f1a })));
    minaret.children[1].position.y = 32;
    minaret.position.set(-45, 0, 180);
    g.add(minaret);

    this.buildCar();
    g.add(this.car);
    this.addNpc('self', 0.37, 0.25, 0, 'drive', 0);
    // The protagonist is driven by the game's player object; this placeholder is replaced at runtime.
    this.npcs.self.root.visible = false;

    this.background = new THREE.Color(0x1b2036);
    this.spawns = { driver: { x: 0.37, z: 0.05, yaw: 0, y: 0.18 } };
  }

  private buildCar() {
    const c = this.car;
    const paint = physical(0x2b3a4f, { metalness: 0.7, roughness: 0.25, clearcoat: 1 });
    const dark = mat(0x16181c, { roughness: 0.7 });
    const leather = mat(0x2a2522, { roughness: 0.55 });
    // body shell
    c.add(box(1.85, 0.55, 4.4, paint, 0, 0.55, 0.2, 0.15));
    c.add(box(1.75, 0.2, 2.2, paint, 0, 1.38, -0.1, 0.1));
    // pillars and glass
    const glass = physical(0x8899aa, { transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
    for (const sx of [-0.85, 0.85]) {
      c.add(box(0.06, 0.55, 0.06, paint, sx, 1.1, 0.95));
      c.add(box(0.06, 0.55, 0.06, paint, sx, 1.1, -1.15));
      c.add(box(0.02, 0.5, 2.0, glass, sx, 1.08, -0.1));
    }
    const ws = box(1.66, 0.62, 0.02, glass, 0, 1.08, 1.05);
    ws.rotation.x = -0.55;
    c.add(ws);
    // interior: dashboard, wheel, seats, display
    c.add(box(1.7, 0.25, 0.5, dark, 0, 0.88, 0.95, 0.06));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 10, 28), leather);
    wheel.position.set(0.37, 0.98, 0.62);
    wheel.rotation.x = -0.35;
    c.add(wheel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: this.display.texture }));
    scr.position.set(0, 1.05, 0.83);
    scr.rotation.x = -0.4;
    scr.rotation.y = Math.PI;
    scr.rotation.set(-0.35, Math.PI, 0);
    c.add(scr);
    for (const sx of [0.37, -0.37]) {
      c.add(box(0.5, 0.12, 0.5, leather, sx, 0.42, 0.0, 0.05));
      const back = box(0.5, 0.7, 0.12, leather, sx, 0.8, -0.28, 0.05);
      back.rotation.x = -0.15;
      c.add(back);
    }
    // lights
    for (const sx of [-0.65, 0.65]) {
      c.add(box(0.3, 0.1, 0.05, emissive(0xffffff, 3), sx, 0.7, 2.42));
      c.add(box(0.3, 0.08, 0.05, emissive(0xff2a2a, 2), sx, 0.75, -2.02));
    }
    for (const [x, z] of [
      [0.85, 1.55],
      [-0.85, 1.55],
      [0.85, -1.2],
      [-0.85, -1.2],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18), mat(0x111111, { roughness: 0.8 }));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.33, z);
      c.add(w);
      this.wheels.push(w);
    }
    const head = new THREE.SpotLight(0xfff1d6, 30, 60, 0.45, 0.5, 1.2);
    head.position.set(0, 0.8, 2.4);
    head.target.position.set(0, 0, 20);
    c.add(head, head.target);
    const cabin = new THREE.PointLight(0x7aa0ff, 0.4, 2.2, 2);
    cabin.position.set(0, 1.1, 0.7);
    c.add(cabin);
  }

  shot(name: string): Shot | null {
    switch (name) {
      case 'carWide':
        return { pos: new THREE.Vector3(-4.5, 2.4, -7), target: new THREE.Vector3(0, 0.9, 3), fov: 45 };
      case 'carClose':
        return { pos: new THREE.Vector3(-0.25, 1.25, 0.75), target: new THREE.Vector3(0.37, 1.25, 0.05), fov: 50 };
      case 'carArrive':
        return { pos: new THREE.Vector3(3.5, 1.4, 8), target: new THREE.Vector3(0, 1.0, 0), fov: 50 };
    }
    return null;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    super.update(dt, playerPos);
    this.t += dt;
    this.display.tick(dt);
    const d = this.speed * dt;
    for (const o of this.scroll) {
      o.position.z -= d;
      if (o.position.z < -40) o.position.z += 300;
    }
    if (this.roadMat.map) this.roadMat.map.offset.y += d / 20;
    for (const w of this.wheels) w.rotation.x += d / 0.33;
    this.car.position.y = Math.sin(this.t * 13) * 0.004;
    this.car.rotation.z = Math.sin(this.t * 0.7) * 0.004;
  }
}
