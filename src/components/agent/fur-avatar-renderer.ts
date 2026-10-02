import {
  Color, DoubleSide, ExtrudeGeometry, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera,
  Scene, ShaderMaterial, Shape, SphereGeometry, Vector2, WebGLRenderer,
  type BufferGeometry,
} from "three";

// Shell fur: layered geometry, procedural strand cutouts, bent tips and soft
// directional/rim lighting. The reference uses this same rendering technique.
const VERTEX = `
attribute float aShell;
uniform float uLength;
uniform float uTime;
uniform float uMotion;
uniform float uPress;
uniform vec2 uTouch;
uniform vec2 uLag;
varying vec3 vRoot;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
void main() {
  float h = aShell;
  vec3 n = normalize(normal);
  vec3 comb = vec3(sin(position.y * 13.0 + position.z * 9.0),
                   cos(position.x * 11.0 - position.z * 8.0),
                   sin(position.x * 9.0 + position.y * 12.0)) * 0.22;
  vec2 offset = position.xy - uTouch;
  float touch = uPress * exp(-dot(offset, offset) * 5.0);
  vec3 bend = comb + vec3(uLag.x, -0.24 + uLag.y, 0.0);
  bend += vec3(sin(uTime * 1.7 + position.y * 3.0) * 0.13, 0.0, 0.0) * uMotion;
  bend.xy += offset * touch * 1.6;
  bend -= n * min(dot(bend, n), 0.0);
  vec3 p = position + normalize(n + bend * h) * uLength * h * (1.0 - touch * 0.5);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vRoot = position;
  vNormal = normalize(normalMatrix * n);
  vView = -view.xyz;
  vHeight = h;
  gl_Position = projectionMatrix * view;
}`;

