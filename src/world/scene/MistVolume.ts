// WHAT: Mist as a body of air rather than layers: a box above the board, and a
//       shader that looks through it pixel by pixel and adds up how much mist
//       each line of sight passes through, lit by the low sun.
// HOW:  Raymarching, kept small. The box is drawn by its inside faces, so it
//       is drawn whether the camera is outside it or in it; each fragment finds
//       where its ray enters and leaves the box and takes a fixed number of
//       steps between, starting each pixel at a slightly different point so
//       the steps never show as bands. At each step, the mist's density comes
//       from tileable 3D noise drifting on the wind — broad billows, eaten at
//       the edges by finer curls, thinning toward the box's floor, ceiling and
//       sides — and one short look toward the sun says how much mist lies
//       between that point and the light, which is what makes the tops bright
//       and the undersides grey. The sum is capped well short of opaque.
// WHY:  Mist drawn as stacked flat layers read as mist from the default camera
//       and thinned to nothing seen edge-on, from a low camera or the side. A
//       volume has no edge to be seen from; the author compared the two side by
//       side and chose this one (D-077).
//       The whole box lies above the tallest piece, so everything solid is
//       below the mist and the shader never needs to know how far away the
//       board is: whatever it draws over is behind it. The cost is fixed — a
//       known number of steps over the pixels the box covers — and smaller on
//       a phone.

import {
  BackSide,
  BoxGeometry,
  Color,
  Data3DTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

import type { BoardBounds } from '@domain/board/types';

const NOISE = 48;
/** Board widths a second, on the mist's light air: a board crossed in a little over a minute. */
const DRIFT = 0.014;
/**
 * Under 20 frames a second is too slow; twelve such frames in a row, and the
 * mist takes fewer steps. A run that long is a machine that cannot keep up,
 * not a hitch: a new board being built stalls a few frames, and must not
 * cost a fast machine its mist for the rest of the game.
 */
const SLOW_FRAME = 0.05;
const SLOW_RUN = 12;
/** The fewest steps the mist will take: still billows, if coarser ones. */
const MIN_STEPS = 5;

function hash3(x: number, y: number, z: number, octave: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + octave * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/** Tileable 3D value noise, three octaves, one byte a voxel. */
function noiseVolume(): Data3DTexture {
  const n = NOISE;
  const data = new Uint8Array(n * n * n);
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const wrap = (v: number, p: number): number => ((v % p) + p) % p;
  let i = 0;
  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let octave = 0; octave < 3; octave += 1) {
          const period = 4 << octave;
          const fx = (x / n) * period;
          const fy = (y / n) * period;
          const fz = (z / n) * period;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const z0 = Math.floor(fz);
          const tx = smooth(fx - x0);
          const ty = smooth(fy - y0);
          const tz = smooth(fz - z0);
          const at = (dx: number, dy: number, dz: number): number =>
            hash3(wrap(x0 + dx, period), wrap(y0 + dy, period), wrap(z0 + dz, period), octave);
          const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
          const value = lerp(
            lerp(lerp(at(0, 0, 0), at(1, 0, 0), tx), lerp(at(0, 1, 0), at(1, 1, 0), tx), ty),
            lerp(lerp(at(0, 0, 1), at(1, 0, 1), tx), lerp(at(0, 1, 1), at(1, 1, 1), tx), ty),
            tz,
          );
          const amplitude = 1 / (1 << octave);
          sum += value * amplitude;
          weight += amplitude;
        }
        data[i] = Math.round((sum / weight) * 255);
        i += 1;
      }
    }
  }
  const texture = new Data3DTexture(data, n, n, n);
  texture.format = RedFormat;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = (steps: number) => /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D uNoise;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform float uTime;
  uniform vec2 uDrift;
  /** World units across one repeat of the broad noise. */
  uniform float uScale;
  uniform vec3 uSun;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform float uDensity;
  uniform float uMaxAlpha;
  uniform float uReach;
  /** Steps actually taken along a ray: up to the most compiled, fewer on a struggling machine. */
  uniform float uSteps;
  varying vec3 vWorld;

  float density(vec3 p) {
    vec3 box = uBoxMax - uBoxMin;
    vec3 local = (p - uBoxMin) / box;
    // Thin toward the floor and ceiling, and toward the sides, where the box would show.
    float height = smoothstep(0.0, 0.3, local.y) * smoothstep(1.0, 0.55, local.y);
    vec2 side = smoothstep(0.0, 0.18, local.xz) * smoothstep(1.0, 0.82, local.xz);
    float envelope = height * side.x * side.y;
    if (envelope <= 0.0) return 0.0;
    vec3 q = p;
    q.xz -= uDrift * uTime;
    // Broad billows, flattened a little: mist lies wider than it is tall.
    float raw = texture(uNoise, q / uScale * vec3(1.0, 1.6, 1.0) + vec3(0.0, uTime * 0.002, 0.0)).r;
    // Value noise bunches round the middle; stretched, it has clear billows and clear gaps.
    float base = smoothstep(0.32, 0.72, raw);
    // More mist at the bottom of the layer than the top: the billows rise from it.
    float shape = base - (0.3 + 0.38 * local.y);
    if (shape <= 0.0) return 0.0;
    // Finer curls eat into the edges of the billows.
    float detail = texture(uNoise, q / uScale * 3.1 - vec3(uTime * 0.004)).r;
    return max(shape - detail * 0.22, 0.0) * envelope;
  }

  void main() {
    vec3 origin = cameraPosition;
    vec3 dir = normalize(vWorld - origin);
    // Where the ray enters and leaves the box.
    vec3 inv = 1.0 / dir;
    vec3 t0 = (uBoxMin - origin) * inv;
    vec3 t1 = (uBoxMax - origin) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float near = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    // No farther than the reach set for this board: from inside the mist a ray
    // can run the whole box long, and the same steps spread over that much
    // air are coarse enough to show as grain. The fog takes over beyond it.
    float far = min(min(min(tmax.x, tmax.y), tmax.z), near + uReach);
    if (far <= near) discard;

    float stepLength = (far - near) / uSteps;
    // A different start for every pixel, so the steps never show as bands —
    // interleaved gradient noise, whose fine, even pattern reads as smooth
    // where a random hash reads as grain.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = near + stepLength * jitter;
    float transmittance = 1.0;
    vec3 light = vec3(0.0);
    float lookToSun = (uBoxMax.y - uBoxMin.y) * 0.22;

    for (int i = 0; i < ${String(steps)}; i++) {
      if (float(i) >= uSteps) break;
      vec3 p = origin + dir * t;
      float d = density(p);
      if (d > 0.0) {
        // How much mist lies between here and the sun.
        float toward = density(p + uSun * lookToSun);
        float sunlit = exp(-toward * 9.0);
        vec3 colour = mix(uShade, uLit, sunlit);
        float absorbed = 1.0 - exp(-d * uDensity * stepLength);
        light += transmittance * absorbed * colour;
        transmittance *= 1.0 - absorbed;
        if (transmittance < 0.04) break;
      }
      t += stepLength;
    }
    float alpha = (1.0 - transmittance) * uMaxAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(light / max(1.0 - transmittance, 0.0001), alpha);
  }
