import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'; // For better terrain noise

// --- Global Variables ---
let scene, camera, renderer;
let vehicle;
let terrainMesh;
let roadMeshes = [];
let treeModel; // To hold the loaded tree model
const clock = new THREE.Clock(); // For delta time in animation

// --- Input Handling ---
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};
let vehicleSpeed = 0;
const maxSpeed = 0.5;
const acceleration = 0.02;
const deceleration = 0.01;
const steeringSpeed = 0.05;

// --- Terrain & Road Parameters ---
const terrainWidth = 400;
const terrainDepth = 800;
const resolution = 128; // Higher resolution for more detail
const heightScale = 30; // More pronounced hills
const noiseScale = 0.01; // How "zoomed in" the noise is

const roadWidth = 12; // Wider roads
const roadSegments = 100; // More segments for smoother roads
const roadTextureRepeat = 10; // How many times the texture repeats along the road

// --- Asset Paths ---
const ASSET_PATHS = {
    grassTexture: 'assets/grass.jpg',
    roadTexture: 'assets/road.jpg',
    treeModel: 'assets/tree.glb'
};

// --- Initialization Function ---
async function init() {
    try {
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // Sky blue background

        // Camera
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        // Position camera behind the vehicle initially, will be updated in animate
        camera.position.set(0, 50, 100);
        camera.lookAt(0, 0, 0);

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true; // Enable shadow maps
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 1); // Soft ambient light
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(50, 200, 100); // Position high up and slightly forward
        directionalLight.target.position.set(0, 0, 0);
        directionalLight.castShadow = true; // Enable shadows from this light
        scene.add(directionalLight);
        scene.add(directionalLight.target); // Needed for target to work

        // Configure shadow properties for better quality
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -200;
        directionalLight.shadow.camera.right = 200;
        directionalLight.shadow.camera.top = 200;
        directionalLight.shadow.camera.bottom = -200;
        // const helper = new THREE.DirectionalLightHelper(directionalLight, 5); // Uncomment to see light's frustum
        // scene.add(helper);

        // Load Assets (Textures and Models)
        const textureLoader = new THREE.TextureLoader();
        const gltfLoader = new GLTFLoader();

        const [grassTexture, roadTexture, loadedTreeModel] = await Promise.all([
            textureLoader.loadAsync(ASSET_PATHS.grassTexture),
            textureLoader.loadAsync(ASSET_PATHS.roadTexture),
            gltfLoader.loadAsync(ASSET_PATHS.treeModel)
        ]);

        grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(terrainWidth / 20, terrainDepth / 20); // Repeat texture over terrain

        roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping;
        roadTexture.repeat.set(1, roadTextureRepeat); // Repeat along Z-axis for road

        treeModel = loadedTreeModel.scene; // Get the scene from the GLTF model

        // --- Game Objects ---
        createTerrain(grassTexture);
        createVehicle();
        generateRoads(roadTexture);
        populateTrees(); // Add trees after terrain and roads

        // Event Listeners
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // Start Animation Loop
        animate();
        console.log("Game initialized successfully!");

    } catch (error) {
        console.error("Failed to initialize game:", error);
        document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: sans-serif;">Error loading game. Check console for details. Ensure you are running a local web server (e.g., `python -m http.server`).</div>';
    }
}

// --- Terrain Generation ---
const worldWidth = resolution;
const worldDepth = resolution;
const size = worldWidth * worldDepth;
const data = new Uint8Array(size);
const noise = new ImprovedNoise();
const texture = new THREE.CanvasTexture(generateTexture(data, worldWidth, worldDepth));

function createTerrain(grassTexture) {
    const geometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, worldWidth - 1, worldDepth - 1);
    geometry.rotateX(-Math.PI / 2); // Rotate to be flat on the XZ plane

    const vertices = geometry.attributes.position.array;
    for (let i = 0, j = 0; i < size; i++, j += 3) {
        // Using ImprovedNoise for smoother terrain
        const x = (i % worldWidth) * noiseScale;
        const z = Math.floor(i / worldWidth) * noiseScale;
        data[i] = (noise.noise(x, z, 0) * 0.5 + 0.5) * 128; // Noise returns -1 to 1, scale to 0-128
        vertices[j + 1] = data[i] * (heightScale / 128); // Apply height
    }

    geometry.computeVertexNormals(); // Crucial for correct lighting
    geometry.attributes.position.needsUpdate = true; // Tell Three.js vertices have changed

    const material = new THREE.MeshLambertMaterial({ map: grassTexture, side: THREE.DoubleSide });
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true; // Terrain receives shadows
    scene.add(terrainMesh);
}

