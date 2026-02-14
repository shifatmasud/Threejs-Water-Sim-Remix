### 1. System Overview (Bird’s Eye View)

-   **What problem this system solves**
    The system solves the problem of rendering a physically plausible, interactive, and visually rich water surface in real-time within a web browser. It includes optical effects like reflections, refractions, and caustics.

-   **Core idea of how water is simulated (conceptual, not mathematical)**
    The water surface is represented by a heightfield grid stored in a texture. The simulation works by repeatedly applying a simple wave propagation formula to every point on this grid. Disturbances (like ripples from user interaction or a moving sphere) are "drawn" onto this texture as initial energy. In each step, the system calculates the next state of the water based on the current state, creating a dynamic animation. This entire process happens on the GPU.

-   **Real-time vs precomputed logic**
    The system is entirely real-time. The water simulation, lighting, and all optical effects are calculated dynamically every frame. There is no precomputed data besides the initial asset textures (skybox, tiles).

---

### 2. Core Modules (Abstraction Layers)

-   **Renderer Core (`lightgl.js`)**
    -   **Purpose**: Provides a high-level, OpenGL 1.x-style API wrapper around the more verbose WebGL API. It abstracts away the boilerplate of creating buffers, compiling shaders, managing matrices, and handling mouse/keyboard events.
    -   **Inputs**: Mesh data, shader source code, texture data, uniform values.
    -   **Outputs**: Rendered pixels on the canvas.
    -   **Dependencies**: None. It is the foundational graphics layer.
    -   **Runs on**: CPU (to issue commands to the GPU).
    -   **Lifecycle**: Initialized once at startup (`GL.create()`). Its methods are called every frame during the render phase.

-   **Simulation Engine (`water.js`)**
    -   **Purpose**: Manages the state and physics of the water surface. It is responsible for propagating waves and calculating surface normals.
    -   **Inputs**: Disturbance data (drop position, radius, strength), sphere position and radius.
    -   **Outputs**: A floating-point texture containing the water's height, velocity, and normal data for each point on the surface.
    -   **Dependencies**: Renderer Core (for GPU access, shaders, and textures).
    -   **Runs on**: GPU (exclusively, using render-to-texture techniques).
    -   **Lifecycle**:
        -   **Init**: Creates two textures for ping-ponging state and compiles simulation-specific shaders.
        -   **Update**: `stepSimulation()` and `updateNormals()` are called each frame to advance the simulation.
        -   **Render**: Does not render to the screen; it only renders to its internal textures.

-   **Shader System (GLSL code within `.js` files)**
    -   **Purpose**: A collection of small GPU programs that perform all visual and simulation calculations.
    -   **Inputs**: Mesh vertex data, textures (simulation state, caustics, skybox), and uniforms (light direction, camera position, time).
    -   **Outputs**: Pixel colors for the final image or data values for intermediate textures.
    -   **Dependencies**: Tied to the Renderer Core and Simulation Engine.
    -   **Runs on**: GPU.
    -   **Lifecycle**: Compiled at initialization. Executed every frame during simulation and rendering passes.

-   **Reflection / Refraction System (`renderer.js` shaders)**
    -   **Purpose**: To calculate realistic optical effects for the water surface and submerged objects.
    -   **Inputs**: Camera position ("eye"), water surface normals, world geometry (skybox, sphere, pool walls).
    -   **Outputs**: Final pixel color for the water surface.
    -   **Dependencies**: Simulation Engine (for normals), Scene Integration Layer (for geometry info).
    -   **Runs on**: GPU (implemented via raytracing inside the water fragment shader).
    -   **Lifecycle**: Executed during the final rendering pass of each frame.

-   **Texture / Framebuffer Manager (`lightgl.js`, `water.js`, `cubemap.js`)**
    -   **Purpose**: Manages GPU memory for images and render targets. The core of this system is the "ping-pong" technique where two textures (`textureA`, `textureB` in `water.js`) are used alternately as input and output for the simulation, avoiding costly GPU-to-CPU data transfers.
    -   **Inputs**: Image elements, texture dimensions, configuration options.
    -   **Outputs**: Texture objects that can be bound for reading or attached to a framebuffer for writing.
    -   **Dependencies**: Renderer Core.
    -   **Runs on**: CPU (to manage handles) and GPU (for storage and operations).
    -   **Lifecycle**: Textures are created during initialization. They are repeatedly bound and written to during the per-frame update and render loops.

