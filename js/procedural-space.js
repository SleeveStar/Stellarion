export function createProceduralDeepSpace(THREE) {
    const root = new THREE.Group();
    const backgroundLayer = new THREE.Group();
    const deepLayer = new THREE.Group();
    const foregroundLayer = new THREE.Group();

    const farStars = createStarShell(THREE, {
        count: 10400,
        radiusMin: 250,
        radiusMax: 430,
        size: 0.48,
        opacity: 0.94,
        bias: 1.18,
        yScale: 1
    });
    const nearStars = createStarShell(THREE, {
        count: 5600,
        radiusMin: 170,
        radiusMax: 280,
        size: 0.58,
        opacity: 0.98,
        bias: 0.94,
        yScale: 0.96
    });
    const stellarBulge = createStarShell(THREE, {
        count: 6200,
        radiusMin: 68,
        radiusMax: 228,
        size: 0.36,
        opacity: 0.82,
        bias: 0.62,
        yScale: 0.46
    });
    const centralCluster = createStarShell(THREE, {
        count: 4200,
        radiusMin: 24,
        radiusMax: 146,
        size: 0.32,
        opacity: 0.76,
        bias: 0.54,
        yScale: 0.34
    });
    const brightStars = createStarShell(THREE, {
        count: 420,
        radiusMin: 32,
        radiusMax: 236,
        size: 1.08,
        opacity: 0.98,
        bias: 0.76,
        yScale: 0.88
    });
    const milkyWay = createMilkyWayBand(THREE);
    const galaxies = createGalaxyField(THREE);
    const nebulae = createNebulaField(THREE);

    backgroundLayer.add(farStars, milkyWay.group, galaxies.group, nebulae.group);
    deepLayer.add(nearStars, stellarBulge);
    foregroundLayer.add(centralCluster, brightStars);
    root.add(backgroundLayer, deepLayer, foregroundLayer);

    root.userData = {
        backgroundLayer,
        deepLayer,
        foregroundLayer,
        milkyWay,
        galaxies,
        nebulae,
        parallaxCurrent: new THREE.Vector2(),
        parallaxTarget: new THREE.Vector2()
    };

    return root;
}

export function updateProceduralDeepSpace(space, camera, time, pointer = { x: 0, y: 0 }) {
    if (!space?.userData) return;
    const { backgroundLayer, deepLayer, foregroundLayer, milkyWay, galaxies, nebulae, parallaxCurrent, parallaxTarget } = space.userData;

    parallaxTarget.set((pointer.x || 0) * 7.5, (pointer.y || 0) * 4.4);
    parallaxCurrent.lerp(parallaxTarget, 0.045);

    backgroundLayer.position.copy(camera.position).multiplyScalar(0.04);
    deepLayer.position.copy(camera.position).multiplyScalar(0.028);
    foregroundLayer.position.copy(camera.position).multiplyScalar(0.016);

    backgroundLayer.position.x += parallaxCurrent.x * 1.1;
    backgroundLayer.position.y += parallaxCurrent.y * 0.72;
    deepLayer.position.x += parallaxCurrent.x * 0.54;
    deepLayer.position.y += parallaxCurrent.y * 0.38;
    foregroundLayer.position.x += parallaxCurrent.x * 0.16;
    foregroundLayer.position.y += parallaxCurrent.y * 0.1;

    milkyWay.group.rotation.y = milkyWay.baseRotation.y + time * 0.004;
    milkyWay.group.rotation.z = milkyWay.baseRotation.z + Math.sin(time * 0.08) * 0.02;
    milkyWay.group.position.copy(milkyWay.baseOffset);
    milkyWay.group.position.x += parallaxCurrent.x * 0.38;
    milkyWay.group.position.y += parallaxCurrent.y * 0.26;
    galaxies.group.children.forEach((galaxy, index) => {
        galaxy.rotation.z = galaxy.userData.baseRotation + time * galaxy.userData.rotationSpeed;
        galaxy.rotation.y = galaxy.userData.baseTilt + Math.sin(time * 0.12 + index) * 0.05;
        galaxy.position.x = galaxy.userData.basePosition.x + parallaxCurrent.x * galaxy.userData.parallax;
        galaxy.position.y = galaxy.userData.basePosition.y + parallaxCurrent.y * galaxy.userData.parallax * 0.7;
    });

    nebulae.clusters.forEach((cluster, index) => {
        cluster.group.position.x = cluster.basePosition.x + parallaxCurrent.x * cluster.parallax;
        cluster.group.position.y = cluster.basePosition.y + parallaxCurrent.y * cluster.parallax * 0.82;
        cluster.group.rotation.z = cluster.baseRotation + Math.sin(time * cluster.driftSpeed + index) * 0.035;

        cluster.layers.forEach((layer) => {
            layer.material.uniforms.uTime.value = time;
            layer.mesh.quaternion.copy(camera.quaternion);
            layer.mesh.rotateZ(layer.baseRotation + time * layer.spinSpeed);
            layer.mesh.position.z = layer.baseDepth + Math.sin(time * layer.depthSpeed + layer.seed) * 1.6;
        });
    });
}