// Helper to generate a simple texture for the noise data visualization (optional)
function generateTexture(data, width, height) {
    let canvas, canvasScaled, context, image, imageData, v0, v1, v2, v3, sum;
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    image = context.getImageData(0, 0, width, height);
    imageData = image.data;
    for (let i = 0, j = 0, l = data.length; i < l; i++, j += 4) {
        v0 = data[i + 0];
        v1 = data[i + 1];
        v2 = data[i + width];
        v3 = data[i + width + 1];
        sum = v0 + v1 + v2 + v3;
        imageData[j + 0] = sum / 4;
        imageData[j + 1] = sum / 4;
        imageData[j + 2] = sum / 4;
        imageData[j + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas;
}


// Function to get terrain height at a given (x, z) coordinate
// This is more robust now, finding the nearest vertex and interpolating
function getTerrainHeight(x, z) {
    if (!terrainMesh || !terrainMesh.geometry || !terrainMesh.geometry.attributes.position) {
        return 0; // Return 0 if terrain not ready
    }

    // Convert world coordinates to terrain's local coordinates
    // Terrain is centered at (0,0,0) and rotated
    const localX = x + terrainWidth / 2;
    const localZ = z + terrainDepth / 2;

    const gridX = Math.floor(localX / (terrainWidth / (worldWidth - 1)));
    const gridZ = Math.floor(localZ / (terrainDepth / (worldDepth - 1)));

    // Clamp to valid grid indices
    const clampedGridX = Math.max(0, Math.min(worldWidth - 2, gridX));
    const clampedGridZ = Math.max(0, Math.min(worldDepth - 2, gridZ));

    // Get the four corner heights of the grid cell
    const p00Index = clampedGridZ * worldWidth + clampedGridX;
    const p10Index = clampedGridZ * worldWidth + clampedGridX + 1;
    const p01Index = (clampedGridZ + 1) * worldWidth + clampedGridX;
    const p11Index = (clampedGridZ + 1) * worldWidth + clampedGridX + 1;

    const y00 = terrainMesh.geometry.attributes.position.getY(p00Index);
    const y10 = terrainMesh.geometry.attributes.position.getY(p10Index);
    const y01 = terrainMesh.geometry.attributes.position.getY(p01Index);
    const y11 = terrainMesh.geometry.attributes.position.getY(p11Index);

    // Perform bilinear interpolation for a smoother height
    const u = (localX % (terrainWidth / (worldWidth - 1))) / (terrainWidth / (worldWidth - 1));
    const v = (localZ % (terrainDepth / (worldDepth - 1))) / (terrainDepth / (worldDepth - 1));

    const interpolatedHeight =
        (1 - u) * (1 - v) * y00 +
        u * (1 - v) * y10 +
        (1 - u) * v * y01 +
        u * v * y11;

    // Terrain is placed at (0,0,0) with Y up. We need to add its Y offset if it's not at 0.
    // In our setup, terrainMesh.position.y is usually 0, so no need to add its Y.
    return interpolatedHeight;
}

// --- Road Generation ---
function generateRoads(roadTexture) {
    const roadMaterial = new THREE.MeshLambertMaterial({ map: roadTexture, side: THREE.FrontSide }); // Use FrontSide for flat plane roads

    const roadStartX = 0; // Start road at center X
    const roadStartZ = -terrainDepth / 2; // Start from the beginning of the terrain

    const pathPoints = [];
    const roadSegmentLength = terrainDepth / roadSegments;

    // Create a simple, mostly straight path with slight wiggles
    for (let i = 0; i <= roadSegments; i++) {
        const z = roadStartZ + i * roadSegmentLength;
        const x = Math.sin(z * 0.05) * 5; // Slight sine wave for a curvy road
        pathPoints.push(new THREE.Vector3(x, 0, z));
    }

    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const divisions = roadSegments * 2; // More divisions for smoother road segments

    const tubeGeometry = new THREE.TubeGeometry(curve, divisions, roadWidth / 2, 8, false); // Half width for radius, 8 segments for circular cross-section, no cap

    // Adjust the UVs for the road texture to repeat along its length
    const uvAttribute = tubeGeometry.attributes.uv;
    const positionAttribute = tubeGeometry.attributes.position;
    const roadLength = curve.getLength();

    for (let i = 0; i < uvAttribute.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
        const zValue = vertex.z; // Z is length along the path (roughly)
        const xValue = vertex.x; // X is cross-section width (roughly)

        // Map X to U (0 to 1 across road width)
        // Map Z to V (0 to N for texture repeat along length)
        uvAttribute.setX(i, (xValue / (roadWidth / 2) + 1) / 2); // Normalize X to 0-1 across the width
        uvAttribute.setY(i, zValue / roadLength * roadTextureRepeat); // Repeat along length
    }
    uvAttribute.needsUpdate = true;

    const roadMesh = new THREE.Mesh(tubeGeometry, roadMaterial);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = true; // Road can cast shadows
    roadMesh.position.y = 0.5; // Lift road slightly
    roadMeshes.push(roadMesh);
    scene.add(roadMesh);

    // Now, adjust the road's Y position to follow the terrain's height
    // This is a more complex task than simply setting its position.y.
    // You'd need to re-sample heights for each vertex of the road tube geometry.
    // For simplicity, we'll apply a general offset and trust the tube to deform
    // if the curve points are correctly set on terrain. A raycast for each point
    // on the curve would be ideal.
    for (let i = 0; i < pathPoints.length; i++) {
        const p = pathPoints[i];
        p.y = getTerrainHeight(p.x, p.z) + 0.1; // Lift slightly above terrain
    }
    // Re-create the tube geometry with updated path points
    const updatedCurve = new THREE.CatmullRomCurve3(pathPoints);
    const updatedTubeGeometry = new THREE.TubeGeometry(updatedCurve, divisions, roadWidth / 2, 8, false);
    updatedTubeGeometry.attributes.uv.copy(uvAttribute); // Copy original UVs as we only changed positions
    updatedTubeGeometry.attributes.uv.needsUpdate = true;

    roadMesh.geometry.dispose(); // Dispose old geometry
    roadMesh.geometry = updatedTubeGeometry; // Assign new geometry
    roadMesh.geometry.computeVertexNormals();
}


// --- Player Vehicle ---
function createVehicle() {
    const geometry = new THREE.BoxGeometry(3, 1.5, 6); // Simple box for a car, slightly larger
    const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    vehicle = new THREE.Mesh(geometry, material);
    vehicle.position.set(0, 5, 0); // Start vehicle slightly above ground
    vehicle.castShadow = true; // Vehicle casts shadows
    vehicle.receiveShadow = true; // Vehicle can receive shadows
    scene.add(vehicle);
}

// --- Tree Population ---
function populateTrees() {
    if (!treeModel) return;

    const numTrees = 500;
    const treeScale = 5; // Adjust scale of trees

    for (let i = 0; i < numTrees; i++) {
        const clone = treeModel.clone(); // Clone the loaded model for each tree

        // Random position within terrain bounds, but avoid road area
        let x, z;
        do {
            x = (Math.random() - 0.5) * terrainWidth * 0.9;
            z = (Math.random() - 0.5) * terrainDepth * 0.9;
        } while (Math.abs(x) < roadWidth * 1.5 && Math.abs(z) < terrainDepth * 0.5); // Avoid road area

        const y = getTerrainHeight(x, z);

        clone.position.set(x, y, z);
        clone.scale.set(treeScale, treeScale, treeScale); // Set uniform scale
        clone.rotation.y = Math.random() * Math.PI * 2; // Random rotation

        // Ensure all parts of the tree model cast/receive shadows
        clone.traverse(function(node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // Optional: Adjust material for better lighting (e.g., if GLTF has basic material)
                // if (node.material) {
                //     node.material = new THREE.MeshStandardMaterial().copy(node.material);
                // }
            }
        });

        scene.add(clone);
    }
}


// --- Input Handling ---
function onKeyDown(event) {
    if (keys.hasOwnProperty(event.key)) {
        keys[event.key] = true;
    }
}

function onKeyUp(event) {
    if (keys.hasOwnProperty(event.key)) {
        keys[event.key] = false;
    }
}

// --- Game Loop ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Time elapsed since last frame for consistent movement

    // Vehicle Movement
    if (keys.ArrowUp) {
        vehicleSpeed = Math.min(maxSpeed, vehicleSpeed + acceleration * delta);
    } else if (keys.ArrowDown) {
        vehicleSpeed = Math.max(-maxSpeed * 0.5, vehicleSpeed - acceleration * delta); // Allow reverse
    } else {
        // Decelerate if no key pressed
        if (vehicleSpeed > 0) vehicleSpeed = Math.max(0, vehicleSpeed - deceleration * delta);
        if (vehicleSpeed < 0) vehicleSpeed = Math.min(0, vehicleSpeed + deceleration * delta);
    }

    if (Math.abs(vehicleSpeed) > 0.01) { // Only allow steering if moving
        if (keys.ArrowLeft) {
            vehicle.rotation.y += steeringSpeed * delta * (vehicleSpeed > 0 ? 1 : -1); // Reverse steering in reverse
        }
        if (keys.ArrowRight) {
            vehicle.rotation.y -= steeringSpeed * delta * (vehicleSpeed > 0 ? 1 : -1); // Reverse steering in reverse
        }
    }

    // Apply movement based on vehicle's forward direction
    const forwardVector = new THREE.Vector3(0, 0, -1); // Z- is forward for Three.js objects
    forwardVector.applyQuaternion(vehicle.quaternion);
    vehicle.position.add(forwardVector.multiplyScalar(vehicleSpeed * delta * 60)); // Multiply by 60 for speed

    // Keep vehicle on the terrain
    const currentTerrainHeight = getTerrainHeight(vehicle.position.x, vehicle.position.z);
    vehicle.position.y = currentTerrainHeight + 1.5; // Offset for car height (adjust based on vehicle model)

    // Update camera to follow vehicle smoothly
    const relativeCameraOffset = new THREE.Vector3(0, 10, 25); // Offset behind and above
    const cameraOffset = relativeCameraOffset.applyMatrix4(vehicle.matrixWorld);
    camera.position.lerp(cameraOffset, 0.05); // Smooth camera movement
    camera.lookAt(vehicle.position.x, vehicle.position.y + 1, vehicle.position.z); // Look slightly above vehicle

    renderer.render(scene, camera);
}

// --- Window Resize Handling ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize the game when the window loads
window.onload = init;