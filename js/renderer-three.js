import { createProceduralDeepSpace, updateProceduralDeepSpace } from "./procedural-space.js";

let runtimePromise = null;

function loadRuntime() {
    if (!runtimePromise) {
        runtimePromise = Promise.all([
            import("https://esm.sh/three@0.174.0"),
            import("https://esm.sh/three@0.174.0/examples/jsm/controls/OrbitControls.js")
        ]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
    }
    return runtimePromise;
}

export class UniverseRenderer {
    constructor(host, handlers) {
        this.host = host;
        this.handlers = handlers;
        this.state = null;
        this.runtime = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = null;
        this.planets = new Map();
        this.fleets = [];
        this.hoverPlanetId = null;
        this.selectedPlanetId = null;
        this.centerViewLocked = false;
        this.focus = null;
        this.starfield = null;
        this.centralLightAnchor = null;
        this.hyperlanes = null;
        this.planetLayer = null;
        this.fleetLayer = null;
        this.effectLayer = null;
        this.lastFleetSignature = "";
        this.pointer = { x: 0, y: 0, down: false, moved: false, startX: 0, startY: 0 };
        this.time = 0;
        this.initPromise = loadRuntime().then((runtime) => {
            this.runtime = runtime;
            this.setup();
            this.bind();
            this.resize();
            if (this.state) {
                this.rebuildStatic();
                this.rebuildFleets();
                if (this.centerViewLocked) this.focusCenter();
                else this.updateFocus(true);
            }
        });
    }

    setup() {
        const { THREE, OrbitControls } = this.runtime;
        const width = this.host.clientWidth || 1280;
        const height = this.host.clientHeight || 760;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x02050b);
        this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 1400);
        this.camera.position.set(46, 24, 52);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.host.innerHTML = "";
        this.host.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.autoRotate = false;
        this.controls.minDistance = 12;
        this.controls.maxDistance = 260;
        this.controls.rotateSpeed = 0.72;
        this.controls.zoomSpeed = 0.72;
        this.focus = new THREE.Vector3();
        this.controls.target.copy(this.focus);

        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 1.2;

        this.scene.add(
            new THREE.AmbientLight(0xc6d7ff, 0.48),
            new THREE.HemisphereLight(0xbfd7ff, 0x05070d, 0.24),
            createDirectional(THREE, 0xf6f8ff, 1.14, 28, 36, 20),
            createDirectional(THREE, 0x4f7dff, 0.42, -26, -14, -24)
        );

        this.starfield = createProceduralDeepSpace(THREE);
        this.centralLightAnchor = createCentralLightAnchor(THREE);
        this.hyperlanes = new THREE.Group();
        this.planetLayer = new THREE.Group();
        this.fleetLayer = new THREE.Group();
        this.effectLayer = new THREE.Group();
        this.scene.add(this.starfield, this.centralLightAnchor, this.hyperlanes, this.planetLayer, this.fleetLayer, this.effectLayer);
    }

    bind() {
        window.addEventListener("resize", () => this.resize());
        const canvas = this.renderer.domElement;
        canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
        canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
        canvas.addEventListener("pointerup", () => this.onPointerUp());
        canvas.addEventListener("pointerleave", () => this.onPointerUp());
    }

    setState(state) {
        if (this.state?.selectedPlanetId !== state.selectedPlanetId) {
            this.centerViewLocked = false;
        }
        this.state = state;
        if (!this.runtime) return;
        this.rebuildStatic();
        this.rebuildFleets();
        this.updateFocus(true);
    }

    resize() {
        if (!this.renderer) return;
        const width = this.host.clientWidth || 1280;
        const height = this.host.clientHeight || 760;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    tick(delta) {
        if (!this.runtime || !this.state) return;
        this.controls.target.lerp(this.focus, Math.min(1, delta * 4));
        this.controls.update();
    }

    render(time) {
        if (!this.runtime || !this.state) return;
        this.time = time;
        this.updateFocus(false);
        this.updatePlanets(time);
        if (createFleetSignature(this.state.planets) !== this.lastFleetSignature) {
            this.rebuildFleets();
        }
        this.updateFleets(time);
        this.updatePick();
        this.updateSelectionVisuals();
        updateProceduralDeepSpace(this.starfield, this.camera, time, this.pointer);
        updateCentralLightAnchor(this.centralLightAnchor, time);
        this.renderer.render(this.scene, this.camera);
    }

    rebuildStatic() {
        clearGroup(this.hyperlanes);
        clearGroup(this.planetLayer);
        this.planets.clear();

        this.state.planets.forEach((planet) => {
            const entry = createPlanetEntry(this.runtime.THREE, planet);
            this.planetLayer.add(entry.root);
            this.planets.set(planet.id, entry);
        });

        this.state.hyperlanes.forEach(([fromId, toId]) => {
            const from = this.planets.get(fromId);
            const to = this.planets.get(toId);
            if (!from || !to) return;
            const line = new this.runtime.THREE.Line(
                new this.runtime.THREE.BufferGeometry().setFromPoints([from.root.position.clone(), to.root.position.clone()]),
                new this.runtime.THREE.LineBasicMaterial({ color: 0x7dc8ff, transparent: true, opacity: 0.26 })
            );
            this.hyperlanes.add(line);
        });
    }

    rebuildFleets() {
        clearGroup(this.fleetLayer);
        clearGroup(this.effectLayer);
        this.fleets = [];
        this.lastFleetSignature = createFleetSignature(this.state.planets);
    }

    updatePlanets(time) {
        this.planets.forEach((entry) => {
            entry.body.rotation.y = entry.tilt.y + time * entry.rotationSpeed;
            entry.body.rotation.x = entry.tilt.x + Math.sin(time * 0.18 + entry.seed * 0.001) * 0.06;
            entry.moons.forEach((moon) => {
                moon.pivot.rotation.y = moon.phase + time * moon.speed;
            });
        });
    }

    updateFleets(time) {
        this.fleets.forEach((entry) => {
            const mission = resolveMission(this.runtime.THREE, entry.spec, this.planets, time);
            entry.group.visible = Boolean(mission && !mission.hidden);
            if (!mission || mission.hidden) return;

            entry.group.position.copy(mission.center);
            entry.group.quaternion.copy(quaternionFromDirection(this.runtime.THREE, mission.direction));

            if (entry.line && mission.target) {
                entry.line.geometry.setFromPoints([new this.runtime.THREE.Vector3(), entry.group.worldToLocal(mission.target.clone())]);
            }

            if (entry.effect) {
                updateEffect(this.runtime.THREE, entry.effect, mission, time);
            }
        });
    }

    updateFocus(force) {
        if (!this.state) return;
        if (this.centerViewLocked) {
            this.focus.set(0, 0, 0);
            if (force && this.controls) this.controls.target.copy(this.focus);
            return;
        }
        if (!force && this.selectedPlanetId === this.state.selectedPlanetId) return;
        this.selectedPlanetId = this.state.selectedPlanetId;
        const selected = this.planets.get(this.selectedPlanetId);
        if (selected) this.focus.copy(selected.root.position);
    }

    focusCenter() {
        this.centerViewLocked = true;
        if (this.focus) this.focus.set(0, 0, 0);
        if (!this.runtime || !this.camera || !this.controls) return;
        const { THREE } = this.runtime;
        this.controls.target.copy(this.focus);
        const direction = new THREE.Vector3(1, 0.58, 1.16).normalize();
        const distance = Math.max(this.camera.position.distanceTo(this.controls.target), 88);
        this.camera.position.copy(direction.multiplyScalar(distance));
        this.controls.update();
    }

    updatePick() {
        this.raycaster.setFromCamera({ x: this.pointer.x, y: this.pointer.y }, this.camera);
        const hits = this.raycaster.intersectObjects([...this.planets.values()].map((entry) => entry.body));
        const next = hits.length ? hits[0].object.userData.planetId : null;
        if (next !== this.hoverPlanetId) {
            this.hoverPlanetId = next;
            this.handlers.setHoverPlanetId(next);
            this.renderer.domElement.style.cursor = next ? "pointer" : this.pointer.down ? "grabbing" : "grab";
        }
    }

    updateSelectionVisuals() {
        this.planets.forEach((entry) => {
            const selected = entry.planet.id === this.state.selectedPlanetId;
            const hovered = entry.planet.id === this.hoverPlanetId;
            entry.highlight.visible = selected || hovered;
            entry.highlight.material.uniforms.uOpacity.value = selected ? 0.58 : hovered ? 0.28 : 0;
            entry.body.scale.setScalar(hovered ? 1.02 : 1);
        });
    }

    onPointerDown(event) {
        this.pointer.down = true;
        this.pointer.moved = false;
        this.pointer.startX = event.clientX;
        this.pointer.startY = event.clientY;
        this.renderer.domElement.style.cursor = "grabbing";
    }

    onPointerMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        if (this.pointer.down && (Math.abs(event.clientX - this.pointer.startX) > 4 || Math.abs(event.clientY - this.pointer.startY) > 4)) {
            this.pointer.moved = true;
        }
    }

    onPointerUp() {
        const click = this.pointer.down && !this.pointer.moved && this.hoverPlanetId;
        this.pointer.down = false;
        this.pointer.moved = false;
        this.renderer.domElement.style.cursor = this.hoverPlanetId ? "pointer" : "grab";
        if (click) this.handlers.selectPlanet(this.hoverPlanetId);
    }
}