function createStarShell(THREE, options) {
    const { count, radiusMin, radiusMax, size, opacity, bias, yScale } = options;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const pool = [0xf6f8ff, 0xffffff, 0xf8f6ef, 0xeef5ff, 0xf6f4ff];

    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const radius = radiusMin + Math.pow(Math.random(), bias) * (radiusMax - radiusMin);

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.cos(phi) * yScale;
        positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

        const color = new THREE.Color(pick(pool));
        const lift = 0.92 + Math.random() * 0.08;
        colors[i * 3] = color.r * lift;
        colors[i * 3 + 1] = color.g * lift;
        colors[i * 3 + 2] = color.b * lift;
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
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.06
        })
    );
}

function createMilkyWayBand(THREE) {
    const group = new THREE.Group();
    const baseRotation = { x: -0.48, y: 0.62, z: 0.16 };
    const baseOffset = new THREE.Vector3(34, 18, -22);

    const denseBand = createBandLayer(THREE, {
        count: 5200,
        radiusMin: 220,
        radiusMax: 450,
        thickness: 18,
        size: 0.34,
        opacity: 0.42,
        holeRadius: 118
    });
    const dustBand = createBandLayer(THREE, {
        count: 3400,
        radiusMin: 210,
        radiusMax: 430,
        thickness: 34,
        size: 0.82,
        opacity: 0.17,
        holeRadius: 132
    });
    group.add(denseBand, dustBand);
    group.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
    group.position.copy(baseOffset);
    return { group, baseRotation, baseOffset };
}

function createBandLayer(THREE, options) {
    const { count, radiusMin, radiusMax, thickness, size, opacity, holeRadius = 0 } = options;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const effectiveMin = Math.max(radiusMin, holeRadius);
        const radius = effectiveMin + Math.pow(Math.random(), 0.82) * (radiusMax - effectiveMin);
        const height = gaussianRandom() * thickness;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = Math.sin(angle) * radius;

        const warmth = 0.94 + Math.random() * 0.06;
        colors[i * 3] = warmth;
        colors[i * 3 + 1] = warmth * 0.985;
        colors[i * 3 + 2] = warmth * 1.01;
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
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.04
        })
    );
}

function createGalaxyField(THREE) {
    const group = new THREE.Group();
    const configs = [
        { type: "spiral", position: [170, 102, -230], color: 0xaecfff, scale: 84, rotation: 0.36, tilt: 0.16, speed: 0.01, parallax: 0.18, seed: 11 },
        { type: "elliptical", position: [-212, -92, 186], color: 0xffddb8, scale: 70, rotation: -0.24, tilt: -0.12, speed: -0.008, parallax: 0.14, seed: 23 },
        { type: "irregular", position: [126, -134, 254], color: 0xd8d0ff, scale: 60, rotation: 0.58, tilt: 0.1, speed: 0.012, parallax: 0.12, seed: 37 },
        { type: "spiral", position: [-98, 148, 226], color: 0xb8d8ff, scale: 56, rotation: 0.12, tilt: -0.08, speed: 0.009, parallax: 0.13, seed: 49 }
    ];

    configs.forEach((config) => {
        const galaxy = createGalaxyCluster(THREE, config);
        galaxy.position.fromArray(config.position);
        galaxy.userData = {
            basePosition: new THREE.Vector3(...config.position),
            baseRotation: config.rotation,
            baseTilt: config.tilt,
            rotationSpeed: config.speed,
            parallax: config.parallax
        };
        group.add(galaxy);
    });

    return { group };
}

function createGalaxyCluster(THREE, config) {
    if (config.type === "elliptical") return createEllipticalGalaxyCluster(THREE, config);
    if (config.type === "irregular") return createIrregularGalaxyCluster(THREE, config);
    return createSpiralGalaxyCluster(THREE, config);
}

