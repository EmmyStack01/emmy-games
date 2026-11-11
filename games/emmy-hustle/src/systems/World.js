import Phaser from 'phaser';
import { WORLD, SIDEWALK_WIDTH, BUILDING, FONT_FAMILY } from '../config.js';
import * as D from '../data/neighbourhood.js';
import { THEME } from '../theme.js';
import { buildingShadowGeometry } from './TextureFactory.js';
import { computeSolidRects } from './solidRects.js';

const DEPTH = {
  ground: -1000,
  water: -990,
  road: -900,
  plaza: -895,
  sidewalk: -890,
  marking: -880,
  shadow: -870, // building shadows lie on the ground, under everything standing on it
  decal: -850,
};

// Builds the whole neighbourhood from data and owns the static collision group.
export default class World {
  constructor(scene) {
    this.scene = scene;
    this.solids = scene.physics.add.staticGroup();
    this.solidRects = [];
    this.water = null;
  }

  build() {
    this.buildGround();
    this.buildPlaza();
    this.buildSolids();
    this.placeBuildings();
    this.placeProps();
    this.scatterFlowers(90);
    return this;
  }

  update(time) {
    // Gentle water drift (cheap: only changes texture coordinates).
    if (this.water) this.water.tilePositionX = time * 0.012;
  }

  /* ---------------------------------------------------------- helpers */

  tile(x, y, w, h, key, depth) {
    return this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setDepth(depth);
  }

  // Invisible static collider. (x, y) is the top-left corner.
  addSolid(x, y, w, h) {
    const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
    this.scene.physics.add.existing(zone, true);
    this.solids.add(zone);
    this.solidRects.push({ x, y, w, h });
    return zone;
  }

  // Every solid in the neighbourhood (buildings, trees, props, the water edge). The list
  // and its rules live in solidRects.js, which the tests read too, so there is no second copy
  // of these numbers to drift. This must run before scatterFlowers, which avoids solids.
  buildSolids() {
    computeSolidRects().forEach((r) => this.addSolid(r.x, r.y, r.w, r.h));
  }

  // Splits [0,total] into the gaps left between roads running the other way.
  segments(total, roads, startKey, sizeKey) {
    const out = [];
    let cursor = 0;
    roads.forEach((r) => {
      if (r[startKey] > cursor) out.push([cursor, r[startKey]]);
      cursor = r[startKey] + r[sizeKey];
    });
    if (cursor < total) out.push([cursor, total]);
    return out;
  }

  /* ----------------------------------------------------- ground + roads */

  buildGround() {
    const { width: W, height: H, shoreY, waterY } = WORLD;
    const SW = SIDEWALK_WIDTH;

    this.tile(0, 0, W, H, 'grass', DEPTH.ground);

    // Waterfront: animated water, wooden boardwalk, solid water edge.
    this.water = this.tile(0, shoreY, W, H - shoreY, 'water', DEPTH.water);
    this.tile(0, shoreY, W, waterY - shoreY, 'plank', DEPTH.road);
    this.scene.add
      .rectangle(W / 2, waterY, W, 4, THEME.plank.edge)
      .setDepth(DEPTH.sidewalk);

    const xSegs = this.segments(W, D.ROADS_V, 'x', 'w');
    const ySegs = this.segments(shoreY, D.ROADS_H, 'y', 'h');

    D.ROADS_H.forEach((r) => {
      this.tile(0, r.y, W, r.h, 'road', DEPTH.road);
      xSegs.forEach(([a, b]) => {
        this.tile(a, r.y - SW, b - a, SW, 'sidewalk', DEPTH.sidewalk);
        this.tile(a, r.y + r.h, b - a, SW, 'sidewalk', DEPTH.sidewalk);
        if (b - a > 40) {
          this.tile(a + 14, r.y + r.h / 2 - 4, b - a - 28, 8, 'dash_h', DEPTH.marking);
        }
      });
    });

    D.ROADS_V.forEach((r) => {
      this.tile(r.x, 0, r.w, shoreY, 'road', DEPTH.road);
      ySegs.forEach(([a, b]) => {
        this.tile(r.x - SW, a, SW, b - a, 'sidewalk', DEPTH.sidewalk);
        this.tile(r.x + r.w, a, SW, b - a, 'sidewalk', DEPTH.sidewalk);
        if (b - a > 40) {
          this.tile(r.x + r.w / 2 - 4, a + 14, 8, b - a - 28, 'dash_v', DEPTH.marking);
        }
      });
    });
  }