function createPlanetEntry(THREE, planet) {
    const seed = hashString(planet.id);
    const root = new THREE.Group();
    root.position.fromArray(planet.position);
    const maps = createPlanetMaps(THREE, planet, seed);
    const materialProps = getPlanetMaterialProps(planet.kind);
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius, 36, 28),
        new THREE.MeshPhysicalMaterial({
            color: planet.color,
            map: maps.surface,
            roughnessMap: maps.roughness,
            bumpMap: maps.bump,
            bumpScale: materialProps.bumpScale,
            emissive: lightenHex(planet.color, 10),
            emissiveIntensity: materialProps.emissiveIntensity,
            roughness: materialProps.roughness,
            metalness: materialProps.metalness,
            clearcoat: materialProps.clearcoat,
            clearcoatRoughness: materialProps.clearcoatRoughness,
            sheen: materialProps.sheen,
            sheenRoughness: materialProps.sheenRoughness,
            sheenColor: new THREE.Color(lightenHex(planet.accent, 10))
        })
    );
    body.userData.planetId = planet.id;
    root.add(body);

    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius * 1.06, 24, 18),
        new THREE.MeshBasicMaterial({ color: planet.accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    root.add(atmosphere);

    const highlight = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius * 1.085, 32, 24),
        createPlanetHighlightMaterial(THREE, lightenHex(planet.accent, 34))
    );
    highlight.visible = false;
    root.add(highlight);

    if (planet.ring) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(planet.radius * 1.34, planet.radius * 1.88, 72),
            new THREE.MeshBasicMaterial({ color: planet.accent, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false })
        );
        const euler = ringEuler(seed);
        ring.rotation.set(euler.x, euler.y, euler.z);
        root.add(ring);
    }

    if (maps.clouds) {
        const clouds = new THREE.Mesh(
            new THREE.SphereGeometry(planet.radius * 1.018, 24, 18),
            new THREE.MeshPhysicalMaterial({
                map: maps.clouds,
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                roughness: 0.82,
                metalness: 0,
                clearcoat: 0.08,
                clearcoatRoughness: 0.64
            })
        );
        root.add(clouds);
    }

    const moons = Array.from({ length: planet.moons }, (_, index) => {
        const pivot = new THREE.Group();
        const moon = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.12, planet.radius * (0.16 - index * 0.02)), 16, 12),
            new THREE.MeshStandardMaterial({
                color: lightenHex(planet.color, 18),
                emissive: lightenHex(planet.accent, 6),
                emissiveIntensity: 0.14,
                roughness: 0.92
            })
        );
        moon.position.set(planet.radius * (2.45 + index * 0.58), 0, 0);
        pivot.rotation.set(((seed + index * 31) % 41) * 0.02, ((seed + index * 17) % 67) * 0.02, ((seed + index * 23) % 53) * 0.02);
        pivot.add(moon);
        root.add(pivot);
        return { pivot, phase: (seed % 360) * (Math.PI / 180) + index * 1.1, speed: 0.18 + index * 0.035 + (seed % 11) * 0.004 };
    });

    return {
        planet,
        seed,
        root,
        body,
        highlight,
        moons,
        tilt: { x: ((seed % 37) - 18) * 0.01, y: ((seed % 83) - 41) * 0.013, z: ((seed % 29) - 14) * 0.008 },
        rotationSpeed: 0.08 + (seed % 17) * 0.0025
    };
}

function buildFleetSpecs(state) {
    const planets = new Map(state.planets.map((planet) => [planet.id, planet]));
    return state.planets.flatMap((planet, index) => {
        const action = planet.currentAction ?? {};
        if (!action.key) return [];
        if (!action.targetId && !["fortify", "research", "festival", "reform"].includes(action.key)) return [];
        return [{
            sourceId: planet.id,
            targetId: action.targetId ?? null,
            actionKey: action.key,
            category: action.category ?? "internal",
            shape: planet.fleetShape ?? "rect",
            color: planet.accent,
            spacing: clamp(planet.radius * 1.02, 0.86, 1.42),
            offsets: createOffsets(hashString(`${planet.id}:${action.key}:${index}`), shipCount(action)),
            targetPlanet: action.targetId ? planets.get(action.targetId) : null
        }];
    });
}