function createSpiralGalaxyCluster(THREE, config) {
    const group = new THREE.Group();
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const ridgeCount = 700;
    const ridgePositions = new Float32Array(ridgeCount * 3);
    const ridgeColors = new Float32Array(ridgeCount * 3);
    const corePositions = new Float32Array(220 * 3);
    const coreColors = new Float32Array(220 * 3);
    const baseColor = new THREE.Color(config.color);

    for (let i = 0; i < count; i += 1) {
        const arm = i % 2;
        const t = Math.pow(Math.random(), 0.52);
        const twist = arm * Math.PI + t * 6.6 + Math.sin((config.seed + i) * 0.18) * 0.04;
        const radius = t * config.scale;
        const spread = (1 - t) * config.scale * 0.035 + 0.7;

        positions[i * 3] = Math.cos(twist) * radius + gaussianRandom() * spread;
        positions[i * 3 + 1] = gaussianRandom() * config.scale * 0.03;
        positions[i * 3 + 2] = Math.sin(twist) * radius * 0.28 + gaussianRandom() * spread * 0.28;

        const c = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.42 + Math.random() * 0.46);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    for (let i = 0; i < ridgeCount; i += 1) {
        const arm = i % 2;
        const t = Math.pow(Math.random(), 0.66);
        const twist = arm * Math.PI + t * 6.9;
        const radius = (0.08 + t * 0.92) * config.scale;
        ridgePositions[i * 3] = Math.cos(twist) * radius + gaussianRandom() * 0.28;
        ridgePositions[i * 3 + 1] = gaussianRandom() * config.scale * 0.012;
        ridgePositions[i * 3 + 2] = Math.sin(twist) * radius * 0.24 + gaussianRandom() * 0.16;

        const c = new THREE.Color(0xffffff).lerp(baseColor, 0.06 + Math.random() * 0.08);
        ridgeColors[i * 3] = c.r;
        ridgeColors[i * 3 + 1] = c.g;
        ridgeColors[i * 3 + 2] = c.b;
    }

    for (let i = 0; i < 220; i += 1) {
        const radius = Math.pow(Math.random(), 0.44) * config.scale * 0.2;
        const angle = Math.random() * Math.PI * 2;
        corePositions[i * 3] = Math.cos(angle) * radius;
        corePositions[i * 3 + 1] = gaussianRandom() * config.scale * 0.018;
        corePositions[i * 3 + 2] = Math.sin(angle) * radius * 0.42;

        const c = new THREE.Color(0xffffff).lerp(baseColor, 0.1);
        coreColors[i * 3] = c.r;
        coreColors[i * 3 + 1] = c.g;
        coreColors[i * 3 + 2] = c.b;
    }

    const armGeometry = new THREE.BufferGeometry();
    armGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    armGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const armPoints = new THREE.Points(
        armGeometry,
        new THREE.PointsMaterial({
            size: 0.58,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.5,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.06
        })
    );

    const ridgeGeometry = new THREE.BufferGeometry();
    ridgeGeometry.setAttribute("position", new THREE.BufferAttribute(ridgePositions, 3));
    ridgeGeometry.setAttribute("color", new THREE.BufferAttribute(ridgeColors, 3));
    const ridgePoints = new THREE.Points(
        ridgeGeometry,
        new THREE.PointsMaterial({
            size: 0.84,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.74,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.06
        })
    );

    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
    coreGeometry.setAttribute("color", new THREE.BufferAttribute(coreColors, 3));
    const corePoints = new THREE.Points(
        coreGeometry,
        new THREE.PointsMaterial({
            size: 1.34,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.82,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.06
        })
    );

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE, ["rgba(255,255,255,0.92)", "rgba(255,234,202,0.32)", "rgba(255,234,202,0)"]),
        color: config.color,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    glow.scale.set(config.scale * 0.48, config.scale * 0.28, 1);

    group.add(armPoints, ridgePoints, corePoints, glow);
    group.rotation.set(config.tilt, 0, config.rotation);
    return group;
}

