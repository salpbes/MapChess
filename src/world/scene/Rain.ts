// WHAT: Rain over the board and the land round it — slanting streaks that fall
//       through a box above the ground and start again at the top.
// HOW:  One LineSegments mesh, two vertices a drop, and a shader that works out
//       where every drop is from the clock: its fall is the time modulo the
//       box's height, its sideways drift is the wind, and its tail trails back
//       along its own path. Nothing is updated on the CPU after it is built,
//       so three thousand drops cost a frame what one mesh costs.
// WHY:  A storm that is only a grey sky reads as an overcast day. Rain is what
//       says weather, and the wind that slants it is the same wind that bends
//       the trees (see TreeBuilder), so the two agree on which way it blows.
//
//       Lines are one pixel wide in WebGL whatever is asked for, and that is
//       the right width for rain seen from this far away.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  ShaderMaterial,
  Vector4,
} from 'three';

import type { BoardBounds } from '@domain/board/types';

import { weather } from './Atmosphere';

/** A stable pseudo-random number in [0, 1) per drop and channel. */
function noise(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform vec4 uBox;     // minX, minZ, sizeX, sizeZ
  uniform float uTop;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uLength;
  uniform float uRain;   // MEDIUM_RAIN to 1: how many of the drops are falling
  attribute vec3 seed;   // x, z in [0,1); phase in [0,1)
  attribute float tail;  // 0 for a drop's head, 1 for its tail
  attribute float keep;  // a drop falls while keep is under uRain
  varying float vTail;
  varying float vShown;

  void main() {
    float fall = mod(seed.z * uHeight + uTime * uSpeed, uHeight);
    // A gale leans the rain about forty degrees; the earlier thirty barely showed.
    vec2 drift = uWindDir * uWind * uSpeed * 0.82;
    // Where the head is now, drifted by the wind for as long as it has been falling.
    vec2 xz = uBox.xy + mod(seed.xy * uBox.zw + drift * (fall / uSpeed), uBox.zw);
    vec3 head = vec3(xz.x, uTop - fall, xz.y);
    // The tail trails back up the path it came down.
    vec3 back = normalize(vec3(-drift.x, uSpeed, -drift.y));
    vec3 p = head + back * uLength * tail;
    vTail = tail;
    // Thinned rather than faded: a medium rain is fewer drops, not paler ones.
    vShown = step(keep, uRain);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTail;
  varying float vShown;
  void main() {
    if (vShown < 0.5) discard;
    // Brightest at the head, fading up the streak.
    gl_FragColor = vec4(uColor, uOpacity * (1.0 - 0.75 * vTail));
  }
`;

export class Rain {
  public readonly mesh: LineSegments;
  private readonly material: ShaderMaterial;

  public constructor(drops: number) {
    const seeds = new Float32Array(drops * 2 * 3);
    const tails = new Float32Array(drops * 2);
    const keeps = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i += 1) {
      for (let end = 0; end < 2; end += 1) {
        const v = i * 2 + end;
        seeds.set([noise(i, 1), noise(i, 2), noise(i, 3)], v * 3);
        tails[v] = end;
        keeps[v] = noise(i, 4);
      }
    }
    const geometry = new BufferGeometry();
    // Positions are worked out in the shader; three still wants the attribute.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(drops * 2 * 3), 3));
    geometry.setAttribute('seed', new BufferAttribute(seeds, 3));
    geometry.setAttribute('tail', new BufferAttribute(tails, 1));
    geometry.setAttribute('keep', new BufferAttribute(keeps, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: weather.time,
        uWind: weather.wind,
        uWindDir: weather.windDir,
        uRain: weather.rain,
        uBox: { value: new Vector4(0, 0, 1, 1) },
        uTop: { value: 1 },
        uHeight: { value: 1 },
        uSpeed: { value: 900 },
        uLength: { value: 55 },
        uColor: { value: new Color('#c8d3de') },
        uOpacity: { value: 0.55 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new LineSegments(geometry, this.material);
    this.mesh.name = 'rain';
    // The shader moves every vertex; a bounding sphere from the empty position
    // buffer would have three cull the whole storm as off-screen.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Fits the rain to a board: over it and its margin, from well above the hills down to the ground. */
  public fit(bounds: BoardBounds): void {
    const width = bounds.maxX - bounds.minX;
    const margin = width * 0.18;
    const u = this.material.uniforms;
    (u.uBox?.value as Vector4).set(
      bounds.minX - margin,
      bounds.minZ - margin,
      width + margin * 2,
      bounds.maxZ - bounds.minZ + margin * 2,
    );
    const height = width * 0.55;
    if (u.uTop !== undefined) u.uTop.value = bounds.maxY + height;
    if (u.uHeight !== undefined) u.uHeight.value = height + (bounds.maxY - bounds.minY);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