function createFleetEntry(THREE, spec) {
    const group = new THREE.Group();
    const color = new THREE.Color(spec.color);
    spec.offsets.forEach((offset) => {
        const ship = createShipModel(THREE, spec, color);
        ship.position.set(offset.x * spec.spacing, offset.y * spec.spacing, offset.z * spec.spacing);
        ship.rotation.z = offset.roll;
        ship.rotation.x = offset.pitch;
        ship.scale.setScalar(offset.scale);
        group.add(ship);
    });

    const line = spec.targetId ? new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0.001, 0, 0)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: spec.category === "war" ? 0.16 : 0.08 })) : null;
    if (line) group.add(line);

    return { spec, group, line, effect: createEffect(THREE, spec) };
}

function resolveMission(THREE, spec, entries, time) {
    const source = entries.get(spec.sourceId);
    if (!source) return null;
    const target = spec.targetId ? entries.get(spec.targetId) : null;
    const phase = fract(time * (spec.category === "war" ? 0.1 : spec.category === "trade" ? 0.06 : 0.075) + hashString(`${spec.sourceId}:${spec.targetId ?? "self"}`) * 0.0008);

    if (!target) {
        const r = source.planet.radius * 3;
        const angle = time * 0.22 + hashString(spec.sourceId) * 0.001;
        const center = source.root.position.clone().add(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle * 1.3) * r * 0.2, Math.sin(angle) * r * 0.7));
        return { center, direction: center.clone().sub(source.root.position).normalize(), hidden: false, target: null, anchor: null };
    }

    const sourcePos = source.root.position.clone();
    const targetPos = target.root.position.clone();
    const direction = targetPos.clone().sub(sourcePos).normalize();
    const anchor = targetPos.clone().add(direction.clone().multiplyScalar(-(target.planet.radius * 3.8 + 1.6))).add(perpendicularOffset(THREE, direction, hashString(`${spec.sourceId}:${spec.targetId}`), target.planet.radius * 1.4));

    if (spec.actionKey === "invasion") return { center: anchor, direction, hidden: false, target: targetPos, anchor };
    if (spec.actionKey === "mobilize") return { center: sourcePos.clone().lerp(anchor, 0.26 + phase * 0.24), direction, hidden: false, target: targetPos, anchor };
    if (spec.category === "trade") {
        const stage = tradeStage(phase);
        const outboundDirection = targetPos.clone().sub(sourcePos).normalize();
        const entryPoint = targetPos.clone().add(outboundDirection.clone().multiplyScalar(-target.planet.radius * 1.22));
        const innerEntryPoint = targetPos.clone().add(outboundDirection.clone().multiplyScalar(-target.planet.radius * 0.34));
        const innerExitPoint = targetPos.clone().add(outboundDirection.clone().multiplyScalar(target.planet.radius * 0.34));
        const emergePoint = targetPos.clone().add(outboundDirection.clone().multiplyScalar(target.planet.radius * 1.28));
        const departurePoint = targetPos.clone().add(outboundDirection.clone().multiplyScalar(target.planet.radius * 4.6));
        const returnOffset = perpendicularOffset(THREE, outboundDirection, hashString(`${spec.sourceId}:${spec.targetId}:trade-curve`), target.planet.radius * 5.8 + source.planet.radius * 1.8);
        const returnControl = targetPos.clone().add(outboundDirection.clone().multiplyScalar(target.planet.radius * 2.1)).add(returnOffset);

        if (stage.segment === "approach") {
            return {
                center: sourcePos.clone().lerp(entryPoint, stage.progress),
                direction: entryPoint.clone().sub(sourcePos).normalize(),
                hidden: false,
                target: targetPos,
                anchor
            };
        }

        if (stage.segment === "dock") {
            return {
                center: entryPoint.clone().lerp(innerEntryPoint, stage.progress),
                direction: innerEntryPoint.clone().sub(entryPoint).normalize(),
                hidden: false,
                target: targetPos,
                anchor
            };
        }

        if (stage.segment === "transit") {
            return {
                center: innerEntryPoint.clone().lerp(innerExitPoint, stage.progress),
                direction: outboundDirection,
                hidden: true,
                target: sourcePos,
                anchor
            };
        }

        if (stage.segment === "emerge") {
            return {
                center: emergePoint.clone().lerp(departurePoint, stage.progress),
                direction: departurePoint.clone().sub(emergePoint).normalize(),
                hidden: false,
                target: sourcePos,
                anchor
            };
        }

        if (stage.segment === "turn") {
            return {
                center: departurePoint.clone(),
                direction: quadraticBezierTangent(THREE, departurePoint, returnControl, sourcePos, 0.04),
                hidden: false,
                target: sourcePos,
                anchor
            };
        }

        return {
            center: quadraticBezierPoint(THREE, departurePoint, returnControl, sourcePos, stage.progress),
            direction: quadraticBezierTangent(THREE, departurePoint, returnControl, sourcePos, stage.progress),
            hidden: false,
            target: sourcePos,
            anchor
        };
    }
    const progress = ["diplomacy", "covert"].includes(spec.category) ? pingPong(phase) : phase;
    return { center: sourcePos.clone().lerp(targetPos, 0.12 + progress * 0.76), direction, hidden: false, target: targetPos, anchor };
}

function createEffect(THREE, spec) {
    if (spec.actionKey === "invasion") {
        const group = new THREE.Group();
        const bursts = Array.from({ length: 4 }, (_, index) => {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffbf8d, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false }));
            group.add(mesh);
            return { mesh, phase: index * 0.21 };
        });
        const waves = Array.from({ length: 2 }, (_, index) => {
            const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffd7b1, transparent: true, opacity: 0.24, depthWrite: false }));
            mesh.rotation.x = Math.PI / 2;
            group.add(mesh);
            return { mesh, phase: index * 0.31 };
        });
        return { type: "battle", group, bursts, waves, seed: hashString(`${spec.sourceId}:${spec.targetId}:battle`) };
    }

    if (spec.actionKey === "mobilize" || ["pressure", "covert"].includes(spec.category)) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0x8ac7ff, transparent: true, opacity: 0.18, depthWrite: false }));
        ring.rotation.x = Math.PI / 2;
        const group = new THREE.Group();
        group.add(ring);
        return { type: "pressure", group, ring, seed: hashString(`${spec.sourceId}:${spec.targetId}:pressure`) };
    }

    return null;
}

function updateEffect(THREE, effect, mission, time) {
    if (!effect) return;
    if (effect.type === "battle") {
        effect.group.position.copy(mission.anchor || mission.target);
        effect.bursts.forEach((entry, index) => {
            const pulse = fract(time * 0.58 + effect.seed * 0.0007 + entry.phase);
            entry.mesh.position.set(Math.sin(effect.seed * 0.01 + index * 1.3) * 0.8, Math.cos(effect.seed * 0.016 + index * 1.1) * 0.42, Math.cos(effect.seed * 0.012 + index * 1.7) * 0.78);
            entry.mesh.scale.setScalar(0.8 + pulse * 2.1);
            entry.mesh.material.opacity = (1 - pulse) * 0.32;
        });
        effect.waves.forEach((entry) => {
            const pulse = fract(time * 0.38 + effect.seed * 0.0004 + entry.phase);
            entry.mesh.scale.setScalar(1 + pulse * 1.9);
            entry.mesh.material.opacity = (1 - pulse) * 0.14;
        });
    }
    if (effect.type === "pressure") {
        effect.group.position.copy(mission.target);
        effect.ring.scale.setScalar(1 + Math.sin(time * 2 + effect.seed * 0.001) * 0.16);
    }
}