function createEllipticalGalaxyCluster(THREE, config) {
    const group = new THREE.Group();
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(config.color);

    for (let i = 0; i < count; i += 1) {
        const radius = Math.pow(Math.random(), 0.52) * config.scale * 0.88;
        const angle = Math.random() * Math.PI * 2;
        const squash = 0.56 + Math.random() * 0.08;
        positions[i * 3] = Math.cos(angle) * radius + gaussianRandom() * 1.2;
        positions[i * 3 + 1] = gaussianRandom() * config.scale * 0.05;
        positions[i * 3 + 2] = Math.sin(angle) * radius * squash + gaussianRandom() * 0.9;

        const c = new THREE.Color(0xffffff).lerp(baseColor, 0.08 + Math.random() * 0.18);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 0.62,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        vertexColors: true,
        depthWrite: false,
        map: getSoftParticleTexture(THREE),
        alphaMap: getSoftParticleTexture(THREE),
        alphaTest: 0.06
    }));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE, ["rgba(255,255,255,0.95)", "rgba(255,240,216,0.36)", "rgba(255,240,216,0)"]),
        color: config.color,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    glow.scale.set(config.scale * 0.9, config.scale * 0.5, 1);

    group.add(stars, glow);
    group.rotation.set(config.tilt, 0, config.rotation);
    return group;
}

function createIrregularGalaxyCluster(THREE, config) {
    const group = new THREE.Group();
    const count = 1100;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(config.color);

    for (let i = 0; i < count; i += 1) {
        const blob = i % 4;
        const blobAngle = blob * ((Math.PI * 2) / 4) + Math.sin((config.seed + i) * 0.1) * 0.3;
        const blobRadius = config.scale * (0.18 + blob * 0.1);
        const centerX = Math.cos(blobAngle) * blobRadius * 0.44;
        const centerZ = Math.sin(blobAngle) * blobRadius * 0.28;
        positions[i * 3] = centerX + gaussianRandom() * config.scale * 0.14;
        positions[i * 3 + 1] = gaussianRandom() * config.scale * 0.08;
        positions[i * 3 + 2] = centerZ + gaussianRandom() * config.scale * 0.1;

        const c = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.28 + Math.random() * 0.34);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: 0.6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.46,
        vertexColors: true,
        depthWrite: false,
        map: getSoftParticleTexture(THREE),
        alphaMap: getSoftParticleTexture(THREE),
        alphaTest: 0.06
    }));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE, ["rgba(255,255,255,0.9)", "rgba(220,228,255,0.26)", "rgba(220,228,255,0)"]),
        color: config.color,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    glow.scale.set(config.scale * 0.7, config.scale * 0.42, 1);

    group.add(stars, glow);
    group.rotation.set(config.tilt, 0, config.rotation);
    return group;
}

function createNebulaField(THREE) {
    const group = new THREE.Group();
    const configs = [
        { type: "offset-core", position: [-164, 88, -244], scale: 132, palette: [0xdaf7ff, 0x92f2ff, 0xf7cb88, 0xa8ffb8], opacity: 0.26, rotation: 0.24, seed: 5, parallax: 0.2, driftSpeed: 0.08, coreColor: 0xdffaff, rimColor: 0xf6bd72 },
        { type: "double-core", position: [224, -66, 146], scale: 116, palette: [0xe7ffff, 0x9cf6dc, 0xffcc84, 0xd5ff96], opacity: 0.24, rotation: -0.32, seed: 13, parallax: 0.16, driftSpeed: 0.07, coreColor: 0xd9fff4, rimColor: 0xffcb75 },
        { type: "ring", position: [92, 144, 214], scale: 102, palette: [0xf0ebff, 0xb4d8ff, 0xffc078, 0xc8ff9d], opacity: 0.22, rotation: 0.52, seed: 29, parallax: 0.14, driftSpeed: 0.09, coreColor: 0xe9e8ff, rimColor: 0xffb15d },
        { type: "veil", position: [-238, -122, 116], scale: 110, palette: [0xeaffff, 0xa1ffd9, 0xffbb6e, 0xe2ff92], opacity: 0.24, rotation: -0.6, seed: 41, parallax: 0.18, driftSpeed: 0.06, coreColor: 0xddfff9, rimColor: 0xffa95a },
        { type: "pillar", position: [168, 126, -188], scale: 94, palette: [0xdff4ff, 0x9bf3ff, 0xffc781, 0xadffb4], opacity: 0.21, rotation: 0.38, seed: 53, parallax: 0.15, driftSpeed: 0.075, coreColor: 0xdff7ff, rimColor: 0xf0ba6a },
        { type: "butterfly", position: [-122, 164, 132], scale: 88, palette: [0xf7eeff, 0xc3dbff, 0xffc488, 0xe5ff9c], opacity: 0.2, rotation: -0.18, seed: 67, parallax: 0.13, driftSpeed: 0.082, coreColor: 0xf5eeff, rimColor: 0xf6b977 },
        { type: "double-core", position: [238, 126, -118], scale: 104, palette: [0xe9f6ff, 0x6cf3ff, 0xc78bff, 0xffdd74], opacity: 0.23, rotation: 0.31, seed: 79, parallax: 0.16, driftSpeed: 0.071, coreColor: 0xdffbff, rimColor: 0xffd45f }
    ];

    const clusters = configs.map((config) => {
        const cluster = createNebulaCluster(THREE, config);
        cluster.group.position.fromArray(config.position);
        cluster.basePosition = new THREE.Vector3(...config.position);
        cluster.baseRotation = config.rotation;
        cluster.parallax = config.parallax;
        cluster.driftSpeed = config.driftSpeed;
        group.add(cluster.group);
        return cluster;
    });

    return { group, clusters };
}

