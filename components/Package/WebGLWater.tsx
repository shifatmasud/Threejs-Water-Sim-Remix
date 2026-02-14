/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTheme } from '../../Theme.tsx';

// --- Shaders (Ported from water.js) ---

const commonVertexShader = `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const dropShaderFs = `
  const float PI = 3.141592653589793;
  uniform sampler2D u_texture;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_strength;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    
    float drop = max(0.0, 1.0 - length(u_center - v_uv) / u_radius);
    drop = 0.5 - cos(drop * PI) * 0.5;
    info.r += drop * u_strength;

    gl_FragColor = info;
  }
`;

const updateShaderFs = `
  uniform sampler2D u_texture;
  uniform vec2 u_delta;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    
    vec2 dx = vec2(u_delta.x, 0.0);
    vec2 dy = vec2(0.0, u_delta.y);
    
    float average = (
      texture2D(u_texture, v_uv - dx).r +
      texture2D(u_texture, v_uv + dx).r +
      texture2D(u_texture, v_uv - dy).r +
      texture2D(u_texture, v_uv + dy).r
    ) * 0.25;
    
    info.g += (average - info.r) * 2.0; // Acceleration
    info.g *= 0.995; // Damping
    info.r += info.g; // New position
    
    gl_FragColor = info;
  }
`;

const normalShaderFs = `
  uniform sampler2D u_texture;
  uniform vec2 u_delta;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_texture, v_uv);
    vec3 dx = vec3(u_delta.x, texture2D(u_texture, v_uv + vec2(u_delta.x, 0.0)).r - info.r, 0.0);
    vec3 dy = vec3(0.0, texture2D(u_texture, v_uv + vec2(0.0, u_delta.y)).r - info.r, u_delta.y);
    info.ba = normalize(cross(dy, dx)).xz;
    gl_FragColor = info;
  }
`;

const waterVertexShader = `
  uniform sampler2D u_waterTexture;
  varying vec2 v_uv;

  void main() {
    v_uv = uv;
    vec4 info = texture2D(u_waterTexture, uv);
    
    vec3 pos = position;
    pos.z += info.r; // Displace vertex along its normal (z-axis for a plane on xy)
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  uniform sampler2D u_waterTexture;
  varying vec2 v_uv;

  void main() {
    vec4 info = texture2D(u_waterTexture, v_uv);
    
    // Visualize normals for debugging
    // The normal is (info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a)
    // We use the stored xz components (in b and a channels) and recalculate y.
    vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);
    
    // Map normal from [-1,1] to [0,1] for viewing
    gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
  }