  buildPlaza() {
    const p = D.PLAZA;
    this.tile(p.x, p.y, p.w, p.h, 'plaza', DEPTH.plaza);
    this.scene.add
      .rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h)
      .setStrokeStyle(6, THEME.plaza.border)
      .setDepth(DEPTH.plaza + 1);
  }

  /* ------------------------------------------------------- buildings */

  placeBuildings() {
    D.BUILDINGS.forEach((b) => {
      // cast shadow to the right (light from the top-left)
      const sh = buildingShadowGeometry(b);
      this.scene.add
        .image(b.x + b.w / 2 - 1, b.base + 6 - sh.hs, `bsh_${b.id}`)
        .setOrigin(0, 0)
        .setDepth(DEPTH.shadow);

      this.scene.add
        .image(b.x, b.base + BUILDING.shadowPad, `bld_${b.id}`)
        .setOrigin(0.5, 1)
        .setDepth(b.base);

      // (The building's solid footprint comes from buildSolids / solidRects.js.)

      if (b.name) {
        const label = this.scene.add
          .text(b.x, b.base - b.h + BUILDING.signCenterY, b.name, {
            fontFamily: FONT_FAMILY,
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#141830',
            resolution: 2,
          })
          .setOrigin(0.5)
          .setDepth(b.base + 1);
        const maxWidth = b.w * 0.7;
        if (label.width > maxWidth) label.setScale(maxWidth / label.width);
      }
    });
  }

  /* ------------------------------------------------------------ props */

  placeProps() {
    const add = (key, x, y) =>
      this.scene.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);

    // Pictures only: the matching solids come from buildSolids / solidRects.js.
    D.TREES.forEach(([type, x, y]) => add(type, x, y));
    D.BUSHES.forEach(([x, y]) => add('bush', x, y));
    D.LAMPS.forEach(([x, y]) => add('lamp', x, y));
    D.BENCHES.forEach(([x, y]) => add('bench', x, y));
    D.STALLS.forEach(([x, y, variant]) => add(`stall_${variant}`, x, y));
    D.VEHICLES.forEach(({ key, x, base }) => add(key, x, base));
    add('fountain', D.FOUNTAIN.x, D.FOUNTAIN.base);
  }

  /* ------------------------------------------------------ small touches */

  scatterFlowers(count) {
    const rnd = new Phaser.Math.RandomDataGenerator(['orisun-close']);
    const keys = ['flower_a', 'flower_b', 'flower_c'];
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const x = rnd.between(20, WORLD.width - 20);
      const y = rnd.between(20, WORLD.shoreY - 20);
      if (this.isOccupied(x, y)) continue;
      this.scene.add.image(x, y, rnd.pick(keys)).setDepth(DEPTH.decal);
      placed++;
    }
  }

  isOccupied(x, y) {
    const sw = SIDEWALK_WIDTH;
    const pad = 14;
    for (const r of D.ROADS_H) {
      if (y > r.y - sw - pad && y < r.y + r.h + sw + pad) return true;
    }
    for (const r of D.ROADS_V) {
      if (x > r.x - sw - pad && x < r.x + r.w + sw + pad) return true;
    }
    const p = D.PLAZA;
    if (x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) return true;
    for (const s of this.solidRects) {
      if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return true;
    }
    return false;
  }
}