-   **Interaction Handler & App Controller (`main.js`)**
    -   **Purpose**: The main application entry point. It orchestrates the entire system, handles user input, manages the animation loop, and drives the state of the simulation and scene.
    -   **Inputs**: User actions (mouse drag, key presses).
    -   **Outputs**: Calls to the Simulation Engine to add disturbances and calls to the Renderer to draw the scene.
    -   **Dependencies**: All other modules.
    -   **Runs on**: CPU.
    -   **Lifecycle**: Initializes all systems. Runs the main `animate` loop which calls `update` and `draw` every frame.

-   **Scene Integration Layer (`renderer.js`)**
    -   **Purpose**: Renders the complete 3D scene. It combines the output of the water simulation with other scene elements like the pool, the sphere, and the skybox. It is also responsible for generating the caustics texture.
    -   **Inputs**: Water simulation texture, cubemap, scene object meshes (sphere, cube), light direction, sphere position.
    -   **Outputs**: The final rendered image on the screen.
    -   **Dependencies**: Renderer Core, Simulation Engine, Shader System.
    -   **Runs on**: CPU (to issue draw calls) and GPU (to execute rendering shaders).
    -   **Lifecycle**:
        -   **Init**: Creates meshes and compiles rendering shaders.
        -   **Update**: `updateCaustics()` is called each frame before the main render.
        -   **Render**: `renderCube()`, `renderWater()`, `renderSphere()` are called each frame to draw the scene.

---

### 3. Data Flow (From Frame Start → Frame End)

1.  **Frame Start**: The `animate` loop in `main.js` is triggered by the browser.
2.  **CPU Physics**: `main.js` calculates the sphere's new position based on gravity and velocity (CPU-side physics).
3.  **Simulation Input**: The sphere's movement is passed to the `Simulation Engine` (`water.js`), which "stamps" the sphere's displacement into the water heightfield texture. User mouse drags are also translated into "drop" disturbances.
4.  **GPU Simulation - Wave Propagation**: The `Simulation Engine` executes a shader pass. It reads the current water state from `Texture A`, calculates the next state based on neighboring pixel values, and writes the result to `Texture B`.
5.  **GPU Simulation - Normals**: The engine executes another shader pass, reading the new height data from `Texture B` to compute surface normals, which are also written into the texture. `Texture A` and `B` are then swapped for the next frame.
6.  **GPU Pre-Render - Caustics**: The `Scene Integration Layer` (`renderer.js`) takes the final water state texture. It executes a pass that simulates light refracting through the water surface to generate a caustics map, which is rendered into another texture (`causticTex`).
7.  **Final Composite Render**: The `Scene Integration Layer` renders the final scene to the screen.
    -   It draws the pool walls (`cubeMesh`), sampling the caustics texture to add light patterns.
    -   It draws the water surface (`waterMesh`), displacing vertices using the height data from the simulation texture. The fragment shader uses the normal data, the skybox cubemap, and raytracing to calculate reflections and refractions.
    -   It draws the sphere, which is also affected by caustics and appears wet or submerged based on the water height.

---

### 4. Rendering Pipeline Breakdown

-   **How many render passes exist**: There are four primary passes per frame.
-   **What each pass renders**:
    1.  **Water Physics Pass**: Renders a full-screen quad to a texture. The fragment shader calculates the next wave height and velocity. This is a pure data calculation, not a visual render.
    2.  **Water Normal Pass**: Renders a full-screen quad to a texture. The fragment shader reads the heights from the physics pass and calculates the surface normals.
    3.  **Caustics Pass**: Renders the water mesh from the light's point of view. The vertex shader simulates light ray refraction, and the fragment shader calculates the resulting light intensity, which is "splatted" onto the caustics texture.
    4.  **Final Scene Pass**: Renders the actual 3D geometry (pool, water surface, sphere) to the screen from the camera's point of view, using the textures generated in the previous passes as inputs for lighting and texturing.
-   **Why multiple passes are needed**: The system decouples simulation from rendering. The simulation passes are needed to evolve the water state over time. The caustics pass is a pre-calculation needed to correctly light the final scene. This dependency chain (Physics → Normals → Caustics → Final Render) necessitates multiple passes.
-   **How framebuffers are used conceptually**: Framebuffers act as temporary, off-screen canvases on the GPU. The first three passes don't draw to the screen; they draw their results (data, not colors) into textures attached to framebuffers. These textures are then fed back as inputs to the shaders in subsequent passes.

---

### 5. Abstraction Tree