function createStarfield(THREE) {
    const group = new THREE.Group();
    const backgroundLayer = new THREE.Group();
    const backgroundStars = createStarLayer(THREE, {
        count: 9800,
        radiusMin: 240,
        radiusMax: 420,
        size: 0.5,
        opacity: 0.92,
        bias: 1.08,
        yScale: 1
    });
    const milkyWayBand = createMilkyWayBand(THREE);
    const distantGalaxies = createDistantGalaxies(THREE);
    const nebulaClouds = createNebulaClouds(THREE);
    backgroundLayer.add(backgroundStars, milkyWayBand, distantGalaxies, nebulaClouds);

    const centralHalo = createStarLayer(THREE, {
        count: 4200,
        radiusMin: 18,
        radiusMax: 150,
        size: 0.34,
        opacity: 0.78,
        bias: 0.52,
        yScale: 0.92
    });
    const centralDisk = createStarLayer(THREE, {
        count: 3000,
        radiusMin: 12,
        radiusMax: 120,
        size: 0.28,
        opacity: 0.72,
        bias: 0.44,
        yScale: 0.26
    });
    const brightShell = createStarLayer(THREE, {
        count: 360,
        radiusMin: 22,
        radiusMax: 180,
        size: 1.1,
        opacity: 0.98,
        bias: 0.7,
        yScale: 0.88
    });
    group.add(backgroundLayer, centralHalo, centralDisk, brightShell);
    group.userData = { backgroundLayer };
    return group;
}

function createMilkyWayBand(THREE) {
    const count = 5200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const radius = 240 + Math.random() * 170;
        const vertical = (Math.random() * 2 - 1) * (8 + Math.random() * 22);
        positions[i * 3] = Math.cos(theta) * radius;
        positions[i * 3 + 1] = vertical;
        positions[i * 3 + 2] = Math.sin(theta) * radius;

        const warm = 0.92 + Math.random() * 0.08;
        colors[i * 3] = warm;
        colors[i * 3 + 1] = warm * 0.98;
        colors[i * 3 + 2] = warm * 1.02;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size: 0.4,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.24,
            vertexColors: true,
            depthWrite: false,
            map: getStarSpriteTexture(THREE),
            alphaMap: getStarSpriteTexture(THREE),
            alphaTest: 0.08
        })
    );
    points.rotation.set(-0.42, 0.64, 0.18);
    return points;
}

function createDistantGalaxies(THREE) {
    const group = new THREE.Group();
    const configs = [
        { position: [164, 96, -218], scale: 78, color: 0xa8caff, rotation: 0.4, opacity: 0.24, seed: 11 },
        { position: [-206, -84, 176], scale: 62, color: 0xffd9b6, rotation: -0.26, opacity: 0.2, seed: 23 },
        { position: [118, -126, 246], scale: 52, color: 0xd9d0ff, rotation: 0.74, opacity: 0.18, seed: 37 },
        { position: [-132, 144, 224], scale: 42, color: 0xbce6ff, rotation: 0.18, opacity: 0.16, seed: 41 }
    ];
    configs.forEach((config) => {
        const galaxy = createGalaxyCluster(THREE, config);
        galaxy.position.fromArray(config.position);
        galaxy.rotation.z = config.rotation;
        galaxy.rotation.x = 0.2;
        group.add(galaxy);
    });
    return group;
}

function createNebulaClouds(THREE) {
    const group = new THREE.Group();
    const configs = [
        { position: [-154, 82, -232], scale: 112, color: 0x6ea9ff, opacity: 0.18, rotation: 0.2, seed: 3, variant: 0 },
        { position: [214, -62, 132], scale: 98, color: 0x68d0b2, opacity: 0.16, rotation: -0.34, seed: 7, variant: 1 },
        { position: [72, 138, 208], scale: 84, color: 0xc4a2ff, opacity: 0.14, rotation: 0.56, seed: 13, variant: 2 },
        { position: [-232, -118, 102], scale: 92, color: 0xff9b88, opacity: 0.16, rotation: -0.62, seed: 19, variant: 3 },
        { position: [146, 168, -164], scale: 76, color: 0xffd38f, opacity: 0.13, rotation: 0.34, seed: 29, variant: 4 }
    ];
    configs.forEach((config) => {
        const nebula = createNebulaCluster(THREE, config);
        nebula.position.fromArray(config.position);
        nebula.rotation.z = config.rotation;
        nebula.rotation.x = -0.24;
        group.add(nebula);
    });
    return group;
}

function createGalaxyCluster(THREE, config) {
    const group = new THREE.Group();
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(config.color);
    for (let i = 0; i < count; i += 1) {
        const arm = i % 2;
        const t = Math.pow(Math.random(), 0.7);
        const angle = arm * Math.PI + t * 4 + Math.sin((config.seed + i) * 0.19) * 0.08;
        const radius = t * config.scale * 0.56;
        positions[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * config.scale * 0.05;
        positions[i * 3 + 1] = (Math.random() - 0.5) * config.scale * 0.08;
        positions[i * 3 + 2] = Math.sin(angle) * radius * 0.42 + (Math.random() - 0.5) * config.scale * 0.03;

        const c = base.clone().lerp(new THREE.Color(0xffffff), 0.35 + Math.random() * 0.45);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const arms = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 0.52,
        sizeAttenuation: true,
        transparent: true,
        opacity: config.opacity,
        vertexColors: true,
        depthWrite: false,
        map: getStarSpriteTexture(THREE),
        alphaMap: getStarSpriteTexture(THREE),
        alphaTest: 0.08
    }));

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSunGlowTexture(THREE, { inner: "rgba(255,255,255,0.95)", mid: "rgba(255,235,198,0.4)", outer: "rgba(255,235,198,0)" }),
        color: config.color,
        transparent: true,
        opacity: config.opacity * 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    core.scale.set(config.scale * 0.22, config.scale * 0.22, 1);

    group.add(arms, core);
    return group;
}