function createNebulaCluster(THREE, config) {
    const group = new THREE.Group();
    const layers = [];
    for (let index = 0; index < 4; index += 1) {
        const size = nebulaLayerScale(config.type, index, config.scale);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size.width, size.height),
            createNebulaMaterial(THREE, {
                colors: config.palette,
                opacity: config.opacity * (1 - index * 0.16),
                seed: config.seed + index * 17
            })
        );
        const baseDepth = (index - 1.5) * (config.type === "veil" ? 10 : 7);
        const offset = nebulaLayerOffset(config.type, index, config.scale, config.seed);
        mesh.position.set(
            offset.x,
            offset.y,
            baseDepth
        );
        group.add(mesh);
        layers.push({
            mesh,
            material: mesh.material,
            baseRotation: config.rotation * 0.34 + index * 0.28,
            spinSpeed: 0.012 + index * 0.004,
            baseDepth,
            depthSpeed: 0.18 + index * 0.04,
            seed: config.seed + index * 2.3
        });
    }

    const coreGlow = createNebulaCoreGlow(THREE, config);
    const filaments = createNebulaFilaments(THREE, config);
    const sparkleCloud = createNebulaSparkles(THREE, config);
    group.add(coreGlow, filaments, sparkleCloud);

    return { group, layers };
}