const FRAGMENT = `
uniform vec3 uRootColor;
uniform vec3 uTipColor;
uniform float uDensity;
varying vec3 vRoot;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
void main() {
  vec3 n = normalize(vNormal);
  float h = vHeight;
  if (h > 0.0) {
    vec3 x = vRoot * uDensity;
    x += sin(vRoot.yzx * 9.0) * h * h * 0.55;
    vec3 cell = floor(x - 0.5);
    float coverage = 0.0;
    float aa = max(length(fwidth(x)) * 0.35, 0.015);
    for (int z = 0; z < 2; z++) {
      for (int y = 0; y < 2; y++) {
        for (int i = 0; i < 2; i++) {
          vec3 c = cell + vec3(float(i), float(y), float(z));
          vec3 random = hash33(c);
          float strandHeight = mix(0.45, 1.0, random.z);
          float radius = mix(0.46, 0.12, clamp(h / strandHeight, 0.0, 1.0));
          float distanceToStrand = length(x - (c + random));
          coverage = max(coverage, (1.0 - smoothstep(radius - aa, radius + aa, distanceToStrand)) * step(h, strandHeight));
        }
      }
    }
    if (coverage < mix(0.25, 0.7, hash33(vec3(gl_FragCoord.xy, h * 271.0)).x)) discard;
  }
  vec3 light = normalize(vec3(-0.45, 0.8, 1.0));
  float diffuse = pow(clamp((dot(n, light) + 0.6) / 1.6, 0.0, 1.0), 1.5);
  float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0);
  vec3 color = mix(uRootColor, uTipColor, h) * (0.6 + diffuse * 0.9) * mix(0.72, 1.0, h);
  color += uTipColor * rim * h * 0.5;
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

export type FurAvatarPose = {
  yaw: number; pitch: number; press: number; time: number; active: boolean;
  lagX: number; lagY: number;
};

function buildRenderer() {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 20);
  camera.position.set(0, 0, 5);
  const rig = new Group();
  scene.add(rig);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<ShaderMaterial | MeshBasicMaterial>();
  const coats: ShaderMaterial[] = [];
  const sphere = new SphereGeometry(1, 32, 24);
  geometries.add(sphere);

  const fur = (base: BufferGeometry, length: number, density: number) => {
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    for (const [name, attribute] of Object.entries(base.attributes)) geometry.setAttribute(name, attribute);
    const shells = 28;
    geometry.setAttribute("aShell", new InstancedBufferAttribute(Float32Array.from({ length: shells }, (_, i) => i / (shells - 1)), 1));
    geometry.instanceCount = shells;
    geometries.add(geometry);
    const material = new ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, side: DoubleSide,
      uniforms: {
        uLength: { value: length }, uTime: { value: 0 }, uMotion: { value: 0 },
        uPress: { value: 0 }, uTouch: { value: new Vector2() }, uLag: { value: new Vector2() },
        uRootColor: { value: new Color("#131d28") }, uTipColor: { value: new Color("#354654") },
        uDensity: { value: density },
      },
    });
    coats.push(material);
    materials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  };

  const body = fur(sphere, 0.12, 40);
  body.scale.set(0.74, 0.7, 0.62);
  body.position.set(-0.03, -0.05, 0);
  rig.add(body);

  // Three soft scallops on each wing, using the same blue-black coat.
  const outline = new Shape();
  outline.moveTo(0, 0.16);
  outline.bezierCurveTo(0.2, 0.29, 0.48, 0.67, 0.71, 0.54);
  outline.bezierCurveTo(0.61, 0.34, 0.65, 0.14, 0.91, -0.06);
  outline.bezierCurveTo(0.69, -0.005, 0.58, -0.015, 0.59, -0.23);
  outline.bezierCurveTo(0.43, -0.11, 0.28, -0.14, 0.26, -0.35);
  outline.bezierCurveTo(0.16, -0.23, 0.07, -0.28, 0, -0.32);
  outline.closePath();
  const wingGeometry = new ExtrudeGeometry(outline, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.04, bevelSegments: 3, steps: 1, curveSegments: 10 });
  wingGeometry.translate(0, 0, -0.045);
  geometries.add(wingGeometry);
  const wings = [-1, 1].map((side) => {
    const pivot = new Group();
    pivot.position.set(side * 0.43, -0.03, -0.13);
    const wing = fur(wingGeometry, 0.065, 55);
    wing.scale.set(side * 0.9, 0.9, 0.9);
    pivot.add(wing);
    rig.add(pivot);
    return pivot;
  });

  const eyeMaterial = new MeshBasicMaterial({ color: "#b63445" });
  materials.add(eyeMaterial);
  const eyes = [[-0.27, 0.08], [0.22, 0.04]].map(([x, y]) => {
    const eye = new Mesh(sphere, eyeMaterial);
    eye.position.set(x, y, 0.65);
    eye.scale.set(0.09, 0.16, 0.045);
    eye.rotation.z = -0.12;
    rig.add(eye);
    return eye;
  });
  let lost = false;
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; };
  const contextRestored = () => { lost = false; };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
  let size = 0;
  return {
    draw(context: CanvasRenderingContext2D, pixels: number, pose: FurAvatarPose) {
      if (lost) return false;
      if (size !== pixels) { renderer.setSize(pixels, pixels, false); size = pixels; }
      const press = Math.max(0, pose.press);
      rig.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      rig.scale.set(1 + pose.press * 0.04, 1 - pose.press * 0.07, 1);
      for (let i = 0; i < wings.length; i++) {
        const side = i === 0 ? -1 : 1;
        wings[i].rotation.y = side * (0.14 + pose.lagX * 0.55 + press * 0.3 + (pose.active ? Math.sin(pose.time * 2) * 0.075 : 0));
        wings[i].rotation.z = side * (pose.lagY * 0.25 - press * 0.08);
      }
      for (const eye of eyes) eye.scale.y = 0.16 * (1 - press * 0.38);
      for (const material of coats) {
        material.uniforms.uTime.value = pose.time;
        material.uniforms.uMotion.value = pose.active ? 1 : 0;
        material.uniforms.uPress.value = press;
        material.uniforms.uTouch.value.set(pose.yaw * 2, -pose.pitch * 2);
        material.uniforms.uLag.value.set(pose.lagX * 4, pose.lagY * 4);
      }
      renderer.render(scene, camera);
      context.clearRect(0, 0, pixels, pixels);
      context.drawImage(renderer.domElement, 0, 0, pixels, pixels);
      return true;
    },
    dispose() {
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// ONE shared WebGL renderer; historical portraits use cheap 2D canvas copies.
let shared: ReturnType<typeof buildRenderer> | undefined;
let users = 0;
export function acquireFurRenderer() {
  shared ??= buildRenderer();
  const resource = shared;
  users++;
  let released = false;
  return {
    draw: resource.draw,
    release() {
      if (released) return;
      released = true;
      if (--users === 0) { resource.dispose(); shared = undefined; }
    },
  };
}
