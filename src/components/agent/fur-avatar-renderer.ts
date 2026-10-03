import {
  CatmullRomCurve3, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, MeshBasicMaterial, OrthographicCamera,
  Scene, ShaderMaterial, Shape, SphereGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderer,
  type BufferGeometry,
} from "three";
import { createExusiaiCoat } from "./exusiai-coat";
import { createSaileachCoat } from "./saileach-coat";
import { createMountainCoat } from "./mountain-coat";

// Shell fur: layered geometry, procedural strand cutouts, bent tips and soft
// directional/rim lighting. The reference uses this same rendering technique.
const VERTEX = `
attribute float aShell;
uniform float uLength;
uniform float uTime;
uniform float uMotion;
uniform float uPress;
uniform float uGroomUp;
uniform float uCoatStyle;
uniform sampler2D uPattern;
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
  bend.y += uGroomUp;
  bend += vec3(sin(uTime * 1.7 + position.y * 3.0) * 0.13, 0.0, 0.0) * uMotion;
  bend.xy += offset * touch * 1.6;
  bend -= n * min(dot(bend, n), 0.0);
  float coatLength = uLength;
  if (uCoatStyle > 3.5 && position.z > 0.0) {
    coatLength *= texture2D(uPattern, vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5)).a;
  }
  vec3 p = position + normalize(n + bend * h) * coatLength * h * (1.0 - touch * 0.5);
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
uniform float uCoatStyle;
uniform sampler2D uPattern;
varying vec3 vRoot;
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float bodyRosette(vec2 p, float seed, float hollow) {
  // Uneven lobes and an off-center opening avoid stamped circular rings.
  vec2 warped = p + vec2(sin(p.y * 3.4 + seed), cos(p.x * 4.1 - seed)) * 0.19;
  float radius = length(warped);
  float edge = max(fwidth(radius), 0.035);
  float opening = length(warped + vec2(0.20, -0.13));
  float marking = 1.0 - smoothstep(0.96 - edge, 0.96 + edge, radius);
  marking *= mix(1.0, smoothstep(0.36 - edge, 0.36 + edge, opening), hollow);
  return marking * mix(1.0, smoothstep(-0.60, -0.15, p.x + p.y * 0.8), hollow);
}
void main() {
  vec3 n = normalize(vNormal);
  float h = vHeight;
  vec4 painted = vec4(0.0);
  bool patterned = uCoatStyle > 3.5 && vRoot.z > 0.0;
  if (patterned) painted = texture2D(uPattern, vec2(vRoot.x * 0.5 + 0.5, 0.5 - vRoot.y * 0.5));
  bool smoothFace = patterned && painted.a < 0.5;
  if (smoothFace && h > 0.0) discard;
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
  vec3 rootColor = uRootColor;
  vec3 tipColor = uTipColor;
  if (uCoatStyle > 0.5 && uCoatStyle < 1.5) {
    // Silver-gray crown fades into a snow-white lower face.
    float crown = smoothstep(-0.55, 0.85, vRoot.y);
    rootColor = mix(vec3(0.70), vec3(0.38), crown);
    tipColor = mix(vec3(0.96), vec3(0.74), crown);
    // Four asymmetric patches, with different silhouettes and generous gaps.
    vec2 p = vRoot.xy;
    float spots = bodyRosette((p - vec2(-0.68, 0.34)) / vec2(0.27, 0.21), 0.7, 1.0);
    spots = max(spots, bodyRosette((p - vec2(0.77, 0.04)) / vec2(-0.19, 0.30), 2.4, 0.0));
    spots = max(spots, bodyRosette((p - vec2(-0.57, -0.52)) / vec2(0.29, -0.24), 4.1, 0.0));
    spots = max(spots, bodyRosette((p - vec2(0.35, -0.69)) / vec2(-0.31, 0.23), 5.8, 1.0));
    rootColor = mix(rootColor, vec3(0.19), spots);
    tipColor = mix(tipColor, vec3(0.43), spots);
  } else if (uCoatStyle > 1.5 && uCoatStyle < 2.5) {
    // Rounded ears: white front, dark upper back fading to pale gray below.
    float top = smoothstep(-0.75, 0.85, vRoot.y);
    float front = smoothstep(0.20, 0.68, vRoot.z);
    rootColor = mix(mix(vec3(0.48), vec3(0.065), top), vec3(0.78), front);
    tipColor = mix(mix(vec3(0.76), vec3(0.19), top), vec3(0.98), front);
  } else if (uCoatStyle > 2.5 && uCoatStyle < 3.5) {
    // A few broad, broken rosettes read at avatar size without noisy speckles.
    vec2 p = vec2(vRoot.x * 8.0 + vRoot.y * 2.0, vRoot.y * 7.0 + vRoot.z * 2.5);
    p += sin(p.yx * 1.7) * 0.18;
    vec2 cell = floor(p);
    vec3 variation = hash33(vec3(cell, 4.7));
    vec2 q = fract(p) - 0.5 - (variation.xy - 0.5) * 0.16;
    q.x *= mix(0.75, 1.15, variation.z);
    q.y += sin(q.x * 8.0 + variation.x * 6.0) * 0.065;
    float radius = length(q);
    float edge = max(fwidth(radius), 0.018);
    float ring = smoothstep(0.16 - edge, 0.16 + edge, radius)
      * (1.0 - smoothstep(0.33 - edge, 0.33 + edge, radius));
    ring *= smoothstep(-0.22, -0.05, q.x + q.y * sin(cell.x + cell.y));
    rootColor = mix(vec3(0.58), vec3(0.12), ring);
    tipColor = mix(vec3(0.91), vec3(0.32), ring);
  } else if (patterned) {
    rootColor = painted.rgb * 0.55;
    tipColor = painted.rgb;
  }
  vec3 color = mix(rootColor, tipColor, h) * (0.6 + diffuse * 0.9) * mix(0.72, 1.0, h);
  color += tipColor * rim * h * 0.5;
  if (smoothFace) color = painted.rgb * (0.94 + diffuse * 0.06);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

export type FurAvatarPose = {
  yaw: number; pitch: number; press: number; time: number; active: boolean;
  lagX: number; lagY: number;
};
export type FurAvatarVariant = "closure" | "silverash" | "exusiai" | "saileach" | "mountain";

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
  const textures: ReturnType<typeof createExusiaiCoat>[] = [];
  const sphere = new SphereGeometry(1, 32, 24);
  geometries.add(sphere);

  const fur = (base: BufferGeometry, length: number, density: number, coatStyle = 0, colors = ["#131d28", "#354654"], groomUp = 0) => {
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
        uRootColor: { value: new Color(colors[0]) }, uTipColor: { value: new Color(colors[1]) },
        uDensity: { value: density }, uCoatStyle: { value: coatStyle },
        uGroomUp: { value: groomUp },
        uPattern: { value: null },
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

  // Build additional characters only when selected. All rigs share one WebGL
  // context and the base sphere; only the selected rig is submitted for drawing.
  const closureCoats = [...coats];
  const buildSilverash = () => {
    const firstCoat = coats.length;
    const silverRig = new Group();
    scene.add(silverRig);
    const head = fur(sphere, 0.11, 42, 1);
    head.scale.set(0.67, 0.62, 0.56);
    head.position.set(-0.11, -0.12, 0);
    silverRig.add(head);

    // Open at the front: a raised charcoal half-collar sits behind the cheeks.
    // Uneven heights and thickness avoid a rigid ring; longer fur is groomed up.
    const ruffCurve = new CatmullRomCurve3([
      new Vector3(-0.65, 0, 0.12), new Vector3(-0.72, 0.08, -0.12),
      new Vector3(-0.52, 0.13, -0.39), new Vector3(-0.20, 0.21, -0.49),
      new Vector3(0.17, 0.17, -0.51), new Vector3(0.48, 0.15, -0.38),
      new Vector3(0.70, 0.09, -0.10), new Vector3(0.64, 0.02, 0.14),
    ]);
    const ruffGeometry = new TubeGeometry(ruffCurve, 48, 0.095, 10, false);
    // Vary the thickness as well as the outline, using one mesh for the collar.
    const ruffPositions = ruffGeometry.getAttribute("position");
    for (let segment = 0; segment <= 48; segment++) {
      const t = segment / 48;
      const center = ruffCurve.getPointAt(t);
      const taper = Math.min(1, 0.18 + Math.sin(t * Math.PI) * 3);
      const thickness = taper * (1 + Math.sin(t * Math.PI * 6 + 0.7) * 0.19
        + Math.sin(t * Math.PI * 14 - 0.4) * 0.11);
      for (let side = 0; side <= 10; side++) {
        const index = segment * 11 + side;
        ruffPositions.setXYZ(index,
          center.x + (ruffPositions.getX(index) - center.x) * thickness,
          center.y + (ruffPositions.getY(index) - center.y) * thickness,
          center.z + (ruffPositions.getZ(index) - center.z) * thickness);
      }
    }
    ruffGeometry.computeVertexNormals();
    geometries.add(ruffGeometry);
    const ruff = fur(ruffGeometry, 0.20, 44, 0, ["#303030", "#686868"], 3.2);
    ruff.position.set(-0.11, -0.38, 0);
    silverRig.add(ruff);

    const ears = [-1, 1].map(side => {
      const pivot = new Group();
      pivot.position.set(-0.11 + side * 0.43, 0.42, -0.015);
      pivot.rotation.z = -side * 0.17;
      const ear = fur(sphere, 0.08, 48, 2);
      ear.scale.set(0.25, 0.27, 0.16);
      pivot.add(ear);
      silverRig.add(pivot);
      return pivot;
    });

    const tail = new Group();
    tail.position.set(0.25, -0.41, -0.43);
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0, 0), new Vector3(0.38, -0.08, -0.14),
      new Vector3(0.66, 0.14, -0.25), new Vector3(0.61, 0.46, -0.34),
      new Vector3(0.44, 0.54, -0.39), new Vector3(0.35, 0.43, -0.40),
    ]);
    const tailGeometry = new TubeGeometry(curve, 32, 0.105, 12, false);
    geometries.add(tailGeometry);
    tail.add(fur(tailGeometry, 0.058, 56, 3));
    const tip = fur(sphere, 0.055, 48, 0, ["#8a8d90", "#d3d5d6"]);
    tip.scale.setScalar(0.108);
    tip.position.copy(curve.getPoint(1));
    tail.add(tip);
    silverRig.add(tail);

    const silverEyeMaterial = new MeshBasicMaterial({ color: "#42474b" });
    materials.add(silverEyeMaterial);
    const silverEyes = [-0.32, 0.09].map(x => {
      const eye = new Mesh(sphere, silverEyeMaterial);
      eye.position.set(x, -0.07, 0.59);
      eye.scale.set(0.075, 0.115, 0.038);
      eye.rotation.z = -0.08;
      silverRig.add(eye);
      return eye;
    });
    return { rig: silverRig, ears, tail, eyes: silverEyes, coats: coats.slice(firstCoat) };
  };
  let silverash: ReturnType<typeof buildSilverash> | undefined;
  const buildExusiai = () => {
    const firstCoat = coats.length;
    const angelRig = new Group();
    scene.add(angelRig);
    const coat = createExusiaiCoat();
    textures.push(coat);
    const head = fur(sphere, 0.10, 42, 4, ["#b8222e", "#ff3b42"]);
    head.material.uniforms.uPattern.value = coat;
    head.scale.set(0.74, 0.70, 0.74);
    head.position.set(0, -0.13, 0);
    angelRig.add(head);

    // Saturated yellow fades to pale yellow on the halo and white on each wing.
    const accessoryMaterial = new MeshBasicMaterial({ vertexColors: true });
    materials.add(accessoryMaterial);
    const paintAccessory = (geometry: BufferGeometry, axis: "y" | "z") => {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      const extent = Math.max(bounds.max[axis] - bounds.min[axis], 0.001);
      const positions = geometry.getAttribute("position");
      const colors = new Float32Array(positions.count * 3);
      const yellow = new Color("#ffe000");
      const gradientEnd = new Color(axis === "z" ? "#fff2a8" : "#ffffff");
      const color = new Color();
      for (let i = 0; i < positions.count; i++) {
        const coordinate = axis === "z" ? positions.getZ(i) : positions.getY(i);
        const t = (coordinate - bounds.min[axis]) / extent;
        // Keep the halo's pale rear visible at its sides when the head occludes it.
        const fade = axis === "z"
          ? Math.max(0, Math.min(1, (1 - t - 0.22) / 0.33))
          : Math.min(1, (1 - t) * 1.15);
        color.copy(yellow).lerp(gradientEnd, fade);
        color.toArray(colors, i * 3);
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    };
    // Detached diamonds leave a clear gap beside the plush body.
    const feather = new Shape();
    feather.moveTo(0, 0.115);
    feather.lineTo(0.075, 0);
    feather.lineTo(0, -0.115);
    feather.lineTo(-0.075, 0);
    feather.closePath();
    const featherGeometry = new ExtrudeGeometry(feather, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, steps: 1 });
    geometries.add(featherGeometry);
    paintAccessory(featherGeometry, "y");
    const angelWings = [-1, 1].map(side => {
      const pivot = new Group();
      pivot.position.set(side * 1.05, -0.10, -0.12);
      for (let i = 0; i < 3; i++) {
        const diamond = new Mesh(featherGeometry, accessoryMaterial);
        diamond.position.set(side * (i === 1 ? 0.025 : 0), (1 - i) * 0.28, 0);
        diamond.rotation.z = -side * (0.25 + i * 0.25);
        pivot.add(diamond);
      }
      angelRig.add(pivot);
      return pivot;
    });

    const haloCurve = new CatmullRomCurve3(Array.from({ length: 16 }, (_, i) => {
      const angle = i * Math.PI / 8;
      // A real circular ring, tilted behind the crown as in the supplied drawing.
      return new Vector3(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62 * 0.55, Math.sin(angle) * 0.62 * Math.sqrt(1 - 0.55 ** 2));
    }), true);
    const haloGeometry = new TubeGeometry(haloCurve, 48, 0.10, 10, true);
    geometries.add(haloGeometry);
    paintAccessory(haloGeometry, "z");
    const halo = new Mesh(haloGeometry, accessoryMaterial);
    halo.position.set(0.02, 0.70, -0.25);
    halo.rotation.z = 0;
    angelRig.add(halo);

    return { rig: angelRig, wings: angelWings, halo, eyes: [] as Mesh[], coats: coats.slice(firstCoat) };
  };
  let exusiai: ReturnType<typeof buildExusiai> | undefined;
  const buildSaileach = () => {
    const firstCoat = coats.length;
    const willowRig = new Group();
    scene.add(willowRig);
    const coat = createSaileachCoat();
    textures.push(coat);
    const head = fur(sphere, 0.10, 42, 4, ["#b79a58", "#f4d68b"]);
    head.material.uniforms.uPattern.value = coat;
    head.scale.set(0.72, 0.70, 0.72);
    head.position.set(0, -0.08, 0);
    willowRig.add(head);

    // Roots start behind the head (-Z), sweep along its sides and point forward (+Z).
    const hornCurve = new CatmullRomCurve3([
      new Vector3(0.48, 0.08, -0.48), new Vector3(0.65, 0.23, -0.30),
      new Vector3(0.64, 0.35, -0.02), new Vector3(0.53, 0.40, 0.29),
      new Vector3(0.36, 0.35, 0.55),
    ]);
    const hornSegments = 72, hornSides = 12;
    const hornGeometry = new TubeGeometry(hornCurve, hornSegments, 1, hornSides, false);
    geometries.add(hornGeometry);
    const positions = hornGeometry.getAttribute("position");
    const hornColors = new Float32Array(positions.count * 3);
    const root = new Color("#51647f"), tip = new Color("#e1dfcd"), color = new Color();
    const direction = new Vector3(), vertex = new Vector3();
    for (let ring = 0; ring <= hornSegments; ring++) {
      const t = ring / hornSegments, center = hornCurve.getPointAt(t);
      // Five broad growth ridges are part of the volume, so they remain visible in profile.
      const phase = (t * 5.5) % 1;
      const ridge = Math.sin(Math.PI * phase) ** 4;
      const radius = 0.115 * (1 - t) ** 0.72 * (1 + ridge * 0.18);
      for (let side = 0; side <= hornSides; side++) {
        const i = ring * (hornSides + 1) + side;
        direction.fromBufferAttribute(positions, i).sub(center).normalize();
        vertex.copy(center).addScaledVector(direction, radius);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
        color.copy(root).lerp(tip, t).multiplyScalar(0.78 + ridge * 0.18 + Math.max(0, direction.z) * 0.12);
        color.toArray(hornColors, i * 3);
      }
    }
    hornGeometry.computeVertexNormals();
    hornGeometry.computeBoundingSphere();
    hornGeometry.setAttribute("color", new Float32BufferAttribute(hornColors, 3));
    const hornMaterial = new MeshBasicMaterial({ vertexColors: true });
    materials.add(hornMaterial);
    for (const side of [-1, 1]) {
      const horn = new Mesh(hornGeometry, hornMaterial);
      horn.scale.set(side, 1, 1);
      willowRig.add(horn);
    }

    const braid = new Group();
    braid.position.set(0.56, -0.13, 0.21);
    const braidCurve = new CatmullRomCurve3([
      new Vector3(0, 0, 0), new Vector3(0.06, -0.13, 0.01),
      new Vector3(0, -0.27, 0.02), new Vector3(0.07, -0.40, 0.01),
      new Vector3(0.015, -0.54, 0),
    ]);
    const braidGeometry = new TubeGeometry(braidCurve, 24, 0.10, 8, false);
    geometries.add(braidGeometry);
    braid.add(fur(braidGeometry, 0.025, 52, 0, ["#b99951", "#f4d68b"]));
    const ribbonMaterial = new MeshBasicMaterial({ color: "#304768" });
    materials.add(ribbonMaterial);
    const tie = new Mesh(sphere, ribbonMaterial);
    tie.scale.set(0.12, 0.055, 0.105);
    tie.position.copy(braidCurve.getPoint(0.9));
    braid.add(tie);
    willowRig.add(braid);
    return { rig: willowRig, braid, eyes: [] as Mesh[], coats: coats.slice(firstCoat) };
  };
  let saileach: ReturnType<typeof buildSaileach> | undefined;
  const buildMountain = () => {
    const firstCoat = coats.length;
    const tigerRig = new Group();
    scene.add(tigerRig);
    const coat = createMountainCoat();
    textures.push(coat);
    const head = fur(sphere, 0.105, 42, 4, ["#aeb0b0", "#f0f0ed"]);
    head.material.uniforms.uPattern.value = coat;
    head.scale.set(0.74, 0.71, 0.74);
    head.position.set(0, -0.10, 0);
    tigerRig.add(head);
    // Small rounded black ears with white inner tufts; no human face or floating muzzle.
    const ears = [-1, 1].map(side => {
      const pivot = new Group();
      pivot.position.set(side * 0.49, 0.49, -0.06);
      pivot.rotation.z = -side * 0.18;
      const ear = fur(sphere, 0.065, 46, 0, ["#232629", "#45494d"]);
      ear.scale.set(0.225, 0.23, 0.16);
      pivot.add(ear);
      const inner = fur(sphere, 0.04, 48, 0, ["#b8baba", "#f0f0ed"]);
      inner.scale.set(0.14, 0.15, 0.095);
      inner.position.set(0, -0.005, 0.11);
      pivot.add(inner);
      tigerRig.add(pivot);
      return pivot;
    });
    // A compact ringed tail curls behind the body. Six contiguous furry pieces
    // keep the bands around its full circumference without a new shader variant.
    const tail = new Group();
    tail.position.set(0.35, -0.42, -0.40);
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0, 0), new Vector3(0.30, -0.06, -0.07),
      new Vector3(0.53, 0.10, -0.08), new Vector3(0.51, 0.36, -0.10),
      new Vector3(0.36, 0.46, -0.08),
    ]);
    for (let band = 0; band < 6; band++) {
      const part = new CatmullRomCurve3(Array.from({ length: 7 }, (_, i) => curve.getPoint((band + i / 6) / 6)));
      const geometry = new TubeGeometry(part, 8, 0.09, 10, false);
      geometries.add(geometry);
      tail.add(fur(geometry, 0.04, 48, 0, band % 2 ? ["#25282b", "#484c50"] : ["#aeb0b0", "#f0f0ed"]));
    }
    const tailTip = fur(sphere, 0.04, 48, 0, ["#25282b", "#484c50"]);
    tailTip.scale.setScalar(0.09);
    tailTip.position.copy(curve.getPoint(1));
    tail.add(tailTip);
    tigerRig.add(tail);
    return { rig: tigerRig, ears, tail, eyes: [] as Mesh[], coats: coats.slice(firstCoat) };
  };
  let mountain: ReturnType<typeof buildMountain> | undefined;
  let lost = false;
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; };
  const contextRestored = () => { lost = false; };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
  let size = 0;
  return {
    draw(context: CanvasRenderingContext2D, pixels: number, pose: FurAvatarPose, variant: FurAvatarVariant = "closure") {
      if (lost) return false;
      if (size !== pixels) { renderer.setSize(pixels, pixels, false); size = pixels; }
      const press = Math.max(0, pose.press);
      const snow = variant === "silverash" ? (silverash ??= buildSilverash()) : undefined;
      const angel = variant === "exusiai" ? (exusiai ??= buildExusiai()) : undefined;
      const willow = variant === "saileach" ? (saileach ??= buildSaileach()) : undefined;
      const tiger = variant === "mountain" ? (mountain ??= buildMountain()) : undefined;
      rig.visible = !snow && !angel && !willow && !tiger;
      if (silverash) silverash.rig.visible = !!snow;
      if (exusiai) exusiai.rig.visible = !!angel;
      if (saileach) saileach.rig.visible = !!willow;
      if (mountain) mountain.rig.visible = !!tiger;
      const activeRig = snow?.rig ?? angel?.rig ?? willow?.rig ?? tiger?.rig ?? rig;
      activeRig.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
      const avatarScale = willow ? 1.16 : snow || tiger ? 1.10 : angel ? 1.05 : 1;
      activeRig.scale.set(avatarScale * (1 + pose.press * 0.04), avatarScale * (1 - pose.press * 0.07), avatarScale);
      if (snow) {
        snow.tail.rotation.z = pose.lagX * 0.3 + press * 0.10 + (pose.active ? Math.sin(pose.time * 1.7) * 0.075 : 0);
        for (let i = 0; i < snow.ears.length; i++) {
          const side = i === 0 ? -1 : 1;
          snow.ears[i].rotation.z = -side * (0.17 + press * 0.11 + pose.lagY * 0.2);
          snow.ears[i].rotation.y = side * (0.06 + pose.lagX * 0.35);
        }
      } else if (angel) {
        angel.halo.position.y = 0.70 + (pose.active ? Math.sin(pose.time * 1.7) * 0.018 : 0) + pose.lagY * 0.05;
        angel.halo.rotation.z = 0;
        for (let i = 0; i < angel.wings.length; i++) {
          const side = i === 0 ? -1 : 1;
          angel.wings[i].rotation.y = side * (0.12 + pose.lagX * 0.4 + press * 0.22);
          angel.wings[i].rotation.z = side * (pose.lagY * 0.15 + (pose.active ? Math.sin(pose.time * 2.3) * 0.045 : 0));
        }
      } else if (willow) {
        willow.braid.rotation.z = pose.lagX * 0.3 + (pose.active ? Math.sin(pose.time * 1.7) * 0.035 : 0);
      } else if (tiger) {
        tiger.tail.rotation.z = pose.lagX * 0.25 + (pose.active ? Math.sin(pose.time * 1.5) * 0.05 : 0);
        tiger.ears.forEach((ear, i) => { ear.rotation.z = (i === 0 ? 1 : -1) * (0.18 + press * 0.10); });
      } else {
        for (let i = 0; i < wings.length; i++) {
          const side = i === 0 ? -1 : 1;
          wings[i].rotation.y = side * (0.14 + pose.lagX * 0.55 + press * 0.3 + (pose.active ? Math.sin(pose.time * 2) * 0.075 : 0));
          wings[i].rotation.z = side * (pose.lagY * 0.25 - press * 0.08);
        }
      }
      for (const eye of snow?.eyes ?? angel?.eyes ?? willow?.eyes ?? tiger?.eyes ?? eyes) eye.scale.y = (snow ? 0.115 : angel ? 0.14 : 0.16) * (1 - press * 0.38);
      for (const material of snow?.coats ?? angel?.coats ?? willow?.coats ?? tiger?.coats ?? closureCoats) {
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
      for (const texture of textures) texture.dispose();
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
