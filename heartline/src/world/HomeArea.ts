import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { ClockFace, PhoneScreen } from '../render/Screens';
import { L } from '../narrative/content/helpers';
import { Area, type Shot } from './Area';
import { box, cyl, emissive, mat, physical, plane, room, solid, sphere } from './kit';
import { artwork, fabric, facade, marble, paint, skyGradient, tiles, woodFloor } from './textures';

/**
 * The Arslan family apartment in Nilüfer, Bursa, before sunrise.
 *
 *   bedroom  x -5.5..-0.5, z -2.3..2.3   (bed against the north wall)
 *   bathroom x -5.5..-3.0, z  2.3..4.7   (door in the bedroom's south wall)
 *   hallway  x -0.5.. 1.5, z -2.3..4.7   (front door in the south wall)
 *   kitchen  x  1.5.. 7.5, z -2.3..3.3   (living/dining, open to the hallway)
 */
export class HomeArea extends Area {
  phone = new PhoneScreen();
  clock = new ClockFace();
  phoneMesh!: THREE.Mesh;
  phoneLight!: THREE.PointLight;
  lampLight!: THREE.PointLight;
  lampShade!: THREE.MeshStandardMaterial;
  private skyMat!: THREE.MeshBasicMaterial;
  private skyT = -1;
  private vibrate = 0;