function createNebulaMaterial(THREE, options) {
    const colorA = new THREE.Color(options.colors[0]);
    const colorB = new THREE.Color(options.colors[1]);
    const colorC = new THREE.Color(options.colors[2]);
    const colorD = new THREE.Color(options.colors[3] ?? options.colors[2]);

    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uColorA: { value: colorA },
            uColorB: { value: colorB },
            uColorC: { value: colorC },
            uColorD: { value: colorD },
            uOpacity: { value: options.opacity },
            uSeed: { value: options.seed }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            uniform vec3 uColorC;
            uniform vec3 uColorD;
            uniform float uOpacity;
            uniform float uSeed;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            float fbm(vec2 p) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 5; i++) {
                    value += amplitude * noise(p);
                    p = p * 2.02 + vec2(14.7, 9.2);
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= 0.92;
                vec2 flow = uv * 1.65 + vec2(uSeed * 0.07, uSeed * 0.11);
                float t = uTime * 0.02;
                float cloudA = fbm(flow + vec2(t * 0.8, -t * 0.45));
                float cloudB = fbm(flow * 1.9 - vec2(t * 1.1, t * 0.55));
                float cloudC = fbm(flow * 3.2 + vec2(-t * 0.35, t * 0.7));
                float cloudD = fbm(flow * 4.4 + vec2(t * 0.28, -t * 0.22));
                float cloudE = fbm(flow * 6.1 + vec2(-t * 0.62, t * 0.26));
                float radial = smoothstep(1.18, 0.1, length(vec2(uv.x, uv.y * 1.08)));
                float cavityShape = fbm(flow * 1.2 - vec2(t * 0.34, -t * 0.21));
                float cavities = smoothstep(0.56, 0.88, cavityShape) * smoothstep(0.92, 0.18, length(uv * vec2(0.86, 1.22)));
                float density = smoothstep(0.34, 0.96, cloudA * 0.62 + cloudB * 0.28 + cloudC * 0.22 + cloudD * 0.14) * radial;
                density *= (1.0 - cavities * 0.58);
                float wisps = smoothstep(0.42, 1.0, cloudB) * radial;
                float filaments = smoothstep(0.58, 1.0, abs(cloudD - cloudC) * 1.25 + cloudE * 0.48) * radial;
                float edgeMask = smoothstep(0.58, 1.04, length(vec2(uv.x * 0.9, uv.y * 1.14)));
                float coreGlow = smoothstep(0.62, 0.02, length(vec2(uv.x * 0.82, uv.y * 1.04))) * (0.45 + cloudA * 0.55);
                vec3 color = mix(uColorA, uColorB, clamp(cloudA * 1.2, 0.0, 1.0));
                color = mix(color, uColorB, clamp(coreGlow * 0.7, 0.0, 1.0));
                color = mix(color, uColorC, clamp(filaments * 0.86 + edgeMask * 0.1, 0.0, 1.0));
                color = mix(color, uColorD, clamp((wisps * 0.45 + edgeMask * 0.16), 0.0, 1.0));
                float alpha = (pow(density, 1.26) + filaments * 0.16 + coreGlow * 0.12) * uOpacity;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createNebulaCoreGlow(THREE, config) {
    const group = new THREE.Group();
    const profiles = nebulaCoreProfiles(config);
    profiles.forEach((profile) => group.add(createNebulaCoreCluster(THREE, config, profile)));

    return group;
}

function createNebulaFilaments(THREE, config) {
    const count = config.type === "veil" ? 760 : config.type === "pillar" ? 440 : 520;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rim = new THREE.Color(config.rimColor);
    const warm = rim.clone().lerp(new THREE.Color(0xfff0d4), 0.34);
    for (let i = 0; i < count; i += 1) {
        const strand = i % (config.type === "butterfly" ? 4 : config.type === "veil" ? 8 : 6);
        const baseAngle = strand * ((Math.PI * 2) / Math.max(4, strand + 1));
        const angle = baseAngle + Math.sin((config.seed + i) * 0.13) * (config.type === "veil" ? 0.18 : 0.34);
        const radius = filamentRadius(config.type, config.scale, i, count);
        const noise = gaussianRandom() * config.scale * 0.035;
        positions[i * 3] = Math.cos(angle) * radius + noise + filamentOffsetX(config.type, config.scale, angle, i);
        positions[i * 3 + 1] = gaussianRandom() * config.scale * (config.type === "pillar" ? 0.08 : 0.05);
        positions[i * 3 + 2] = Math.sin(angle) * radius * filamentDepthScale(config.type) + noise * 0.4;
        const color = rim.clone().lerp(warm, Math.random() * 0.7);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size: 1.18,
            sizeAttenuation: true,
            transparent: true,
            opacity: config.opacity * 0.32,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.03
        })
    );
}

function createGlowSprite(THREE, color, width, height, opacity) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE, ["rgba(255,255,255,0.96)", "rgba(200,255,245,0.42)", "rgba(200,255,245,0)"]),
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    sprite.scale.set(width, height, 1);
    return sprite;
}

function createNebulaCoreCluster(THREE, config, profile) {
    const group = new THREE.Group();
    const count = profile.count ?? 120;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(config.coreColor);
    const tint = base.clone().lerp(new THREE.Color(0xffffff), 0.28);

    for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), profile.bias ?? 0.42) * profile.radius;
        positions[i * 3] = Math.cos(angle) * radius * profile.stretchX + gaussianRandom() * profile.softness;
        positions[i * 3 + 1] = gaussianRandom() * profile.height;
        positions[i * 3 + 2] = Math.sin(angle) * radius * profile.stretchZ + gaussianRandom() * profile.softness * 0.7;

        const c = base.clone().lerp(tint, Math.random() * 0.7);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mist = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size: profile.size,
            sizeAttenuation: true,
            transparent: true,
            opacity: profile.opacity,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.03
        })
    );

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(THREE, ["rgba(255,255,255,0.72)", "rgba(200,255,245,0.12)", "rgba(200,255,245,0)"]),
        color: config.coreColor,
        transparent: true,
        opacity: profile.glowOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    glow.scale.set(profile.radius * profile.stretchX * 3.2, profile.radius * profile.stretchZ * 2.4, 1);

    group.position.set(profile.offset.x, profile.offset.y, profile.offset.z);
    group.add(mist, glow);
    return group;
}