```
WebApp (`main.js`)
 └── GraphicsSystem
      ├── AppController (Input, Physics, Main Loop)
      │
      ├── SimulationEngine (`water.js`)
      │    ├── Heightfield (Managed via Texture Ping-Pong)
      │    ├── DisturbanceHandler (Drop/Sphere Shaders)
      │    └── NormalGenerator (Normal Shader)
      │
      ├── RenderingPipeline (`renderer.js`)
      │    ├── SceneManager (Draw calls for Cube, Water, Sphere)
      │    ├── OpticalEffects (Water Shader: Reflection/Refraction/Fresnel)
      │    └── Lighting (Caustics Shader, Light Uniforms)
      │
      └── GLWrapper (`lightgl.js`)
           ├── ShaderManager
           ├── BufferManager (Mesh, Buffer)
           ├── MatrixStack
           └── TextureManager (Texture, Cubemap)
```

---

### 6. Performance Strategy

-   **Where GPU does heavy lifting**: Virtually everything. The per-pixel water physics simulation, normal calculations, caustics generation, raytraced reflections/refractions, and final scene lighting are all executed in parallel on the GPU.
-   **Where CPU stays light**: The CPU is an orchestrator. It handles user input, runs trivial physics for a single sphere, and submits a small, fixed number of draw calls each frame. It avoids reading data back from the GPU, which is a major performance bottleneck.
-   **Optimization patterns used**:
    -   **Render-to-Texture (Ping-Pong)**: The entire simulation is kept on the GPU, avoiding slow GPU-CPU-GPU round trips.
    -   **Data in Textures**: Physical properties (height, velocity, normals) are encoded into texture channels, leveraging the GPU's massively parallel texture processing hardware for physics calculations.
    -   **Minimal Draw Calls**: The entire water surface is a single draw call. The scene geometry is minimal.
-   **Why it has zero performance issues even years later**: The design is incredibly efficient. It offloads the most computationally expensive parts (the N x N grid simulation) to the hardware best suited for it (the GPU) and keeps the CPU's workload minimal and constant, regardless of simulation complexity.

---

### 7. Simplified Mental Model

-   **Analogy**: The system is like a specialized weather simulation running on a TV screen.
    1.  The `Simulation Engine` is the "weather model" that only calculates ocean wave heights. It runs on a supercomputer (the GPU). It doesn't create a picture, just a data map of the ocean.
    2.  `main.js` is the "meteorologist" who watches the model. They can poke the map to create a storm (a ripple) or see where a ship (the sphere) is.
    3.  The `Renderer` is the "broadcast studio." It takes the raw data map from the weather model, and using special graphics hardware, turns it into the beautiful, glossy 3D weather report you see on TV, complete with sky reflections and lighting.

-   **Metaphor**: The simulation is a **self-painting canvas**. A texture acts as the canvas, holding the water's current state. Each frame, a special "shader brush" sweeps over the entire canvas, reading the color at each point and painting a new, slightly changed color onto a second, clean canvas. Once done, the two canvases are swapped. The final renderer simply puts a frame around whichever canvas is currently "finished" for everyone to see.

---

### 8. If Rebuilt Today

-   **What would change using WebGPU**:
    -   **Compute Shaders**: The water simulation (`updateShader` in `water.js`) would be ported from a fragment shader to a WebGPU compute shader. This is a more direct and often more performant way to do general-purpose GPU (GPGPU) calculations, as it's not tied to the graphics rendering pipeline's concepts of vertices and fragments.
    -   **API Calls**: The `lightgl.js` abstraction would be replaced with a WebGPU-native equivalent. The setup would be more verbose (pipeline state objects, bind groups) but also more explicit and potentially more efficient by reducing driver guesswork.

-   **What would stay the same**:
    -   **The Core Algorithm**: The heightfield simulation logic and the use of ping-pong buffers (or storage buffers in WebGPU) would remain conceptually identical.
    -   **The Rendering Passes**: The breakdown of simulation -> normals -> caustics -> final scene render would still be the most logical approach.
    -   **Architectural Separation**: The clean separation between the simulation logic (`water.js`), rendering logic (`renderer.js`), and application control (`main.js`) is a timeless pattern that would be preserved.

-   **What could be modularized better**:
    -   **Dependency Management**: The original uses global script includes. A modern rebuild would use ES6 modules (`import`/`export`) for explicit dependency tracking, making the system easier to maintain and bundle.
    -   **Shader Management**: The GLSL shader strings embedded in JavaScript could be moved to separate `.wgsl` files and loaded at runtime, improving code organization and enabling better syntax highlighting and tooling.