  build() {
    this.ambience = 'home';
    const g = this.group;
    const c = this.colliders;
    const wallBed = mat(0xffffff, { map: paint(0xb9b0a6) });
    const wallHall = mat(0xffffff, { map: paint(0xd8d0c4) });
    const wallKitchen = mat(0xffffff, { map: paint(0xe2dccd) });
    const ceiling = mat(0xf2efe9, { roughness: 1 });
    const wood = mat(0xffffff, { map: woodFloor(0x8a6242, [3, 3]), roughness: 0.55 });
    const tile = mat(0xffffff, { map: tiles(0xd9dde0, 0x9aa0a6, 8, [2, 2]), roughness: 0.35 });
    const tileWall = mat(0xffffff, { map: tiles(0xe8ecee, 0xb9bfc4, 10, [2, 2]), roughness: 0.3 });

    g.add(room({ x: -3, z: 0, w: 5, d: 4.6, floor: wood, wall: wallBed, ceiling, doors: { s: [[-1.25, 0.85]] }, open: ['e'], windows: { w: [[0.4, 1.6, 0.85, 1.35]] } }, c));
    g.add(room({ x: -4.25, z: 3.5, w: 2.5, d: 2.4, floor: tile, wall: tileWall, ceiling, open: ['n'] }, c));
    g.add(room({ x: 0.5, z: 1.2, w: 2, d: 7, floor: wood, wall: wallHall, ceiling, doors: { w: [[-0.4, 0.95]], e: [[-1.2, 1.6]], s: [[0, 0.95]] } }, c));
    g.add(room({ x: 4.5, z: 0.5, w: 6, d: 5.6, floor: wood, wall: wallKitchen, ceiling, open: ['w'], windows: { e: [[-0.6, 2.0, 0.9, 1.4]] } }, c));
    // Walls closing the gap between bathroom and hallway (x -3..-0.5, z 4.7) are exterior.

    this.buildBedroom();
    this.buildBathroom();
    this.buildHall();
    this.buildKitchen();
    this.buildOutside();

    // Lights
    const hemi = new THREE.HemisphereLight(0x2a3a66, 0x120c08, 0.35);
    g.add(hemi);
    const moon = new THREE.DirectionalLight(0x7f9cff, 0.55);
    moon.position.set(-9, 5, 1);
    moon.target.position.set(-3, 0, 0);
    moon.castShadow = this.ctx.preset.shadows;
    moon.shadow.mapSize.setScalar(this.ctx.preset.shadowSize);
    moon.shadow.camera.left = -6;
    moon.shadow.camera.right = 6;
    moon.shadow.camera.top = 6;
    moon.shadow.camera.bottom = -6;
    moon.shadow.bias = -0.0005;
    g.add(moon, moon.target);
    const east = new THREE.DirectionalLight(0xffb48a, 0.0);
    east.position.set(14, 4, -1);
    east.target.position.set(4, 0, 0);
    g.add(east, east.target);
    this.roomLights.push({ light: east, on: 0.0, forced: true });

    this.lampLight = new THREE.PointLight(0xffcf98, 0, 5, 1.6);
    this.lampLight.position.set(-1.5, 0.98, -2.0);
    this.lampLight.castShadow = this.ctx.preset.shadows && this.ctx.preset.lights > 1;
    g.add(this.lampLight);
    this.phoneLight = new THREE.PointLight(0x8fb4ff, 0, 1.6, 2);
    this.phoneLight.position.set(-1.45, 0.75, -1.85);
    g.add(this.phoneLight);

    const bath = new THREE.PointLight(0xfff2e0, 0, 6, 1.5);
    bath.position.set(-4.25, 2.4, 3.5);
    g.add(bath);
    this.roomLights.push({ light: bath, on: 6, region: { minX: -5.5, maxX: -3, minZ: 2.3, maxZ: 4.7 } });
    const hall = new THREE.PointLight(0xffd9a8, 0.6, 6, 1.6);
    hall.position.set(0.5, 2.4, 1.6);
    g.add(hall);
    this.roomLights.push({ light: hall, on: 4, region: { minX: -0.5, maxX: 1.5, minZ: -2.3, maxZ: 4.7 } });
    for (const x of [3.2, 5.8]) {
      const k = new THREE.PointLight(0xffe2bd, 0, 7, 1.4);
      k.position.set(x, 2.45, 0.2);
      if (x === 3.2) k.castShadow = this.ctx.preset.shadows && this.ctx.preset.lights > 0;
      g.add(k);
      this.roomLights.push({ light: k, on: 5, region: { minX: 1.5, maxX: 7.5, minZ: -2.3, maxZ: 3.3 } });
      const fixture = cyl(0.18, 0.22, 0.08, emissive(0xffe6c8, 0.0), x, 2.62, 0.2);
      g.add(fixture);
    }

    this.spawns = {
      bed: { x: -2.35, z: -0.45, yaw: 0, y: 0.72 },
      bedSit: { x: -2.35, z: -1.85, yaw: 0, y: 0.52 },
      bedside: { x: -1.6, z: -0.9, yaw: Math.PI / 2 },
      door: { x: 0.5, z: 4.0, yaw: Math.PI },
    };

    // Ayla asleep on her side of the bed.
    const ayla = this.addNpc('ayla', -3.25, -0.5, 0, 'lie', 0.72);
    ayla.root.rotation.set(-Math.PI / 2, 0, 0.25);
    ayla.expression = 'sleep';

    this.interactables.push(
      {
        id: 'getUp',
        pos: new THREE.Vector3(-2.35, 0, -1.2),
        radius: 3,
        label: L('Yataktan kalk', 'Get out of bed'),
        dialogue: 'getUp',
        when: (s) => !s.flag('outOfBed') && !!(s.flag('callAnswered') || s.flag('declinedCall') || s.flag('missedTwice')) && !s.flag('inCall'),
      },
      { id: 'bed', pos: new THREE.Vector3(-2.0, 0, -1.2), radius: 1.3, label: L('Uyumaya devam et', 'Go back to sleep'), dialogue: 'sleepAgain', when: (s) => !!s.flag('outOfBed') && !s.flag('sleptIn') && !s.flag('dressed') && s.flag('ordersGiven') !== 'mobilise' },
      { id: 'sink', pos: new THREE.Vector3(-4.6, 0, 4.0), radius: 1.0, label: L('Yüzünü yıka', 'Wash your face'), dialogue: 'washFace', when: (s) => !s.flag('washed') },
      { id: 'wardrobe', pos: new THREE.Vector3(-4.6, 0, 1.4), radius: 1.2, label: L('Giyin', 'Get dressed'), dialogue: 'dress', when: (s) => !s.flag('dressed') },
      { id: 'coffee', pos: new THREE.Vector3(3.2, 0, -1.6), radius: 1.0, label: L('Kahve', 'Coffee'), dialogue: 'coffee', when: (s) => !s.flag('hadCoffee') },
      { id: 'breakfast', pos: new THREE.Vector3(4.8, 0, -1.6), radius: 0.9, label: L('Kahvaltı', 'Breakfast'), dialogue: 'breakfast', when: (s) => !s.flag('ate') },
      { id: 'ayla', pos: new THREE.Vector3(5.9, 0, -0.9), radius: 1.2, label: L('Ayla ile konuş', 'Talk to Ayla'), dialogue: 'aylaKitchen', when: (s) => !!s.flag('aylaInKitchen') && !s.done('talkedAylaKitchen') },
      { id: 'door', pos: new THREE.Vector3(0.5, 0, 4.2), radius: 0.9, label: L('Evden çık', 'Leave home'), dialogue: 'leaveHome' },
    );
    this.collectBlockers();
  }