function nebulaCoreProfiles(config) {
    const s = config.scale;
    if (config.type === "veil") {
        return [
            { offset: { x: -s * 0.2, y: s * 0.08, z: -2 }, radius: s * 0.08, stretchX: 1.4, stretchZ: 0.8, height: s * 0.018, softness: s * 0.02, size: 1.26, opacity: 0.12, glowOpacity: 0.08, count: 110 },
            { offset: { x: s * 0.18, y: -s * 0.02, z: -4 }, radius: s * 0.06, stretchX: 1.2, stretchZ: 0.7, height: s * 0.014, softness: s * 0.016, size: 1.04, opacity: 0.09, glowOpacity: 0.06, count: 90 }
        ];
    }
    if (config.type === "double-core") {
        return [
            { offset: { x: -s * 0.14, y: s * 0.04, z: 0 }, radius: s * 0.07, stretchX: 1.1, stretchZ: 0.86, height: s * 0.016, softness: s * 0.015, size: 1.18, opacity: 0.16, glowOpacity: 0.1, count: 120 },
            { offset: { x: s * 0.13, y: -s * 0.03, z: -2 }, radius: s * 0.06, stretchX: 1.06, stretchZ: 0.8, height: s * 0.014, softness: s * 0.014, size: 1.1, opacity: 0.14, glowOpacity: 0.09, count: 110 }
        ];
    }
    if (config.type === "ring") {
        return [
            { offset: { x: -s * 0.08, y: s * 0.03, z: -2 }, radius: s * 0.042, stretchX: 0.88, stretchZ: 0.7, height: s * 0.012, softness: s * 0.01, size: 0.88, opacity: 0.055, glowOpacity: 0.022, count: 58 },
            { offset: { x: s * 0.1, y: -s * 0.02, z: -4 }, radius: s * 0.035, stretchX: 0.72, stretchZ: 0.6, height: s * 0.01, softness: s * 0.008, size: 0.8, opacity: 0.045, glowOpacity: 0.018, count: 44 }
        ];
    }
    if (config.type === "pillar") {
        return [
            { offset: { x: -s * 0.05, y: s * 0.14, z: 0 }, radius: s * 0.045, stretchX: 0.8, stretchZ: 0.7, height: s * 0.02, softness: s * 0.012, size: 0.98, opacity: 0.08, glowOpacity: 0.04, count: 70 },
            { offset: { x: 0, y: 0, z: -1.5 }, radius: s * 0.05, stretchX: 0.84, stretchZ: 0.76, height: s * 0.024, softness: s * 0.013, size: 1.02, opacity: 0.1, glowOpacity: 0.05, count: 80 },
            { offset: { x: s * 0.05, y: -s * 0.15, z: -3 }, radius: s * 0.055, stretchX: 0.9, stretchZ: 0.78, height: s * 0.025, softness: s * 0.014, size: 1.06, opacity: 0.11, glowOpacity: 0.05, count: 90 }
        ];
    }
    if (config.type === "butterfly") {
        return [
            { offset: { x: -s * 0.17, y: 0, z: -1 }, radius: s * 0.055, stretchX: 1.28, stretchZ: 0.76, height: s * 0.015, softness: s * 0.014, size: 1.04, opacity: 0.12, glowOpacity: 0.07, count: 100 },
            { offset: { x: s * 0.17, y: 0, z: -1 }, radius: s * 0.055, stretchX: 1.28, stretchZ: 0.76, height: s * 0.015, softness: s * 0.014, size: 1.04, opacity: 0.12, glowOpacity: 0.07, count: 100 },
            { offset: { x: 0, y: 0, z: 0 }, radius: s * 0.03, stretchX: 0.7, stretchZ: 0.6, height: s * 0.012, softness: s * 0.008, size: 0.86, opacity: 0.06, glowOpacity: 0.03, count: 60 }
        ];
    }
    return [
        { offset: { x: s * 0.1, y: -s * 0.05, z: 0 }, radius: s * 0.1, stretchX: 1.16, stretchZ: 0.86, height: s * 0.018, softness: s * 0.018, size: 1.22, opacity: 0.14, glowOpacity: 0.08, count: 140 },
        { offset: { x: s * 0.04, y: -s * 0.02, z: -4 }, radius: s * 0.16, stretchX: 1.22, stretchZ: 0.92, height: s * 0.02, softness: s * 0.02, size: 1.34, opacity: 0.08, glowOpacity: 0.05, count: 120 }
    ];
}

function nebulaLayerScale(type, index, scale) {
    if (type === "veil") return { width: scale * (1.9 + index * 0.14), height: scale * (0.5 + index * 0.06) };
    if (type === "pillar") return { width: scale * (0.72 + index * 0.08), height: scale * (1.28 + index * 0.18) };
    if (type === "butterfly") return { width: scale * (1.46 + index * 0.16), height: scale * (0.8 + index * 0.1) };
    if (type === "ring") return { width: scale * (1.18 + index * 0.18), height: scale * (1.04 + index * 0.14) };
    return { width: scale * (1.3 + index * 0.18), height: scale * (0.86 + index * 0.12) };
}