function createNebulaCluster(THREE, config) {
    const group = new THREE.Group();
    const palette = getNebulaPalette(config.variant);
    palette.forEach((tone, layerIndex) => {
        const count = 320;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const color = new THREE.Color(tone.replace("rgba(", "rgb(").replace(/,[^)]+\)$/, ")"));
        for (let i = 0; i < count; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.pow(Math.random(), 0.56) * config.scale * (0.28 + layerIndex * 0.16);
            positions[i * 3] = Math.cos(angle) * radius * (1.1 + Math.sin((config.seed + i) * 0.07) * 0.2);
            positions[i * 3 + 1] = (Math.random() - 0.5) * config.scale * 0.16;
            positions[i * 3 + 2] = Math.sin(angle) * radius * (0.72 + layerIndex * 0.12);

            const c = color.clone().lerp(new THREE.Color(0xffffff), 0.1 + Math.random() * 0.18);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({
            size: 1.4 + layerIndex * 0.5,
            sizeAttenuation: true,
            transparent: true,
            opacity: config.opacity * (0.3 - layerIndex * 0.05),
            vertexColors: true,
            depthWrite: false,
            map: getStarSpriteTexture(THREE),
            alphaMap: getStarSpriteTexture(THREE),
            alphaTest: 0.02
        }));
        group.add(cloud);
    });
    return group;
}

function createStarLayer(THREE, options) {
    const { count, radiusMin, radiusMax, size, opacity, bias, yScale } = options;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const pool = [0xf4f7ff, 0xffffff, 0xfafcff, 0xf7f4ee, 0xeef5ff];
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        const radius = radiusMin + Math.pow(Math.random(), bias) * (radiusMax - radiusMin);
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(phi) * yScale;
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        const tint = new THREE.Color(pick(pool));
        const lift = 0.92 + Math.random() * 0.08;
        colors[i * 3] = tint.r * lift;
        colors[i * 3 + 1] = tint.g * lift;
        colors[i * 3 + 2] = tint.b * lift;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size,
            sizeAttenuation: true,
            transparent: true,
            opacity,
            vertexColors: true,
            depthWrite: false,
            map: getStarSpriteTexture(THREE),
            alphaMap: getStarSpriteTexture(THREE),
            alphaTest: 0.08
        })
    );
}

function getStarSpriteTexture(THREE) {
    if (getStarSpriteTexture.cache) return getStarSpriteTexture.cache;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getStarSpriteTexture.cache = texture;
    return texture;
}

function getSunGlowTexture(THREE, colors) {
    const key = JSON.stringify(colors);
    if (!getSunGlowTexture.cache) getSunGlowTexture.cache = new Map();
    if (getSunGlowTexture.cache.has(key)) return getSunGlowTexture.cache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, colors.inner);
    gradient.addColorStop(0.42, colors.mid);
    gradient.addColorStop(1, colors.outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getSunGlowTexture.cache.set(key, texture);
    return texture;
}

function getGalaxyTexture(THREE, variant) {
    if (!getGalaxyTexture.cache) getGalaxyTexture.cache = new Map();
    if (getGalaxyTexture.cache.has(variant)) return getGalaxyTexture.cache.get(variant);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.translate(128, 128);
    ctx.rotate(variant * 0.32);

    const dust = ctx.createRadialGradient(0, 0, 0, 0, 0, 118);
    dust.addColorStop(0, "rgba(255,255,255,0.08)");
    dust.addColorStop(0.56, "rgba(255,255,255,0.03)");
    dust.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = dust;
    ctx.beginPath();
    ctx.ellipse(0, 0, 122, 74, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let arm = 0; arm < 2; arm += 1) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i += 1) {
            const t = i / 80;
            const angle = arm * Math.PI + t * 3.8;
            const radius = 8 + t * 90;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius * 0.52;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.11)";
        ctx.lineWidth = 18;
        ctx.stroke();
    }

    for (let cluster = 0; cluster < 220; cluster += 1) {
        const arm = cluster % 2;
        const t = Math.pow(Math.random(), 0.72);
        const angle = arm * Math.PI + t * 3.8 + (Math.random() - 0.5) * 0.28;
        const radius = 10 + t * 92;
        const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 8;
        const y = Math.sin(angle) * radius * 0.52 + (Math.random() - 0.5) * 5;
        const r = 0.8 + Math.random() * 1.8;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
        glow.addColorStop(0, "rgba(255,255,255,0.95)");
        glow.addColorStop(0.42, "rgba(255,248,230,0.54)");
        glow.addColorStop(1, "rgba(255,248,230,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.6, 0, Math.PI * 2);
        ctx.fill();
    }

    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 44);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.2, "rgba(255,248,234,0.92)");
    core.addColorStop(0.42, "rgba(255,233,182,0.54)");
    core.addColorStop(1, "rgba(255,244,219,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.fill();

    for (let spark = 0; spark < 36; spark += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 22;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.72;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 8 + Math.random() * 10);
        glow.addColorStop(0, "rgba(255,255,255,0.85)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 8 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getGalaxyTexture.cache.set(variant, texture);
    return texture;
}

function getNebulaTexture(THREE, variant) {
    if (!getNebulaTexture.cache) getNebulaTexture.cache = new Map();
    if (getNebulaTexture.cache.has(variant)) return getNebulaTexture.cache.get(variant);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const palette = getNebulaPalette(variant);
    const wash = ctx.createLinearGradient(0, 0, 256, 256);
    wash.addColorStop(0, palette[0]);
    wash.addColorStop(0.5, palette[1]);
    wash.addColorStop(1, palette[2]);
    ctx.fillStyle = wash;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalAlpha = 1;

    for (let i = 0; i < 12; i += 1) {
        const x = 48 + ((i * 37 + variant * 19) % 160);
        const y = 42 + ((i * 29 + variant * 31) % 172);
        const radius = 26 + (i % 5) * 18;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, palette[(i + 1) % palette.length].replace("1)", "0.34)"));
        gradient.addColorStop(0.42, palette[(i + 2) % palette.length].replace("1)", "0.16)"));
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let spark = 0; spark < 36; spark += 1) {
        const x = 28 + ((spark * 41 + variant * 17) % 200);
        const y = 22 + ((spark * 23 + variant * 29) % 212);
        const radius = 2 + (spark % 4);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
        glow.addColorStop(0, "rgba(255,255,255,0.72)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getNebulaTexture.cache.set(variant, texture);
    return texture;
}

function getNebulaPalette(variant) {
    const palettes = [
        ["rgba(80,150,255,1)", "rgba(103,211,255,1)", "rgba(175,136,255,1)"],
        ["rgba(92,224,190,1)", "rgba(78,161,255,1)", "rgba(186,247,224,1)"],
        ["rgba(182,114,255,1)", "rgba(255,145,223,1)", "rgba(123,162,255,1)"],
        ["rgba(255,132,110,1)", "rgba(255,184,116,1)", "rgba(255,226,164,1)"],
        ["rgba(255,189,92,1)", "rgba(255,129,160,1)", "rgba(255,240,193,1)"]
    ];
    return palettes[variant % palettes.length];
}

function createDirectional(THREE, color, intensity, x, y, z) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    return light;
}

function createCentralLightAnchor(THREE) {
    const anchor = new THREE.Group();

    const core = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 24, 18),
        new THREE.MeshBasicMaterial({
            color: 0xfff1cc,
            transparent: true,
            opacity: 0.95
        })
    );

    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSunGlowTexture(THREE, { inner: "rgba(255,242,204,0.96)", mid: "rgba(255,202,126,0.46)", outer: "rgba(255,167,89,0)" }),
        color: 0xffd599,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    corona.scale.set(16, 16, 1);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSunGlowTexture(THREE, { inner: "rgba(255,245,227,0.42)", mid: "rgba(255,214,156,0.12)", outer: "rgba(255,214,156,0)" }),
        color: 0xfff3de,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    halo.scale.set(28, 28, 1);

    const warmHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSunGlowTexture(THREE, { inner: "rgba(255,223,170,0.18)", mid: "rgba(255,170,92,0.08)", outer: "rgba(255,170,92,0)" }),
        color: 0xffc37c,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    warmHalo.scale.set(42, 42, 1);

    const pointLight = new THREE.PointLight(0xffe2ad, 3.4, 220, 1.4);
    const warmFill = new THREE.PointLight(0xffb36b, 1.2, 140, 1.8);
    warmFill.position.set(0, 0, 0);

    anchor.add(core, corona, halo, warmHalo, pointLight, warmFill);
    anchor.position.set(0, 0, 0);
    anchor.userData = { core, corona, halo, warmHalo, pointLight, warmFill };
    return anchor;
}