  private buildBedroom() {
    const g = this.group;
    const c = this.colliders;
    // Bed
    const frame = mat(0x4a3424, { roughness: 0.6 });
    g.add(box(1.9, 0.32, 2.15, frame, -2.8, 0.16, -1.25, 0.03));
    g.add(box(1.95, 1.0, 0.1, frame, -2.8, 0.6, -2.3, 0.03));
    const headPad = mat(0xffffff, { map: fabric(0x7b6a5a, 'knit'), roughness: 1 });
    g.add(box(1.75, 0.55, 0.08, headPad, -2.8, 0.78, -2.23, 0.03));
    const mattress = mat(0xf0ece4);
    g.add(box(1.8, 0.22, 2.05, mattress, -2.8, 0.43, -1.25, 0.06));
    const duvet = mat(0xffffff, { map: fabric(0xc9c2b8, 'plain', 0xffffff, [3, 3]), roughness: 1 });
    // The duvet covers both sleepers from the chest down.
    const d = box(1.9, 0.14, 1.5, duvet, -2.8, 0.83, -0.86, 0.06);
    g.add(d);
    g.add(box(1.92, 0.3, 0.05, duvet, -2.8, 0.7, -0.12, 0.02));
    const pillow = mat(0xf6f3ee, { roughness: 1 });
    g.add(box(0.62, 0.14, 0.38, pillow, -2.35, 0.62, -2.0, 0.07));
    g.add(box(0.62, 0.14, 0.38, pillow, -3.25, 0.62, -2.0, 0.07));
    solid(c, -2.8, -1.25, 0.95, 1.1);
    // Nightstands, lamps, phone
    const ns = mat(0x5a4030, { roughness: 0.5 });
    g.add(box(0.48, 0.55, 0.42, ns, -1.5, 0.275, -2.0, 0.02));
    g.add(box(0.48, 0.55, 0.42, ns, -4.1, 0.275, -2.0, 0.02));
    solid(c, -1.5, -2.0, 0.25, 0.22);
    solid(c, -4.1, -2.0, 0.25, 0.22);
    for (const x of [-1.55, -4.1]) {
      g.add(cyl(0.07, 0.09, 0.05, mat(0x8a8a86, { metalness: 0.6, roughness: 0.3 }), x, 0.575, -2.1));
      g.add(cyl(0.012, 0.012, 0.28, mat(0x8a8a86, { metalness: 0.7 }), x, 0.72, -2.1));
    }
    this.lampShade = new THREE.MeshStandardMaterial({ color: 0xf2e6d0, emissive: 0xffb36b, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.9 });
    g.add(cyl(0.11, 0.16, 0.2, this.lampShade, -1.55, 0.92, -2.1));
    g.add(cyl(0.11, 0.16, 0.2, mat(0xf2e6d0, { side: THREE.DoubleSide }), -4.1, 0.92, -2.1));
    // Phone lying on the nightstand
    const phoneMat = new THREE.MeshStandardMaterial({ map: this.phone.texture, emissive: 0xffffff, emissiveMap: this.phone.texture, emissiveIntensity: 1, roughness: 0.2 });
    const body = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.5, roughness: 0.3 });
    this.phoneMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.155), [body, body, phoneMat, body, body, body]);
    this.phoneMesh.position.set(-1.45, 0.56, -1.9);
    this.phoneMesh.rotation.y = 0.3;
    g.add(this.phoneMesh);
    // Glass of water and a book
    g.add(cyl(0.03, 0.026, 0.1, physical(0xddeeff, { transmission: 0.9, roughness: 0.05, transparent: true, opacity: 0.4 }), -1.35, 0.6, -2.12));
    g.add(box(0.16, 0.03, 0.22, mat(0x6b2a2a), -4.0, 0.565, -1.95));
    // Wardrobe
    const wd = mat(0xd9cdb8, { roughness: 0.5 });
    g.add(box(1.7, 2.2, 0.62, wd, -4.4, 1.1, 1.95, 0.02));
    g.add(box(0.02, 2.0, 0.01, mat(0x8a7a66), -4.4, 1.1, 1.63));
    for (const x of [-4.48, -4.32]) g.add(box(0.02, 0.25, 0.03, mat(0x777777, { metalness: 0.8, roughness: 0.3 }), x, 1.1, 1.62));
    solid(c, -4.4, 1.95, 0.85, 0.31);
    // Rug, dresser, artwork, curtains
    const rug = plane(2.4, 1.6, mat(0xffffff, { map: fabric(0x6e3b3b, 'check', 0xc8a26a, [2, 2]), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-2.8, 0.005, 0.6);
    g.add(rug);
    g.add(box(1.2, 0.8, 0.45, wd, -1.2, 0.4, 1.95, 0.02));
    solid(c, -1.2, 1.95, 0.6, 0.23);
    const art = plane(0.9, 0.65, mat(0xffffff, { map: artwork(7) }));
    art.position.set(-2.8, 1.7, -2.23);
    g.add(art);
    g.add(box(0.96, 0.71, 0.03, mat(0x222222), -2.8, 1.7, -2.245));
    const curtain = mat(0xffffff, { map: fabric(0x3c4a5c, 'plain'), roughness: 1, side: THREE.DoubleSide });
    for (const z of [-0.6, 1.4]) {
      const geo = new THREE.PlaneGeometry(0.55, 2.3, 16, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.03);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, curtain);
      m.rotation.y = Math.PI / 2;
      m.position.set(-5.38, 1.3, z);
      g.add(m);
    }
    // Wall clock
    const clk = plane(0.3, 0.3, new THREE.MeshBasicMaterial({ map: this.clock.texture, transparent: true }));
    clk.position.set(-0.56, 1.9, -1.2);
    clk.rotation.y = -Math.PI / 2;
    g.add(clk);
    // family photo on the dresser
    g.add(box(0.22, 0.17, 0.02, mat(0x3a2a1a), -1.3, 0.9, 2.05));
    const ph = plane(0.18, 0.13, mat(0xffffff, { map: artwork(13) }));
    ph.position.set(-1.3, 0.9, 2.039);
    ph.rotation.y = Math.PI;
    g.add(ph);
  }

  private buildBathroom() {
    const g = this.group;
    const c = this.colliders;
    const white = physical(0xf7f7f5, { roughness: 0.15, clearcoat: 0.6 });
    // Vanity and sink on the south wall
    g.add(box(0.9, 0.8, 0.5, mat(0x4f5b66), -4.6, 0.4, 4.43, 0.02));
    g.add(box(0.95, 0.04, 0.52, mat(0xffffff, { map: marble() }), -4.6, 0.82, 4.43));
    const basin = cyl(0.2, 0.16, 0.08, white, -4.6, 0.86, 4.4);
    g.add(basin);
    g.add(cyl(0.012, 0.012, 0.16, mat(0xcccccc, { metalness: 1, roughness: 0.15 }), -4.6, 0.95, 4.6));
    solid(c, -4.6, 4.43, 0.47, 0.27);
    // Mirror: real reflection on the Quality preset, environment-mapped glass otherwise.
    if (this.ctx.preset.reflections) {
      const mirror = new Reflector(new THREE.PlaneGeometry(0.8, 0.9), { textureWidth: 512, textureHeight: 512, color: 0xb8bcc0 });
      mirror.position.set(-4.6, 1.5, 4.63);
      mirror.rotation.y = Math.PI;
      g.add(mirror);
    } else {
      const m = plane(0.8, 0.9, mat(0xcfd6dc, { metalness: 1, roughness: 0.05 }));
      m.position.set(-4.6, 1.5, 4.63);
      m.rotation.y = Math.PI;
      g.add(m);
    }
    g.add(box(0.86, 0.96, 0.02, mat(0x222222), -4.6, 1.5, 4.645));
    // Toilet and shower
    g.add(box(0.4, 0.4, 0.55, white, -5.2, 0.2, 3.3, 0.12));
    g.add(box(0.4, 0.35, 0.18, white, -5.3, 0.55, 3.3, 0.06));
    solid(c, -5.2, 3.3, 0.22, 0.3);
    const glass = physical(0xddeeff, { transmission: 0.8, roughness: 0.05, transparent: true, opacity: 0.25 });
    g.add(box(0.02, 2.0, 1.0, glass, -3.95, 1.0, 3.0));
    g.add(box(1.0, 0.03, 1.0, mat(0xe9e9e9), -3.5, 0.015, 2.85));
    solid(c, -3.5, 2.85, 0.5, 0.5);
    // Towel
    const towel = box(0.4, 0.6, 0.03, mat(0xffffff, { map: fabric(0x3c6e8f, 'stripe', 0xffffff) }), -5.45, 1.2, 4.0);
    towel.rotation.y = Math.PI / 2;
    g.add(towel);
  }

  private buildHall() {
    const g = this.group;
    const c = this.colliders;
    // Front door
    const door = box(0.92, 2.08, 0.06, mat(0x5b3a24, { roughness: 0.5 }), 0.5, 1.04, 4.68, 0.01);
    g.add(door);
    g.add(sphere(0.03, mat(0xc9a65a, { metalness: 1, roughness: 0.25 }), 0.85, 1.05, 4.62));
    solid(c, 0.5, 4.72, 0.5, 0.06);
    // Shoe cabinet with key bowl, coat hooks
    g.add(box(0.4, 0.9, 1.0, mat(0xe6e0d4), 1.28, 0.45, 3.9, 0.02));
    solid(c, 1.28, 3.9, 0.2, 0.5);
    g.add(cyl(0.1, 0.06, 0.05, mat(0x334455), 1.28, 0.93, 3.7));
    g.add(box(0.06, 0.02, 0.03, mat(0xbbbbbb, { metalness: 1 }), 1.28, 0.97, 3.7));
    const coat = box(0.45, 0.9, 0.18, mat(0xffffff, { map: fabric(0x2e3440, 'plain') }), -0.38, 1.35, 3.6, 0.06);
    g.add(coat);
    // Night light
    g.add(sphere(0.03, emissive(0xffc078, 2.5), -0.42, 0.3, 2.0));
    // Runner rug
    const runner = plane(0.9, 3.4, mat(0xffffff, { map: fabric(0x7a3a2a, 'check', 0xd8b070, [1, 3]), roughness: 1 }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0.5, 0.005, 1.6);
    g.add(runner);
    const art = plane(0.6, 0.8, mat(0xffffff, { map: artwork(21) }));
    art.position.set(1.44, 1.6, -1.0);
    art.rotation.y = -Math.PI / 2;
    g.add(art);
  }

  private buildKitchen() {
    const g = this.group;
    const c = this.colliders;
    const cab = mat(0x3f4e5a, { roughness: 0.45 });
    const top = mat(0xffffff, { map: marble(0xdedad2), roughness: 0.25 });
    g.add(box(4.6, 0.88, 0.62, cab, 4.3, 0.44, -1.98, 0.01));
    g.add(box(4.66, 0.04, 0.66, top, 4.3, 0.9, -1.98));
    g.add(box(4.6, 0.7, 0.36, cab, 4.3, 1.95, -2.1, 0.01));
    solid(c, 4.3, -1.98, 2.33, 0.33);
    // splash-back tiles
    const back = plane(4.6, 0.6, mat(0xffffff, { map: tiles(0xf0ede6, 0xc8c2b8, 12, [3, 1]) }));
    back.position.set(4.3, 1.22, -2.23);
    g.add(back);
    // Coffee machine
    g.add(box(0.26, 0.38, 0.3, mat(0x1b1b1d, { metalness: 0.4, roughness: 0.3 }), 3.2, 1.11, -2.05, 0.03));
    g.add(sphere(0.012, emissive(0x5cff8a, 3), 3.29, 1.2, -1.9));
    g.add(cyl(0.04, 0.035, 0.08, physical(0xffffff, { roughness: 0.2 }), 3.2, 0.96, -1.93));
    // Turkish tea set: kettle on the hob, tulip glasses
    g.add(box(0.6, 0.02, 0.5, mat(0x111111, { roughness: 0.2 }), 5.6, 0.925, -2.0));
    g.add(cyl(0.11, 0.13, 0.17, mat(0xb8bcc0, { metalness: 1, roughness: 0.25 }), 5.5, 1.02, -2.0));
    g.add(cyl(0.08, 0.1, 0.12, mat(0xb8bcc0, { metalness: 1, roughness: 0.25 }), 5.5, 1.16, -2.0));
    for (const x of [4.6, 4.72]) g.add(cyl(0.025, 0.02, 0.09, physical(0xc8341c, { transmission: 0.6, roughness: 0.05, transparent: true, opacity: 0.8 }), x, 0.97, -1.85));
    // simit on a plate
    g.add(cyl(0.12, 0.12, 0.01, physical(0xffffff, { roughness: 0.2 }), 4.95, 0.925, -1.9));
    const simit = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.022, 10, 20), mat(0xa0622c, { roughness: 0.8 }));
    simit.rotation.x = Math.PI / 2;
    simit.position.set(4.95, 0.95, -1.9);
    g.add(simit);
    // Fridge
    g.add(box(0.75, 1.9, 0.68, mat(0xd9dcdf, { metalness: 0.6, roughness: 0.3 }), 6.95, 0.95, -1.9, 0.03));
    solid(c, 6.95, -1.9, 0.38, 0.34);
    // Dining table and chairs
    const oak = mat(0xffffff, { map: woodFloor(0xa07a52, [1, 1]), roughness: 0.4 });
    g.add(box(1.6, 0.05, 0.9, oak, 4.5, 0.76, 0.9));
    for (const [x, z] of [
      [3.85, 0.55],
      [5.15, 0.55],
      [3.85, 1.25],
      [5.15, 1.25],
    ])
      g.add(box(0.05, 0.74, 0.05, oak, x, 0.37, z));
    solid(c, 4.5, 0.9, 0.82, 0.47);
    for (const [x, z, r] of [
      [4.1, 0.15, 0],
      [4.9, 0.15, 0],
      [4.1, 1.65, Math.PI],
      [4.9, 1.65, Math.PI],
    ] as const) {
      const chair = new THREE.Group();
      chair.add(box(0.42, 0.04, 0.42, oak, 0, 0.46, 0));
      chair.add(box(0.42, 0.45, 0.04, oak, 0, 0.7, -0.2));
      for (const [cx, cz] of [
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ])
        chair.add(box(0.035, 0.46, 0.035, oak, cx, 0.23, cz));
      chair.position.set(x, 0, z);
      chair.rotation.y = r;
      g.add(chair);
    }
    // Sofa and TV in the living part
    const sofa = mat(0xffffff, { map: fabric(0x5a6b5a, 'knit'), roughness: 1 });
    g.add(box(2.0, 0.45, 0.85, sofa, 4.5, 0.3, 2.75, 0.08));
    g.add(box(2.0, 0.5, 0.2, sofa, 4.5, 0.65, 3.12, 0.08));
    solid(c, 4.5, 2.75, 1.0, 0.45);
    g.add(box(1.2, 0.7, 0.05, mat(0x050505, { roughness: 0.2, metalness: 0.3 }), 7.43, 1.3, 2.0));
    // fruit bowl
    g.add(cyl(0.15, 0.08, 0.08, mat(0x8a5a3a), 4.5, 0.83, 0.9));
    for (let i = 0; i < 4; i++) g.add(sphere(0.04, mat([0xd23b2c, 0xe8a02a, 0x8bc34a, 0xd23b2c][i]), 4.45 + (i % 2) * 0.08, 0.89, 0.86 + Math.floor(i / 2) * 0.08, 10));
  }

  private buildOutside() {
    const g = this.group;
    this.skyMat = new THREE.MeshBasicMaterial({ map: skyGradient(0), fog: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 12), this.skyMat);
    sky.material.side = THREE.BackSide;
    g.add(sky);
    // Night city through the windows
    for (let i = 0; i < 14; i++) {
      const w = 6 + (i % 3) * 3;
      const h = 8 + ((i * 7) % 5) * 4;
      const m = new THREE.MeshBasicMaterial({ map: facade(i, 0.18) });
      const b1 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      b1.position.set(-24 - (i % 4) * 6, h / 2 - 4, -20 + i * 3.5);
      b1.rotation.y = Math.PI / 2;
      g.add(b1);
      const b2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      b2.position.set(30 + (i % 3) * 6, h / 2 - 4, -24 + i * 3.8);
      b2.rotation.y = -Math.PI / 2;
      g.add(b2);
    }
    // Uludağ silhouette to the south-east
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(40, 18, 6, 1), new THREE.MeshBasicMaterial({ color: 0x0b0e1a, fog: false }));
    mtn.position.set(60, 2, 10);
    g.add(mtn);
  }

  shot(name: string): Shot | null {
    switch (name) {
      case 'bedWide':
        return { pos: new THREE.Vector3(-0.9, 2.0, 1.6), target: new THREE.Vector3(-2.6, 0.6, -1.4), fov: 50 };
      case 'mirror':
        return { pos: new THREE.Vector3(-4.35, 1.65, 3.45), target: new THREE.Vector3(-4.6, 1.45, 4.6), fov: 45 };
      case 'ayla': {
        const a = this.npcs.ayla;
        const h = a.headWorld();
        return { pos: h.clone().add(new THREE.Vector3(0.9, 0.35, 0.6)), target: h, fov: 35 };
      }
    }
    return null;
  }

  setPhone(mode: PhoneScreen['mode'], time: string, caller = '') {
    this.phone.mode = mode;
    this.phone.time = time;
    this.phone.caller = caller;
    this.phoneLight.intensity = mode === 'off' ? 0 : 0.6;
  }

  setVibrating(on: boolean) {
    this.vibrate = on ? 1 : 0;
  }

  setLamp(on: boolean) {
    for (const rl of this.roomLights) if (rl.light === this.lampLight) rl.forced = on;
    if (!this.roomLights.some((r) => r.light === this.lampLight)) this.roomLights.push({ light: this.lampLight, on: 2.2, forced: on });
  }

  updateTime(clock: number) {
    this.clock.minutes = clock;
    // Sky brightens from 05:30 towards 07:15
    const t = Math.max(0, Math.min(1, (clock - 330) / 105));
    const q = Math.round(t * 20) / 20;
    if (q !== this.skyT) {
      this.skyT = q;
      this.skyMat.map = skyGradient(q);
      this.skyMat.needsUpdate = true;
      const east = this.roomLights.find((r) => r.forced === true && (r.light as THREE.DirectionalLight).isDirectionalLight);
      if (east) east.on = q * 1.2;
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    super.update(dt, playerPos);
    this.phone.tick(dt);
    this.clock.tick(dt);
    this.lampShade.emissiveIntensity = this.lampLight.intensity * 0.6;
    if (this.vibrate) {
      const t = performance.now() / 1000;
      const on = t % 1.4 < 0.9 && t % 0.45 < 0.3;
      this.phoneMesh.position.x = -1.45 + (on ? (Math.random() - 0.5) * 0.004 : 0);
      this.phoneMesh.rotation.y = 0.3 + (on ? Math.sin(t * 90) * 0.02 : 0);
    }
  }
}