function nebulaLayerOffset(type, index, scale, seed) {
    if (type === "offset-core") {
        return { x: (index - 1.2) * scale * 0.1, y: Math.sin(seed + index) * scale * 0.05 };
    }
    if (type === "double-core") {
        return { x: (index % 2 === 0 ? -1 : 1) * scale * 0.06 + (index - 1.5) * scale * 0.03, y: Math.cos(seed + index) * scale * 0.04 };
    }
    if (type === "veil") {
        return { x: (index - 1.5) * scale * 0.16, y: Math.sin(seed + index) * scale * 0.02 };
    }
    if (type === "pillar") {
        return { x: (index - 1.5) * scale * 0.02, y: (1.5 - index) * scale * 0.12 };
    }
    if (type === "butterfly") {
        return { x: (index % 2 === 0 ? -1 : 1) * scale * 0.1, y: Math.sin(seed + index) * scale * 0.03 };
    }
    return { x: (index - 1.5) * scale * 0.08, y: Math.sin(seed + index) * scale * 0.04 };
}

function filamentRadius(type, scale, index, count) {
    const t = index / Math.max(1, count - 1);
    if (type === "ring") return scale * (0.2 + Math.random() * 0.3 + Math.sin(index * 0.17) * 0.03);
    if (type === "veil") return scale * (0.34 + t * 0.44);
    if (type === "pillar") return scale * (0.14 + Math.random() * 0.18);
    if (type === "butterfly") return scale * (0.2 + Math.random() * 0.34);
    return scale * (0.22 + Math.random() * 0.42);
}

function filamentDepthScale(type) {
    if (type === "veil") return 0.34;
    if (type === "pillar") return 0.82;
    if (type === "ring") return 0.46;
    return 0.56;
}

function filamentOffsetX(type, scale, angle, index) {
    if (type === "butterfly") return Math.sign(Math.cos(angle)) * scale * 0.12;
    if (type === "pillar") return Math.sin(index * 0.2) * scale * 0.04;
    return 0;
}

function createNebulaSparkles(THREE, config) {
    const count = 360;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sparklePalette = [config.palette[1], config.palette[2], config.palette[3] ?? config.palette[2]];
    for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.52) * config.scale * 0.48;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = gaussianRandom() * config.scale * 0.08;
        positions[i * 3 + 2] = Math.sin(angle) * radius * 0.72;
        const color = new THREE.Color(pick(sparklePalette)).lerp(new THREE.Color(0xffffff), 0.18 + Math.random() * 0.38);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size: 0.92,
            sizeAttenuation: true,
            transparent: true,
            opacity: config.opacity * 0.34,
            vertexColors: true,
            depthWrite: false,
            map: getSoftParticleTexture(THREE),
            alphaMap: getSoftParticleTexture(THREE),
            alphaTest: 0.03
        })
    );
}

function createNebulaBillboardSet(THREE, options) {
    const group = new THREE.Group();
    const layers = [];
    for (let index = 0; index < options.layers; index += 1) {
        const material = createNebulaMaterial(THREE, {
            colors: options.palette,
            opacity: options.opacity * (1 - index * 0.18),
            seed: options.seed + index * 13
        });
        const width = options.scale * (options.stretched ? 1.8 : 1.2) * (1 + index * 0.12);
        const height = options.scale * (options.stretched ? 0.62 : 0.86) * (1 + index * 0.08);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
        mesh.position.z = (index - (options.layers - 1) / 2) * 4.6;
        group.add(mesh);
        layers.push({ mesh, material });
    }
    return { group, layers };
}

function getSoftParticleTexture(THREE) {
    if (getSoftParticleTexture.cache) return getSoftParticleTexture.cache;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.46, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.74, "rgba(255,255,255,0.22)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getSoftParticleTexture.cache = texture;
    return texture;
}

function getGlowTexture(THREE, colors) {
    const key = colors.join("|");
    if (!getGlowTexture.cache) getGlowTexture.cache = new Map();
    if (getGlowTexture.cache.has(key)) return getGlowTexture.cache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.42, colors[1]);
    gradient.addColorStop(1, colors[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    getGlowTexture.cache.set(key, texture);
    return texture;
}

function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function gaussianRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