`;


const WebGLWater = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const { theme, themeName } = useTheme();

  const waterSimulation = useMemo(() => {
    const SIZE = 256;
    let renderer: THREE.WebGLRenderer;
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new THREE.PlaneGeometry(2, 2);
    
    const targets = {
      read: new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.FloatType }),
      write: new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.FloatType }),
      swap: function() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
      }
    };

    const dropMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_center: { value: new THREE.Vector2() },
        u_radius: { value: 0.0 },
        u_strength: { value: 0.0 },
      },
      vertexShader: commonVertexShader,
      fragmentShader: dropShaderFs,
    });

    const updateMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_delta: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) },
      },
      vertexShader: commonVertexShader,
      fragmentShader: updateShaderFs,
    });

    const normalMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_delta: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) },
      },
      vertexShader: commonVertexShader,
      fragmentShader: normalShaderFs,
    });

    const mesh = new THREE.Mesh(plane, dropMaterial);
    scene.add(mesh);
    
    return {
      targets,
      init: (r: THREE.WebGLRenderer) => { renderer = r; },
      addDrop: (x: number, y: number, radius: number, strength: number) => {
        mesh.material = dropMaterial;
        dropMaterial.uniforms.u_center.value.set(x, y);
        dropMaterial.uniforms.u_radius.value = radius;
        dropMaterial.uniforms.u_strength.value = strength;
        dropMaterial.uniforms.u_texture.value = targets.read.texture;
        
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      step: () => {
        mesh.material = updateMaterial;
        updateMaterial.uniforms.u_texture.value = targets.read.texture;
        
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      updateNormals: () => {
        mesh.material = normalMaterial;
        normalMaterial.uniforms.u_texture.value = targets.read.texture;
        
        renderer.setRenderTarget(targets.write);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        targets.swap();
      },
      getTexture: () => targets.read.texture
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // --- Core Three.js Scene ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.01, 100);
    camera.position.set(3, 2, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);
    waterSimulation.init(renderer);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // --- Lighting & Skybox ---
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(2.0, 2.0, -1.0);
    scene.add(light);

    const cubemapLoader = new THREE.CubeTextureLoader();
    cubemapLoader.setPath('/webgl-water-master/');
    const textureCube = cubemapLoader.load(['xpos.jpg', 'xneg.jpg', 'ypos.jpg', 'ypos.jpg', 'zpos.jpg', 'zneg.jpg']);
    scene.background = textureCube;

    // --- Geometry ---
    const poolGroup = new THREE.Group();
    poolGroup.position.y = 0.5;
    scene.add(poolGroup);
    
    const poolSize = 2;
    const poolWallHeight = 1;
    const tilesTexture = new THREE.TextureLoader().load('/webgl-water-master/tiles.jpg', (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
    });
    const wallMaterial = new THREE.MeshStandardMaterial({ map: tilesTexture, roughness: 0.8 });
    
    // Walls
    const wallGeo = new THREE.PlaneGeometry(poolSize, poolWallHeight);
    const wallBack = new THREE.Mesh(wallGeo, wallMaterial);
    wallBack.position.set(0, -poolWallHeight / 2, -poolSize / 2);
    poolGroup.add(wallBack);
    const wallFront = new THREE.Mesh(wallGeo, wallMaterial);
    wallFront.rotation.y = Math.PI;
    wallFront.position.set(0, -poolWallHeight / 2, poolSize / 2);
    poolGroup.add(wallFront);
    const wallLeft = new THREE.Mesh(wallGeo, wallMaterial);
    wallLeft.rotation.y = Math.PI / 2;
    wallLeft.position.set(-poolSize / 2, -poolWallHeight / 2, 0);
    poolGroup.add(wallLeft);
    const wallRight = new THREE.Mesh(wallGeo, wallMaterial);
    wallRight.rotation.y = -Math.PI / 2;
    wallRight.position.set(poolSize / 2, -poolWallHeight / 2, 0);
    poolGroup.add(wallRight);

    // Floor (is now just for the very bottom, below the water)
    const floorGeo = new THREE.PlaneGeometry(poolSize, poolSize);
    const floor = new THREE.Mesh(floorGeo, wallMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -poolWallHeight;
    poolGroup.add(floor);
    
    // Water Mesh
    const waterGeo = new THREE.PlaneGeometry(poolSize, poolSize, 256, 256);
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: { u_waterTexture: { value: null } },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
    waterMesh.rotation.x = -Math.PI / 2;
    poolGroup.add(waterMesh);
    
    // Sphere
    const sphereRadius = 0.25;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(sphereRadius, 32, 32),
      new THREE.MeshStandardMaterial({
        color: theme.Color.Base.Content[1],
        roughness: 0.1,
        metalness: 0.9,
        envMap: textureCube,
      })
    );
    sphere.position.set(-0.4, -0.25, 0.2);
    scene.add(sphere);

    // --- Interaction ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isDragging = false;
    
    // Create a conceptual plane for raycasting, aligned with the water mesh
    const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -poolGroup.position.y);

    const onPointerMove = (event: PointerEvent) => {
        if (!isDragging) return;
        
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(interactionPlane, intersectPoint);
        
        // Convert world coordinates to water texture UVs ([0,1] range)
        const uvX = intersectPoint.x / poolSize + 0.5;
        const uvY = intersectPoint.z / poolSize + 0.5;

        if (uvX > 0 && uvX < 1 && uvY > 0 && uvY < 1) {
          waterSimulation.addDrop(uvX, 1.0 - uvY, 0.03, 0.01);
        }
    };

    const onPointerDown = (event: PointerEvent) => {
      isDragging = true;
      onPointerMove(event);
    }
    const onPointerUp = () => { isDragging = false; }
    
    currentMount.addEventListener('pointerdown', onPointerDown);
    currentMount.addEventListener('pointermove', onPointerMove);
    currentMount.addEventListener('pointerup', onPointerUp);
    currentMount.addEventListener('pointerleave', onPointerUp);

    // --- Resize & Animation Loop ---
    const resizeObserver = new ResizeObserver(() => {
        const width = currentMount.clientWidth;
        const height = currentMount.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
    resizeObserver.observe(currentMount);

    let animationFrameId: number;
    const animate = () => {
      controls.update();
      
      waterSimulation.step();
      waterSimulation.updateNormals();
      waterMaterial.uniforms.u_waterTexture.value = waterSimulation.getTexture();
      
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      currentMount.removeEventListener('pointerdown', onPointerDown);
      currentMount.removeEventListener('pointermove', onPointerMove);
      currentMount.removeEventListener('pointerup', onPointerUp);
      currentMount.removeEventListener('pointerleave', onPointerUp);
      
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      currentMount.removeChild(renderer.domElement);
      
      // Dispose of all Three.js objects
      controls.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      textureCube.dispose();
      tilesTexture.dispose();
      waterSimulation.targets.read.dispose();
      waterSimulation.targets.write.dispose();
    };
  }, [theme, themeName, waterSimulation]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }} />;
};

export default WebGLWater;