function updateCentralLightAnchor(anchor, time) {
    if (!anchor?.userData) return;
    const { core, corona, halo, warmHalo, pointLight, warmFill } = anchor.userData;
    const pulse = 1 + Math.sin(time * 0.42) * 0.05;
    const shimmer = 1 + Math.cos(time * 0.68) * 0.08;

    core.scale.setScalar(pulse);
    corona.scale.set(16 * shimmer, 16 * shimmer, 1);
    halo.scale.set(28 * (1 + Math.sin(time * 0.24) * 0.04), 28 * (1 + Math.sin(time * 0.24) * 0.04), 1);
    warmHalo.scale.set(42 * (1 + Math.cos(time * 0.18) * 0.03), 42 * (1 + Math.cos(time * 0.18) * 0.03), 1);
    pointLight.intensity = 3.2 + Math.sin(time * 0.55) * 0.24;
    warmFill.intensity = 1.1 + Math.cos(time * 0.37) * 0.12;
}

function createShipModel(THREE, spec, color) {
    const ship = new THREE.Group();
    const baseMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.64,
        metalness: 0.2,
        flatShading: true
    });

    if (spec.shape === "cone") {
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 12, 1), baseMaterial);
        nose.rotation.z = -Math.PI / 2;
        nose.position.x = 0.19;

        const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.38, 10, 1), baseMaterial);
        hull.rotation.z = -Math.PI / 2;
        hull.position.x = -0.04;
        hull.scale.set(1, 0.88, 0.88);

        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 8, 1), baseMaterial);
        tail.rotation.z = -Math.PI / 2;
        tail.position.x = -0.28;

        ship.add(nose, hull, tail);
        return ship;
    }

    if (spec.shape === "ellipse") {
        const hull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), baseMaterial);
        hull.scale.set(1.3, 0.56, 0.76);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), baseMaterial);
        nose.position.set(0.22, 0.02, 0);
        nose.scale.set(1.1, 0.62, 0.62);

        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.16), baseMaterial);
        tail.position.set(-0.24, 0, 0);

        ship.add(hull, nose, tail);
        return ship;
    }

    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.22), baseMaterial);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.14), baseMaterial);
    bridge.position.set(0.08, 0.08, 0);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8, 1), baseMaterial);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.3;

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), baseMaterial);
    tail.position.set(-0.28, 0, 0);

    ship.add(hull, bridge, nose, tail);
    return ship;
}