`;

export class MistVolume {
  public readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  /**
   * Built the first time the mist is shown, not with the stage: it is a
   * hundred thousand voxels of noise, and most boards open in fine weather.
   */
  private noise: Data3DTexture | null = null;
  private readonly drift = new Vector2(1, 0.3).normalize();
  private steps: number;
  /** Frames in a row that took too long, while the mist was showing. */
  private slowFrames = 0;

  /** `steps` along every ray, at most: fewer on a phone. */
  public constructor(steps = 22) {
    this.steps = steps;
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT(steps),
      uniforms: {
        uNoise: { value: null },
        uBoxMin: { value: new Vector3() },
        uBoxMax: { value: new Vector3(1, 1, 1) },
        uTime: { value: 0 },
        uDrift: { value: new Vector2() },
        uScale: { value: 1 },
        // The mist's sun: low, in the east.
        uSun: { value: new Vector3(1, 0.16, 0).normalize() },
        uLit: { value: new Color('#fbfbf8') },
        uShade: { value: new Color('#9aa3a7') },
        uDensity: { value: 1 },
        uMaxAlpha: { value: 0.62 },
        uReach: { value: 1 },
        uSteps: { value: steps },
      },
      transparent: true,
      depthWrite: false,
      // Drawn by its inside faces: present whether the camera is outside the box or in it.
      side: BackSide,
    });
    this.mesh = new Mesh(new BoxGeometry(1, 1, 1), this.material);
    this.mesh.name = 'mist-volume';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** Fits the volume over a board and past its edges, from above its tallest piece. */
  public fit(bounds: BoardBounds): void {
    const width = bounds.maxX - bounds.minX;
    const margin = width * 0.4;
    const floor = bounds.maxY + width * 0.12;
    const min = new Vector3(bounds.minX - margin, floor, bounds.minZ - margin);
    const max = new Vector3(bounds.maxX + margin, floor + width * 0.17, bounds.maxZ + margin);
    const u = this.material.uniforms;
    (u.uBoxMin?.value as Vector3).copy(min);
    (u.uBoxMax?.value as Vector3).copy(max);
    if (u.uScale !== undefined) u.uScale.value = width * 1.1;
    if (u.uReach !== undefined) u.uReach.value = width * 1.3;
    // Density per world unit, so a board of any size is as misty.
    if (u.uDensity !== undefined) u.uDensity.value = 40 / width;
    (u.uDrift?.value as Vector2).copy(this.drift).multiplyScalar(width * DRIFT);
    this.mesh.position.copy(min).add(max).multiplyScalar(0.5);
    this.mesh.scale.copy(max).sub(min);
  }

  /** Shows or hides the mist, making its noise the first time it is shown. */
  public setVisible(visible: boolean): void {
    if (visible && this.noise === null) {
      this.noise = noiseVolume();
      const u = this.material.uniforms.uNoise;
      if (u !== undefined) u.value = this.noise;
    }
    this.mesh.visible = visible;
  }

  /**
   * Watches how long frames take while the mist shows, and takes fewer steps
   * along each ray if they are too slow: a machine drawing without a graphics
   * card spent a quarter of a second on every misty frame, and a game that
   * answers a click a few seconds late is broken, not merely ugly. It steps
   * down and never back up — a board that stuttered once would stutter again
   * — and stops at a floor that still reads as mist.
   */
  public pace(frameSeconds: number): void {
    if (!this.mesh.visible || this.steps <= MIN_STEPS) return;
    this.slowFrames = frameSeconds > SLOW_FRAME ? this.slowFrames + 1 : 0;
    if (this.slowFrames < SLOW_RUN) return;
    this.slowFrames = 0;
    this.steps = Math.max(MIN_STEPS, Math.floor(this.steps / 2));
    const u = this.material.uniforms.uSteps;
    if (u !== undefined) u.value = this.steps;
  }

  /** Steps taken along each ray now; for tests. */
  public get stepsTaken(): number {
    return this.steps;
  }

  public update(dt: number): void {
    const time = this.material.uniforms.uTime;
    if (time !== undefined) time.value = (time.value as number) + dt;
  }

  public get clock(): number {
    return (this.material.uniforms.uTime?.value as number | undefined) ?? 0;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.noise?.dispose();
    this.mesh.removeFromParent();
  }
}