function createPlanetHighlightMaterial(THREE, color) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: 0 },
            uPower: { value: 2.8 }
        },
        vertexShader: `
            uniform float uPower;
            varying float vRim;

            void main() {
                vec3 worldNormal = normalize(normalMatrix * normal);
                vec3 viewDirection = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
                vRim = pow(1.0 - max(dot(worldNormal, viewDirection), 0.0), uPower);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying float vRim;

            void main() {
                float rim = smoothstep(0.28, 1.0, vRim);
                gl_FragColor = vec4(uColor, rim * uOpacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });
}

function createOffsets(seed, count) {
    return Array.from({ length: count }, (_, index) => {
        const cols = count <= 4 ? 2 : 3;
        const rank = Math.floor(index / cols);
        const col = (index % cols) - (cols - 1) / 2;
        return {
            x: col * 1.34 - rank * 0.24 + Math.sin(seed * 0.01 + index * 0.8) * 0.08,
            y: (rank - 0.5) * 0.84 + Math.cos(seed * 0.013 + index * 0.9) * 0.08,
            z: -rank * 0.76 + Math.sin(seed * 0.02 + index) * 0.14,
            roll: Math.sin(seed * 0.03 + index) * 0.08,
            pitch: Math.cos(seed * 0.025 + index) * 0.06,
            scale: 0.34 + (index % 3) * 0.045
        };
    });
}

function shipCount(action) {
    if (action.category === "war") return 7;
    if (action.category === "trade") return 5;
    if (action.category === "diplomacy") return 4;
    if (action.category === "covert") return 4;
    return 5;
}

function createFleetSignature(planets) {
    return planets.map((planet) => `${planet.id}:${planet.currentAction?.key ?? "idle"}:${planet.currentAction?.targetId ?? ""}:${planet.fleetShape ?? "rect"}`).join("|");
}

function quaternionFromDirection(THREE, direction) {
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize());
    return quaternion;
}

function tradeStage(phase) {
    if (phase < 0.34) return { segment: "approach", hidden: false, progress: phase / 0.34 };
    if (phase < 0.46) return { segment: "dock", hidden: false, progress: (phase - 0.34) / 0.12 };
    if (phase < 0.58) return { segment: "transit", hidden: true, progress: (phase - 0.46) / 0.12 };
    if (phase < 0.72) return { segment: "emerge", hidden: false, progress: (phase - 0.58) / 0.14 };
    if (phase < 0.76) return { segment: "turn", hidden: false, progress: (phase - 0.72) / 0.04 };
    return { segment: "return", hidden: false, progress: (phase - 0.76) / 0.24 };
}

function quadraticBezierPoint(THREE, start, control, end, t) {
    const clamped = clamp(t, 0, 1);
    const oneMinus = 1 - clamped;
    return new THREE.Vector3()
        .copy(start).multiplyScalar(oneMinus * oneMinus)
        .add(control.clone().multiplyScalar(2 * oneMinus * clamped))
        .add(end.clone().multiplyScalar(clamped * clamped));
}

function quadraticBezierTangent(THREE, start, control, end, t) {
    const clamped = clamp(t, 0.001, 0.999);
    return control.clone().sub(start).multiplyScalar(2 * (1 - clamped))
        .add(end.clone().sub(control).multiplyScalar(2 * clamped))
        .normalize();
}

function createPlanetMaps(THREE, planet, seed) {
    const width = 512;
    const height = 256;
    const surfaceCanvas = document.createElement("canvas");
    const roughnessCanvas = document.createElement("canvas");
    const bumpCanvas = document.createElement("canvas");
    surfaceCanvas.width = roughnessCanvas.width = bumpCanvas.width = width;
    surfaceCanvas.height = roughnessCanvas.height = bumpCanvas.height = height;

    const surface = surfaceCanvas.getContext("2d");
    const roughness = roughnessCanvas.getContext("2d");
    const bump = bumpCanvas.getContext("2d");
    const palette = getPlanetPalette(planet.kind);

    paintPlanetTexture(surface, roughness, bump, palette, planet.kind, seed, width, height);

    const surfaceTexture = new THREE.CanvasTexture(surfaceCanvas);
    const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    [surfaceTexture, roughnessTexture, bumpTexture].forEach((texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
    });
    surfaceTexture.colorSpace = THREE.SRGBColorSpace;

    return {
        surface: surfaceTexture,
        roughness: roughnessTexture,
        bump: bumpTexture,
        clouds: ["oceanic", "storm", "aurora", "gas", "frozen"].includes(planet.kind)
            ? createCloudTexture(THREE, seed, width, height)
            : null
    };
}

function paintPlanetTexture(surface, roughness, bump, palette, kind, seed, width, height) {
    const textureProps = getPlanetTextureProps(kind);
    const gradient = surface.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.base);
    gradient.addColorStop(0.55, palette.mid);
    gradient.addColorStop(1, palette.deep);
    surface.fillStyle = gradient;
    surface.fillRect(0, 0, width, height);

    roughness.fillStyle = `rgb(${textureProps.roughnessBase},${textureProps.roughnessBase},${textureProps.roughnessBase})`;
    roughness.fillRect(0, 0, width, height);
    bump.fillStyle = `rgb(${textureProps.bumpBase},${textureProps.bumpBase},${textureProps.bumpBase})`;
    bump.fillRect(0, 0, width, height);

    for (let band = 0; band < 9; band += 1) {
        const y = (band / 8) * height;
        const wobble = Math.sin(seed * 0.0009 + band * 0.72) * 18;
        surface.fillStyle = `rgba(255,255,255,${kind === "gas" ? 0.12 : 0.04})`;
        surface.fillRect(0, y + wobble, width, kind === "gas" ? 18 : 8);
    }

    for (let patch = 0; patch < 42; patch += 1) {
        const x = fract(seed * 0.00017 + patch * 0.173) * width;
        const y = fract(seed * 0.00029 + patch * 0.217) * height;
        const rx = 18 + ((patch * 13) % 48);
        const ry = 10 + ((patch * 17) % 28);
        surface.fillStyle = patch % 3 === 0 ? `${palette.patch}66` : `${palette.patch2}44`;
        surface.beginPath();
        surface.ellipse(x, y, rx, ry, fract(seed * 0.00031 + patch * 0.11) * Math.PI, 0, Math.PI * 2);
        surface.fill();

        bump.fillStyle = `rgba(255,255,255,${kind === "gas" ? 0.02 : textureProps.bumpPatchAlpha})`;
        bump.beginPath();
        bump.ellipse(x, y, rx * 0.84, ry * 0.84, 0, 0, Math.PI * 2);
        bump.fill();
    }

    if (["volcanic", "desert", "canyon", "obsidian", "tundra", "frozen"].includes(kind)) {
        surface.strokeStyle = `rgba(255,255,255,${kind === "frozen" ? 0.08 : 0.04})`;
        bump.strokeStyle = "rgba(255,255,255,0.12)";
        for (let crack = 0; crack < 18; crack += 1) {
            const startX = fract(seed * 0.00041 + crack * 0.133) * width;
            const startY = fract(seed * 0.00053 + crack * 0.177) * height;
            const dx = ((crack % 5) - 2) * 22;
            const dy = ((crack % 7) - 3) * 14;
            surface.beginPath();
            surface.moveTo(startX, startY);
            surface.lineTo(startX + dx, startY + dy);
            surface.stroke();
            bump.beginPath();
            bump.moveTo(startX, startY);
            bump.lineTo(startX + dx, startY + dy);
            bump.stroke();
        }
    }

    roughness.fillStyle = `rgba(255,255,255,${textureProps.roughnessPatchAlpha})`;
    for (let cloud = 0; cloud < 60; cloud += 1) {
        const x = fract(seed * 0.00061 + cloud * 0.101) * width;
        const y = fract(seed * 0.00079 + cloud * 0.143) * height;
        roughness.beginPath();
        roughness.arc(x, y, 10 + (cloud % 7) * 3, 0, Math.PI * 2);
        roughness.fill();
    }
}

function createCloudTexture(THREE, seed, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    for (let i = 0; i < 64; i += 1) {
        const x = fract(seed * 0.00091 + i * 0.089) * width;
        const y = fract(seed * 0.00103 + i * 0.121) * height;
        const radius = 10 + (i % 9) * 6;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, "rgba(255,255,255,0.28)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

function getPlanetPalette(kind) {
    return {
        oceanic: { base: "#20486d", mid: "#3172a0", deep: "#0f2438", patch: "#7dd5c0", patch2: "#c4efe8" },
        desert: { base: "#865733", mid: "#c8955c", deep: "#5a351d", patch: "#d7b079", patch2: "#6f3d1d" },
        gas: { base: "#8e7b4d", mid: "#d1bd84", deep: "#5e4f2d", patch: "#f0dfb1", patch2: "#9c7a45" },
        frozen: { base: "#7ca2d0", mid: "#d7ecff", deep: "#47688c", patch: "#ffffff", patch2: "#bcd8f5" },
        twilight: { base: "#7e6233", mid: "#d4ad5c", deep: "#3b2459", patch: "#fff2a8", patch2: "#5d3986" },
        jungle: { base: "#245a31", mid: "#4ea462", deep: "#13331c", patch: "#92d58e", patch2: "#2f7c3f" },
        volcanic: { base: "#5d241b", mid: "#b64f32", deep: "#230c0a", patch: "#f8a15e", patch2: "#31110c" },
        crystal: { base: "#3f6f86", mid: "#79ddf4", deep: "#1e3946", patch: "#d9fbff", patch2: "#9be7ff" },
        storm: { base: "#395482", mid: "#7fb5ff", deep: "#17263f", patch: "#dfeeff", patch2: "#5f86c9" },
        machine: { base: "#55627c", mid: "#8e9bbc", deep: "#22293a", patch: "#d8e1f4", patch2: "#6d7f9f" },
        toxic: { base: "#516a22", mid: "#90c44f", deep: "#25320f", patch: "#d8ff86", patch2: "#6c8f2c" },
        aurora: { base: "#1c5961", mid: "#5ad2e0", deep: "#10252c", patch: "#d8ffff", patch2: "#93ffe3" },
        metallic: { base: "#77808e", mid: "#c1cad5", deep: "#474d56", patch: "#eff4ff", patch2: "#9ba4b5" },
        canyon: { base: "#74452e", mid: "#b97857", deep: "#3d2418", patch: "#efc1a0", patch2: "#7d492f" },
        obsidian: { base: "#31283f", mid: "#7f67a7", deep: "#15111d", patch: "#d6cbff", patch2: "#46355d" },
        reef: { base: "#226e6b", mid: "#5ed7cf", deep: "#133736", patch: "#ffb7a9", patch2: "#d2fff8" },
        ash: { base: "#5d514d", mid: "#a39690", deep: "#312a28", patch: "#e8ddd8", patch2: "#756660" },
        tundra: { base: "#657f9f", mid: "#b7d2ea", deep: "#2f4258", patch: "#f5fbff", patch2: "#8caacc" }
    }[kind] ?? { base: "#20486d", mid: "#3172a0", deep: "#0f2438", patch: "#7dd5c0", patch2: "#c4efe8" };
}

function getPlanetMaterialProps(kind) {
    const presets = {
        oceanic: { roughness: 0.28, metalness: 0.04, clearcoat: 0.88, clearcoatRoughness: 0.16, sheen: 0.08, sheenRoughness: 0.48, bumpScale: 0.024, emissiveIntensity: 0.05 },
        reef: { roughness: 0.24, metalness: 0.04, clearcoat: 0.82, clearcoatRoughness: 0.18, sheen: 0.12, sheenRoughness: 0.44, bumpScale: 0.026, emissiveIntensity: 0.05 },
        gas: { roughness: 0.38, metalness: 0.02, clearcoat: 0.42, clearcoatRoughness: 0.3, sheen: 0.32, sheenRoughness: 0.38, bumpScale: 0.01, emissiveIntensity: 0.04 },
        crystal: { roughness: 0.22, metalness: 0.12, clearcoat: 0.94, clearcoatRoughness: 0.1, sheen: 0.24, sheenRoughness: 0.22, bumpScale: 0.036, emissiveIntensity: 0.06 },
        metallic: { roughness: 0.18, metalness: 0.72, clearcoat: 0.78, clearcoatRoughness: 0.14, sheen: 0.1, sheenRoughness: 0.28, bumpScale: 0.03, emissiveIntensity: 0.04 },
        machine: { roughness: 0.24, metalness: 0.58, clearcoat: 0.64, clearcoatRoughness: 0.18, sheen: 0.06, sheenRoughness: 0.3, bumpScale: 0.03, emissiveIntensity: 0.04 },
        frozen: { roughness: 0.34, metalness: 0.04, clearcoat: 0.76, clearcoatRoughness: 0.18, sheen: 0.26, sheenRoughness: 0.22, bumpScale: 0.038, emissiveIntensity: 0.05 },
        aurora: { roughness: 0.32, metalness: 0.04, clearcoat: 0.72, clearcoatRoughness: 0.16, sheen: 0.3, sheenRoughness: 0.26, bumpScale: 0.034, emissiveIntensity: 0.06 },
        storm: { roughness: 0.4, metalness: 0.03, clearcoat: 0.48, clearcoatRoughness: 0.28, sheen: 0.18, sheenRoughness: 0.36, bumpScale: 0.032, emissiveIntensity: 0.04 },
        twilight: { roughness: 0.46, metalness: 0.04, clearcoat: 0.34, clearcoatRoughness: 0.34, sheen: 0.08, sheenRoughness: 0.4, bumpScale: 0.04, emissiveIntensity: 0.05 }
    };
    return presets[kind] ?? { roughness: 0.58, metalness: 0.05, clearcoat: 0.18, clearcoatRoughness: 0.44, sheen: 0.04, sheenRoughness: 0.48, bumpScale: 0.05, emissiveIntensity: 0.04 };
}

function getPlanetTextureProps(kind) {
    const presets = {
        oceanic: { roughnessBase: 78, roughnessPatchAlpha: 0.08, bumpBase: 124, bumpPatchAlpha: 0.07 },
        reef: { roughnessBase: 84, roughnessPatchAlpha: 0.08, bumpBase: 126, bumpPatchAlpha: 0.07 },
        gas: { roughnessBase: 124, roughnessPatchAlpha: 0.05, bumpBase: 118, bumpPatchAlpha: 0.02 },
        crystal: { roughnessBase: 72, roughnessPatchAlpha: 0.06, bumpBase: 136, bumpPatchAlpha: 0.09 },
        metallic: { roughnessBase: 56, roughnessPatchAlpha: 0.03, bumpBase: 128, bumpPatchAlpha: 0.05 },
        machine: { roughnessBase: 64, roughnessPatchAlpha: 0.04, bumpBase: 124, bumpPatchAlpha: 0.06 },
        frozen: { roughnessBase: 88, roughnessPatchAlpha: 0.08, bumpBase: 132, bumpPatchAlpha: 0.08 },
        aurora: { roughnessBase: 92, roughnessPatchAlpha: 0.08, bumpBase: 128, bumpPatchAlpha: 0.08 },
        storm: { roughnessBase: 104, roughnessPatchAlpha: 0.08, bumpBase: 126, bumpPatchAlpha: 0.06 },
        desert: { roughnessBase: 146, roughnessPatchAlpha: 0.1, bumpBase: 122, bumpPatchAlpha: 0.08 },
        volcanic: { roughnessBase: 152, roughnessPatchAlpha: 0.12, bumpBase: 136, bumpPatchAlpha: 0.1 },
        obsidian: { roughnessBase: 98, roughnessPatchAlpha: 0.08, bumpBase: 132, bumpPatchAlpha: 0.09 }
    };
    return presets[kind] ?? { roughnessBase: 134, roughnessPatchAlpha: 0.1, bumpBase: 122, bumpPatchAlpha: 0.08 };
}

function perpendicularOffset(THREE, direction, seed, magnitude) {
    const helper = Math.abs(direction.y) > 0.84 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = direction.clone().cross(helper).normalize();
    const bitangent = direction.clone().cross(tangent).normalize();
    return tangent.multiplyScalar(Math.sin(seed * 0.01) * magnitude).add(bitangent.multiplyScalar(Math.cos(seed * 0.013) * magnitude * 0.5));
}

function ringEuler(seed) {
    return { x: Math.PI * 0.5 + ((seed % 41) - 20) * 0.014, y: ((seed % 91) - 45) * 0.018, z: ((seed % 63) - 31) * 0.02 };
}

function clearGroup(group) {
    while (group.children.length) {
        group.remove(group.children[0]);
    }
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function fract(value) {
    return value - Math.floor(value);
}

function pingPong(value) {
    return value < 0.5 ? value * 2 : (1 - value) * 2;
}

function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function lightenHex(hex, amount) {
    const value = hex.replace("#", "");
    const bigint = parseInt(value, 16);
    const r = clamp(((bigint >> 16) & 255) + amount, 0, 255);
    const g = clamp(((bigint >> 8) & 255) + amount, 0, 255);
    const b = clamp((bigint & 255) + amount, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
}
