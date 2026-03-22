export class UniverseRenderer {
    constructor(host, handlers) {
        this.host = host;
        this.handlers = handlers;
        this.state = null;
        this.camera = {
            yaw: 0.8,
            pitch: 0.28,
            distance: 72,
            target: { x: 0, y: 0, z: 0 },
            focus: { x: 0, y: 0, z: 0 }
        };
        this.pointer = { down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
        this.projectedPlanets = [];
        this.stars = createStars(6200);
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.host.appendChild(this.canvas);
        this.bind();
        this.resize();
    }

    bind() {
        window.addEventListener("resize", () => this.resize());
        this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
        this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
        this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
        this.canvas.addEventListener("pointerleave", (event) => this.onPointerUp(event));
        this.canvas.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    }

    setState(state) {
        this.state = state;
        const selected = state.planets.find((planet) => planet.id === state.selectedPlanetId);
        if (selected) {
            this.camera.focus = scaleVector(toVector(selected.position), 0.16);
        }
    }

    resize() {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = this.host.clientWidth || 1280;
        const height = this.host.clientHeight || 760;
        this.canvas.width = Math.floor(width * ratio);
        this.canvas.height = Math.floor(height * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    tick(delta) {
        this.camera.target = lerpVector(this.camera.target, this.camera.focus, Math.min(0.1, delta * 4));
    }

    render(time) {
        if (!this.state) return;

        const width = this.canvas.clientWidth || this.host.clientWidth || 1280;
        const height = this.canvas.clientHeight || this.host.clientHeight || 760;
        this.ctx.clearRect(0, 0, width, height);

        const view = createViewBasis(this.camera);
        this.projectedPlanets.length = 0;

        drawBackdrop(this.ctx, width, height);
        drawStarfield(this.ctx, width, height, view, this.stars, time);
        drawHyperlanes(this.ctx, width, height, view, this.state);
        const battleEffects = drawFleetTraffic(this.ctx, width, height, view, this.state, time);
        drawPlanets(this.ctx, width, height, view, this.state, time, this.projectedPlanets, this.handlers.hoverPlanetId);
        drawBattleEffects(this.ctx, width, height, view, battleEffects, time);
    }

    onPointerDown(event) {
        this.pointer.down = true;
        this.pointer.moved = false;
        this.pointer.startX = this.pointer.lastX = event.clientX;
        this.pointer.startY = this.pointer.lastY = event.clientY;
        this.canvas.classList.add("is-dragging");
        this.canvas.setPointerCapture(event.pointerId);
    }

    onPointerMove(event) {
        if (!this.state) return;

        const bounds = this.canvas.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        this.handlers.setHoverPlanetId(findPlanetAtPoint(this.projectedPlanets, x, y));

        if (!this.pointer.down) return;

        const deltaX = event.clientX - this.pointer.lastX;
        const deltaY = event.clientY - this.pointer.lastY;
        this.pointer.lastX = event.clientX;
        this.pointer.lastY = event.clientY;

        if (Math.abs(event.clientX - this.pointer.startX) > 4 || Math.abs(event.clientY - this.pointer.startY) > 4) {
            this.pointer.moved = true;
        }

        this.camera.yaw -= deltaX * 0.008;
        this.camera.pitch = clamp(this.camera.pitch + deltaY * 0.006, -1.2, 1.2);
    }

    onPointerUp(event) {
        if (this.pointer.down && !this.pointer.moved) {
            const bounds = this.canvas.getBoundingClientRect();
            const picked = findPlanetAtPoint(this.projectedPlanets, event.clientX - bounds.left, event.clientY - bounds.top);
            if (picked) {
                this.handlers.selectPlanet(picked);
            }
        }

        this.pointer.down = false;
        this.pointer.moved = false;
        this.canvas.classList.remove("is-dragging");

        if (event.pointerId !== undefined) {
            try {
                this.canvas.releasePointerCapture(event.pointerId);
            } catch (error) {
                // ignore
            }
        }
    }

    onWheel(event) {
        event.preventDefault();
        this.camera.distance = clamp(this.camera.distance + event.deltaY * 0.08, 12, 260);
    }
}

function drawBackdrop(ctx, width, height) {
    const base = ctx.createRadialGradient(width * 0.48, height * 0.46, 40, width * 0.5, height * 0.5, width * 0.96);
    base.addColorStop(0, "rgba(8, 14, 28, 0.99)");
    base.addColorStop(0.34, "rgba(4, 8, 16, 0.995)");
    base.addColorStop(1, "rgba(1, 2, 6, 1)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const haze = ctx.createRadialGradient(width * 0.56, height * 0.28, 0, width * 0.56, height * 0.28, width * 0.38);
    haze.addColorStop(0, "rgba(58, 84, 136, 0.06)");
    haze.addColorStop(0.36, "rgba(29, 44, 86, 0.03)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.15, width * 0.5, height * 0.5, width * 0.78);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.44)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

function drawStarfield(ctx, width, height, view, stars, time) {
    stars.forEach((star) => {
        const projected = projectPoint(star.position, width, height, view);
        if (!projected.visible) return;

        const twinkle = 0.84 + Math.sin(time * star.speed + star.phase) * 0.18;
        const depthAlpha = clamp((projected.depth - 18) / 240, 0.18, 1);
        const alpha = clamp(star.alpha * depthAlpha * twinkle, 0.16, 1);
        const radius = clamp(star.size * projected.scale * 10.2, 0.48, 2.9);

        if (radius > 1.2) {
            const glow = ctx.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius * 2.6);
            glow.addColorStop(0, `rgba(${star.rgb.join(", ")}, ${alpha * 0.22})`);
            glow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y, radius * 2.6, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = `rgba(${star.rgb.join(", ")}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawHyperlanes(ctx, width, height, view, state) {
    state.hyperlanes.forEach(([fromId, toId], index) => {
        const from = state.planets.find((planet) => planet.id === fromId);
        const to = state.planets.find((planet) => planet.id === toId);
        if (!from || !to) return;

        const a = projectPoint(toVector(from.position), width, height, view);
        const b = projectPoint(toVector(to.position), width, height, view);
        if (!a.visible || !b.visible) return;

        const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        gradient.addColorStop(0, "rgba(96, 181, 255, 0.18)");
        gradient.addColorStop(0.5, `rgba(137, 210, 255, ${0.52 + (index % 2) * 0.08})`);
        gradient.addColorStop(1, "rgba(96, 181, 255, 0.18)");

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.9 + (index % 3) * 0.22;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    });
}

function drawFleetTraffic(ctx, width, height, view, state, time) {
    const missions = buildFleetMissions(state, time)
        .map((mission) => projectFleetMission(mission, width, height, view))
        .filter(Boolean)
        .sort((left, right) => right.projected.depth - left.projected.depth);

    const battleEffects = [];

    missions.forEach((mission) => {
        drawFleetCluster(ctx, mission, view, width, height, time);
        if (mission.effect) {
            battleEffects.push(mission.effect);
        }
    });

    return battleEffects;
}

function buildFleetMissions(state, time) {
    const planetsById = new Map(state.planets.map((planet) => [planet.id, planet]));

    return state.planets.flatMap((planet, index) => {
        const action = planet.currentAction ?? {};
        const seed = hashString(`${planet.id}:${action.key ?? "idle"}`);
        const target = action.targetId ? planetsById.get(action.targetId) : null;

        if (target) {
            return [createTravelMission(planet, target, action, time, seed, index)];
        }

        if (["fortify", "research", "festival", "reform"].includes(action.key)) {
            return [createPatrolMission(planet, action, time, seed)];
        }

        return [];
    });
}

function createTravelMission(source, target, action, time, seed, index) {
    const from = toVector(source.position);
    const to = toVector(target.position);
    const speed = action.category === "war" ? 0.1 : action.category === "trade" ? 0.06 : 0.075;
    const rawPhase = fract(time * speed + (seed % 1000) * 0.001 + index * 0.031);
    const travel = resolveMissionTravel(source, target, action, rawPhase, time, seed);
    const frame = createFormationFrame(travel.direction, seed);

    return {
        kind: "travel",
        source,
        target,
        action,
        seed,
        center: travel.center,
        direction: travel.direction,
        frame,
        shipCount: getShipCount(action),
        spacing: clamp(source.radius * 0.56, 0.34, 0.72),
        hidden: travel.hidden,
        effect: getMissionEffect(action, source, target, travel.center, travel.warAnchor, seed)
    };
}

function createPatrolMission(source, action, time, seed) {
    const center = toVector(source.position);
    const orbitFrame = getOrbitalFrame(seed + 71);
    const orbitRadius = source.radius * 3.1;
    const angle = time * 0.22 + (seed % 360) * 0.01;
    const patrolCenter = add(
        center,
        add(
            scaleVector(orbitFrame.tangent, Math.cos(angle) * orbitRadius),
            scaleVector(orbitFrame.bitangent, Math.sin(angle) * orbitRadius * 0.66)
        )
    );

    return {
        kind: "patrol",
        source,
        target: null,
        action,
        seed,
        center: patrolCenter,
        direction: normalize(subtract(patrolCenter, center)),
        frame: createFormationFrame(normalize(subtract(patrolCenter, center)), seed),
        shipCount: getShipCount(action),
        spacing: clamp(source.radius * 0.52, 0.32, 0.64),
        hidden: false,
        effect: null
    };
}

function projectFleetMission(mission, width, height, view) {
    if (mission.hidden) return null;

    const projected = projectPoint(mission.center, width, height, view);
    if (!projected.visible) return null;

    const sourceProjected = projectPoint(toVector(mission.source.position), width, height, view);
    const targetProjected = mission.target ? projectPoint(toVector(mission.target.position), width, height, view) : null;
    const angle = targetProjected?.visible
        ? Math.atan2(targetProjected.y - projected.y, targetProjected.x - projected.x)
        : sourceProjected?.visible
            ? Math.atan2(projected.y - sourceProjected.y, projected.x - sourceProjected.x)
            : 0;

    return {
        ...mission,
        projected,
        sourceProjected,
        targetProjected,
        angle,
        size: clamp(projected.scale * (mission.source.radius * 6.8), 2.2, 5.8)
    };
}

function drawFleetCluster(ctx, mission, view, width, height, time) {
    const baseColor = mission.action.category === "war" ? lightenHex(mission.source.accent, 10) : mission.source.accent;
    const shipShape = mission.source.fleetShape ?? "rect";
    const alpha = mission.action.category === "war" ? 0.95 : mission.action.category === "covert" ? 0.56 : 0.82;
    const clusterGlow = ctx.createRadialGradient(
        mission.projected.x,
        mission.projected.y,
        0,
        mission.projected.x,
        mission.projected.y,
        mission.size * 6.4
    );
    clusterGlow.addColorStop(0, hexToRgba(mission.source.accent, mission.action.category === "war" ? 0.16 : 0.08));
    clusterGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = clusterGlow;
    ctx.beginPath();
    ctx.arc(mission.projected.x, mission.projected.y, mission.size * 6.4, 0, Math.PI * 2);
    ctx.fill();

    if (mission.targetProjected?.visible) {
        ctx.strokeStyle = hexToRgba(mission.source.accent, mission.action.category === "war" ? 0.26 : 0.12);
        ctx.lineWidth = mission.action.category === "war" ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(mission.projected.x, mission.projected.y);
        ctx.lineTo(mission.targetProjected.x, mission.targetProjected.y);
        ctx.stroke();
    }

    const ships = buildProjectedFleetShips(mission, view, width, height, time)
        .sort((left, right) => right.projected.depth - left.projected.depth);

    ships.forEach((ship) => {
        ctx.strokeStyle = hexToRgba(baseColor, alpha * 0.24);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(ship.tail.x, ship.tail.y);
        ctx.lineTo(ship.projected.x, ship.projected.y);
        ctx.stroke();

        drawShipShape(ctx, shipShape, ship, baseColor, alpha);
    });
}

function drawBattleEffects(ctx, width, height, view, effects, time) {
    effects.forEach((effect, index) => {
        const targetProjected = projectPoint(effect.target, width, height, view);
        if (!targetProjected.visible) return;

        if (effect.type === "battle") {
            const sourceProjected = projectPoint(effect.source, width, height, view);
            if (sourceProjected.visible) {
                ctx.strokeStyle = hexToRgba(effect.color, 0.42);
                ctx.lineWidth = 1.4;
                for (let streak = 0; streak < 6; streak += 1) {
                    const sweep = fract(time * 1.4 + effect.seed * 0.0008 + streak * 0.21);
                    const impact = {
                        x: targetProjected.x + Math.sin(effect.seed * 0.01 + streak) * targetProjected.scale * 42,
                        y: targetProjected.y + Math.cos(effect.seed * 0.013 + streak * 1.2) * targetProjected.scale * 34
                    };
                    const sx = lerp(sourceProjected.x, impact.x, sweep * 0.92);
                    const sy = lerp(sourceProjected.y, impact.y, sweep * 0.92);
                    ctx.beginPath();
                    ctx.moveTo(sourceProjected.x, sourceProjected.y);
                    ctx.lineTo(sx, sy);
                    ctx.stroke();
                }
            }

            for (let burst = 0; burst < 7; burst += 1) {
                const phase = fract(time * 0.72 + effect.seed * 0.002 + burst * 0.19 + index * 0.07);
                const radius = (7 + phase * 16) * targetProjected.scale * 4;
                const offsetX = Math.sin(effect.seed * 0.02 + burst * 1.3) * targetProjected.scale * 24;
                const offsetY = Math.cos(effect.seed * 0.016 + burst * 1.7) * targetProjected.scale * 20;
                const glow = ctx.createRadialGradient(
                    targetProjected.x + offsetX,
                    targetProjected.y + offsetY,
                    0,
                    targetProjected.x + offsetX,
                    targetProjected.y + offsetY,
                    radius
                );
                glow.addColorStop(0, `rgba(255, 246, 214, ${(1 - phase) * 0.46})`);
                glow.addColorStop(0.3, `rgba(255, 186, 110, ${(1 - phase) * 0.36})`);
                glow.addColorStop(0.55, `rgba(255, 96, 72, ${(1 - phase) * 0.3})`);
                glow.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(targetProjected.x + offsetX, targetProjected.y + offsetY, radius, 0, Math.PI * 2);
                ctx.fill();
            }

            for (let shock = 0; shock < 2; shock += 1) {
                const wave = fract(time * 0.45 + effect.seed * 0.001 + shock * 0.31);
                const shockRadius = (12 + wave * 24) * targetProjected.scale * 3;
                ctx.strokeStyle = `rgba(255, 214, 170, ${(1 - wave) * 0.28})`;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(targetProjected.x, targetProjected.y, shockRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        if (effect.type === "pressure") {
            ctx.strokeStyle = hexToRgba(effect.color, 0.28);
            ctx.lineWidth = 1.2;
            const ring = 12 + Math.sin(time * 2 + effect.seed * 0.001) * 2;
            ctx.beginPath();
            ctx.arc(targetProjected.x, targetProjected.y, ring * clamp(targetProjected.scale * 5, 0.8, 1.8), 0, Math.PI * 2);
            ctx.stroke();
        }
    });
}

function getMissionEffect(action, source, target, center, warAnchor, seed) {
    if (action.key === "invasion") {
        return {
            type: "battle",
            source: warAnchor,
            target: toVector(target.position),
            color: source.accent,
            seed
        };
    }

    if (action.key === "mobilize" || ["pressure", "covert"].includes(action.category)) {
        return {
            type: "pressure",
            source: center,
            target: toVector(target.position),
            color: source.accent,
            seed
        };
    }

    return null;
}

function getShipCount(action) {
    if (action.category === "war") return 7;
    if (action.category === "trade") return 5;
    if (action.category === "diplomacy") return 4;
    if (action.category === "covert") return 4;
    return 5;
}

function createFormationFrame(direction, seed) {
    const helper = Math.abs(direction.y) > 0.84 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const tangent = normalize(cross(helper, direction));
    const bitangent = normalize(cross(direction, tangent));
    const roll = (seed % 360) * (Math.PI / 180);
    const rolledTangent = add(scaleVector(tangent, Math.cos(roll)), scaleVector(bitangent, Math.sin(roll)));
    const rolledBitangent = add(scaleVector(tangent, -Math.sin(roll)), scaleVector(bitangent, Math.cos(roll)));
    return { tangent: normalize(rolledTangent), bitangent: normalize(rolledBitangent) };
}

function getFormationOffsets(count, seed) {
    return Array.from({ length: count }, (_, index) => {
        const columns = count <= 4 ? 2 : 3;
        const rank = Math.floor(index / columns);
        const column = (index % columns) - (columns - 1) / 2;
        const jitterX = Math.sin(seed * 0.01 + index * 0.7) * 0.12;
        const jitterY = Math.cos(seed * 0.015 + index * 0.9) * 0.12;
        return {
            x: column * 1.08 - rank * 0.2 + jitterX,
            y: (rank - 0.5) * 0.74 + jitterY,
            z: -rank * 0.54 + Math.sin(seed * 0.02 + index) * 0.18
        };
    });
}

function drawShipShape(ctx, shape, ship, color, alpha) {
    const { projected, tail, hull, size } = ship;
    ctx.save();
    ctx.translate(projected.x, projected.y);
    hull.faces.forEach((face) => {
        fillPolygon(ctx, face.points, colorWithAlpha(tintColor(color, face.shade), alpha * face.alpha));
        ctx.strokeStyle = colorWithAlpha(tintColor(color, face.shade + 8), Math.min(alpha * 0.72, 1));
        ctx.beginPath();
        ctx.moveTo(face.points[0].x - projected.x, face.points[0].y - projected.y);
        for (let index = 1; index < face.points.length; index += 1) {
            ctx.lineTo(face.points[index].x - projected.x, face.points[index].y - projected.y);
        }
        ctx.closePath();
        ctx.stroke();
    });

    if (hull.canopy) {
        fillPolygon(
            ctx,
            hull.canopy.map((point) => ({ x: point.x - projected.x, y: point.y - projected.y })),
            colorWithAlpha("rgb(255,255,255)", alpha * 0.16)
        );
    }

    const localTail = { x: tail.x - projected.x, y: tail.y - projected.y };
    const engine = ctx.createRadialGradient(localTail.x, localTail.y, 0, localTail.x, localTail.y, size * 1.2);
    engine.addColorStop(0, "rgba(182, 226, 255, 0.58)");
    engine.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = engine;
    ctx.beginPath();
    ctx.arc(localTail.x, localTail.y, size * 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function fillPolygon(ctx, points, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
    ctx.fill();
}

function buildProjectedFleetShips(mission, view, width, height, time) {
    const formation = getFormationOffsets(mission.shipCount, mission.seed);
    return formation
        .map((offset, index) => {
            const wobble = Math.sin(time * 1.8 + mission.seed * 0.001 + index * 0.7) * 0.08;
            const center = add(
                mission.center,
                add(
                    scaleVector(mission.frame.tangent, (offset.x + wobble) * mission.spacing),
                    add(
                        scaleVector(mission.frame.bitangent, offset.y * mission.spacing),
                        scaleVector(mission.direction, offset.z * mission.spacing)
                    )
                )
            );
            const hull = projectShipHull(
                mission.source.fleetShape ?? "rect",
                center,
                mission.direction,
                mission.frame.tangent,
                mission.frame.bitangent,
                mission.spacing,
                width,
                height,
                view
            );
            if (!hull) return null;
            return {
                projected: hull.center,
                tail: hull.tail,
                hull,
                size: clamp(hull.center.scale * (mission.source.radius * 5.1), 1.8, 6.4)
            };
        })
        .filter(Boolean);
}

function projectShipHull(shape, center, forward, right, up, scale, width, height, view) {
    const definition = getShipHullDefinition(shape);
    const vertices = {};

    Object.entries(definition.vertices).forEach(([key, local]) => {
        vertices[key] = add(
            center,
            add(
                scaleVector(forward, local.x * scale),
                add(scaleVector(right, local.y * scale), scaleVector(up, local.z * scale))
            )
        );
    });

    const projectedCenter = projectPoint(center, width, height, view);
    const projectedTail = projectPoint(vertices.tail, width, height, view);
    if (!projectedCenter.visible || !projectedTail.visible) return null;

    const faces = definition.faces
        .map((face) => {
            const worldPoints = face.keys.map((key) => vertices[key]);
            const faceCenter = averageVector(worldPoints);
            const normal = normalize(cross(subtract(worldPoints[1], worldPoints[0]), subtract(worldPoints[2], worldPoints[0])));
            const toCamera = subtract(view.cameraPosition, faceCenter);
            if (dot(normal, toCamera) <= 0.0001) return null;

            const points = worldPoints.map((point) => projectPoint(point, width, height, view));
            if (points.some((point) => !point.visible)) return null;

            return {
                points,
                shade: face.shade,
                alpha: face.alpha,
                depth: average(points.map((point) => point.depth))
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.depth - left.depth);

    if (!faces.length) return null;

    const canopy = definition.canopy
        ? definition.canopy
            .map((key) => projectPoint(vertices[key], width, height, view))
            .filter((point) => point.visible)
        : null;

    return {
        center: projectedCenter,
        tail: projectedTail,
        faces,
        canopy
    };
}

function getShipHullDefinition(shape) {
    if (shape === "cone") {
        return {
            vertices: {
                nose: { x: 1.7, y: 0, z: 0 },
                tail: { x: -0.95, y: 0, z: 0 },
                left: { x: -0.3, y: -0.82, z: 0 },
                right: { x: -0.3, y: 0.82, z: 0 },
                top: { x: -0.12, y: 0, z: 0.46 },
                bottom: { x: -0.1, y: 0, z: -0.3 }
            },
            faces: [
                { keys: ["top", "nose", "right"], shade: 18, alpha: 0.94 },
                { keys: ["top", "left", "nose"], shade: 6, alpha: 0.88 },
                { keys: ["bottom", "right", "nose"], shade: -8, alpha: 0.78 },
                { keys: ["bottom", "nose", "left"], shade: -14, alpha: 0.72 },
                { keys: ["top", "right", "tail", "left"], shade: 2, alpha: 0.76 },
                { keys: ["bottom", "left", "tail", "right"], shade: -20, alpha: 0.66 }
            ],
            canopy: ["nose", "top", "right"]
        };
    }

    if (shape === "ellipse") {
        return {
            vertices: {
                nose: { x: 1.45, y: 0, z: 0 },
                tail: { x: -1.2, y: 0, z: 0 },
                left: { x: 0, y: -0.92, z: 0 },
                right: { x: 0, y: 0.92, z: 0 },
                top: { x: 0, y: 0, z: 0.5 },
                bottom: { x: 0, y: 0, z: -0.36 }
            },
            faces: [
                { keys: ["top", "nose", "right"], shade: 16, alpha: 0.9 },
                { keys: ["top", "right", "tail"], shade: 10, alpha: 0.84 },
                { keys: ["top", "tail", "left"], shade: 2, alpha: 0.82 },
                { keys: ["top", "left", "nose"], shade: 8, alpha: 0.86 },
                { keys: ["bottom", "right", "nose"], shade: -8, alpha: 0.74 },
                { keys: ["bottom", "tail", "right"], shade: -14, alpha: 0.7 },
                { keys: ["bottom", "left", "tail"], shade: -18, alpha: 0.66 },
                { keys: ["bottom", "nose", "left"], shade: -10, alpha: 0.72 }
            ],
            canopy: ["nose", "top", "right", "left"]
        };
    }

    return {
        vertices: {
            nftl: { x: 1.1, y: -0.66, z: 0.34 },
            nftr: { x: 1.1, y: 0.66, z: 0.34 },
            nfbl: { x: 1.1, y: -0.66, z: -0.22 },
            nfbr: { x: 1.1, y: 0.66, z: -0.22 },
            rntl: { x: -1.0, y: -0.72, z: 0.3 },
            rntr: { x: -1.0, y: 0.72, z: 0.3 },
            rnbl: { x: -1.0, y: -0.72, z: -0.26 },
            rnbr: { x: -1.0, y: 0.72, z: -0.26 },
            tail: { x: -1.0, y: 0, z: 0 }
        },
        faces: [
            { keys: ["nftl", "nftr", "rntr", "rntl"], shade: 16, alpha: 0.9 },
            { keys: ["nftr", "nfbr", "rnbr", "rntr"], shade: 8, alpha: 0.84 },
            { keys: ["nfbl", "nfbr", "rnbr", "rnbl"], shade: -12, alpha: 0.72 },
            { keys: ["nftl", "rntl", "rnbl", "nfbl"], shade: 0, alpha: 0.82 },
            { keys: ["nftl", "nfbl", "nfbr", "nftr"], shade: 10, alpha: 0.86 },
            { keys: ["rntl", "rntr", "rnbr", "rnbl"], shade: -20, alpha: 0.68 }
        ],
        canopy: ["nftl", "nftr", "rntr", "rntl"]
    };
}

function resolveMissionTravel(source, target, action, rawPhase, time, seed) {
    const sourcePoint = toVector(source.position);
    const targetPoint = toVector(target.position);
    const baseDirection = normalize(subtract(targetPoint, sourcePoint));
    const battleFrame = createFormationFrame(baseDirection, seed + 97);
    const stagingDistance = target.radius * 3.8 + 1.6;
    const warAnchor = add(
        targetPoint,
        add(
            scaleVector(baseDirection, -stagingDistance),
            scaleVector(battleFrame.bitangent, Math.sin(time * 0.9 + seed * 0.01) * (target.radius * 1.2 + 0.4))
        )
    );

    if (action.key === "invasion") {
        return {
            center: warAnchor,
            direction: baseDirection,
            hidden: false,
            warAnchor
        };
    }

    if (action.key === "mobilize") {
        return {
            center: lerpVector(sourcePoint, warAnchor, 0.26 + rawPhase * 0.24),
            direction: baseDirection,
            hidden: false,
            warAnchor
        };
    }

    if (action.category === "trade") {
        const stage = resolveTradeStage(rawPhase);
        const from = stage.forward ? sourcePoint : targetPoint;
        const to = stage.forward ? targetPoint : sourcePoint;
        const direction = normalize(subtract(to, from));
        return {
            center: stage.hidden ? to : lerpVector(from, to, stage.progress),
            direction,
            hidden: stage.hidden,
            warAnchor
        };
    }

    const direction = baseDirection;
    const progress = ["diplomacy", "covert"].includes(action.category)
        ? pingPong(rawPhase)
        : rawPhase;
    return {
        center: lerpVector(sourcePoint, targetPoint, 0.12 + progress * 0.76),
        direction,
        hidden: false,
        warAnchor
    };
}

function resolveTradeStage(rawPhase) {
    if (rawPhase < 0.42) {
        return { forward: true, hidden: false, progress: rawPhase / 0.42 };
    }
    if (rawPhase < 0.5) {
        return { forward: true, hidden: true, progress: 1 };
    }
    if (rawPhase < 0.92) {
        return { forward: false, hidden: false, progress: (rawPhase - 0.5) / 0.42 };
    }
    return { forward: false, hidden: true, progress: 1 };
}

function drawPlanets(ctx, width, height, view, state, time, projectedPlanets, hoverPlanetId) {
    const items = state.planets
        .map((planet, index) => {
            const world = {
                x: planet.position[0],
                y: planet.position[1] + Math.sin(time * 0.38 + index * 1.4) * 0.08,
                z: planet.position[2]
            };
            const projected = projectPoint(world, width, height, view);
            const size = projected.scale * planet.radius * 40;
            return {
                planet,
                projected,
                world,
                size,
                seed: hashString(planet.id),
                time
            };
        })
        .filter((item) => item.projected.visible && item.size > 1.2)
        .sort((left, right) => right.projected.depth - left.projected.depth);

    items.forEach((item) => {
        const isSelected = item.planet.id === state.selectedPlanetId;
        const isHovered = item.planet.id === hoverPlanetId;
        drawPlanet(ctx, item, view, width, height, isSelected, isHovered);
        projectedPlanets.push({
            id: item.planet.id,
            x: item.projected.x,
            y: item.projected.y,
            radius: Math.max(item.size, 12),
            depth: item.projected.depth
        });
    });
}

function drawPlanet(ctx, item, view, width, height, isSelected, isHovered) {
    const { planet, projected, size, seed, time, world } = item;
    const x = projected.x;
    const y = projected.y;
    const orbitalFrame = getOrbitalFrame(seed);
    const ringPaths = planet.ring ? buildRingPaths(world, planet.radius, orbitalFrame, view, width, height, projected.depth, projected.scale) : null;
    const moons = getMoonInstances(planet, world, time, seed, orbitalFrame, view, width, height, projected.depth);

    ctx.save();

    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.4);
    glow.addColorStop(0, hexToRgba(planet.color, isSelected ? 0.46 : 0.24));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
    ctx.fill();

    if (ringPaths) {
        drawRingBase(ctx, ringPaths.outer, ringPaths.inner, planet, isSelected);
    }

    drawMoonsBehind(ctx, moons, planet);

    const body = ctx.createRadialGradient(x - size * 0.34, y - size * 0.42, size * 0.1, x + size * 0.2, y + size * 0.24, size * 1.18);
    body.addColorStop(0, lightenHex(planet.accent, 20));
    body.addColorStop(0.34, lightenHex(planet.color, 12));
    body.addColorStop(0.75, planet.color);
    body.addColorStop(1, darkenHex(planet.color, 60));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.clip();
    drawSurface(ctx, planet, x, y, size, time, seed);
    drawTerminator(ctx, x, y, size);
    ctx.restore();

    drawAtmosphere(ctx, planet, x, y, size);

    if (ringPaths) {
        drawRingOverlay(ctx, ringPaths.frontOuter, ringPaths.frontInner, planet, x, y, size, isSelected);
    }

    drawMoonsFront(ctx, moons, planet);

    if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? "rgba(255, 226, 173, 0.95)" : "rgba(255, 255, 255, 0.76)";
        ctx.lineWidth = isSelected ? 2.2 : 1.4;
        ctx.beginPath();
        ctx.arc(x, y, size + 5, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (isSelected) {
        ctx.strokeStyle = "rgba(126, 182, 255, 0.56)";
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.arc(x, y, size + 10, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawSurface(ctx, planet, x, y, size, time, seed) {
    const spin = time * 0.12 + (seed % 360) * 0.01;

    ctx.save();
    ctx.translate(x, y);

    switch (planet.kind) {
        case "oceanic":
            drawSphereBands(ctx, size, ["rgba(55, 111, 214, 0.36)", "rgba(56, 184, 208, 0.22)", "rgba(223, 247, 255, 0.1)"], 6, spin);
            drawSphereBlobs(ctx, size, "rgba(155, 255, 218, 0.16)", 5, spin, seed);
            break;
        case "desert":
            drawSphereBands(ctx, size, ["rgba(160, 91, 35, 0.28)", "rgba(255, 213, 143, 0.16)", "rgba(206, 126, 73, 0.15)"], 5, spin * 0.7);
            drawSphereBlobs(ctx, size, "rgba(123, 66, 22, 0.16)", 4, spin * 0.85, seed + 11);
            break;
        case "gas":
            drawSphereBands(ctx, size, ["rgba(244,223,146,0.26)", "rgba(208,157,89,0.28)", "rgba(255,244,205,0.12)"], 8, spin * 0.35);
            break;
        case "frozen":
            drawSphereBands(ctx, size, ["rgba(255,255,255,0.12)", "rgba(177,212,255,0.14)", "rgba(122,149,226,0.14)"], 5, spin * 0.45);
            drawSphereRifts(ctx, size, "rgba(255,255,255,0.12)", 4, seed);
            break;
        case "twilight":
            drawHemisphereSplit(ctx, size, "rgba(255, 244, 168, 0.22)", "rgba(78, 44, 134, 0.18)", spin);
            break;
        case "jungle":
            drawSphereBlobs(ctx, size, "rgba(34, 110, 56, 0.26)", 6, spin * 0.75, seed);
            drawSphereBlobs(ctx, size, "rgba(184, 255, 162, 0.08)", 3, spin * 0.4, seed + 19);
            break;
        case "volcanic":
            drawSphereRifts(ctx, size, "rgba(255, 171, 74, 0.22)", 5, seed);
            drawSphereBlobs(ctx, size, "rgba(52, 18, 12, 0.18)", 3, spin * 0.3, seed + 29);
            break;
        case "crystal":
            drawSphereFacets(ctx, size, "rgba(255,255,255,0.11)", 6, seed);
            drawSphereFacets(ctx, size, "rgba(111,239,255,0.09)", 4, seed + 17);
            break;
        case "storm":
            drawSphereSwirls(ctx, size, "rgba(255,255,255,0.12)", 3, spin, seed);
            break;
        case "machine":
            drawSphereBands(ctx, size, ["rgba(191, 205, 236, 0.16)", "rgba(104, 124, 169, 0.2)"], 5, spin * 0.25);
            drawSphereFacets(ctx, size, "rgba(219,230,255,0.08)", 5, seed);
            break;
        case "toxic":
            drawSphereBands(ctx, size, ["rgba(153,205,73,0.22)", "rgba(78,123,35,0.24)", "rgba(225,255,163,0.08)"], 6, spin * 0.6);
            drawSphereBlobs(ctx, size, "rgba(210,255,121,0.12)", 5, spin * 0.65, seed);
            break;
        case "aurora":
            drawSphereBands(ctx, size, ["rgba(88,233,255,0.16)", "rgba(113,255,205,0.16)", "rgba(239,255,255,0.08)"], 5, spin * 0.4);
            drawSphereSwirls(ctx, size, "rgba(214,255,255,0.12)", 4, spin * 0.9, seed);
            break;
        case "metallic":
            drawSphereBands(ctx, size, ["rgba(226,232,245,0.14)", "rgba(119,131,156,0.18)"], 6, spin * 0.2);
            drawSphereFacets(ctx, size, "rgba(255,255,255,0.12)", 7, seed);
            break;
        case "canyon":
            drawSphereBands(ctx, size, ["rgba(196,126,88,0.18)", "rgba(137,76,41,0.2)", "rgba(255,223,196,0.08)"], 5, spin * 0.45);
            drawSphereRifts(ctx, size, "rgba(92,43,18,0.16)", 5, seed);
            break;
        case "obsidian":
            drawSphereFacets(ctx, size, "rgba(212,202,255,0.12)", 6, seed);
            drawSphereBlobs(ctx, size, "rgba(57,35,88,0.18)", 3, spin * 0.2, seed + 31);
            break;
        case "reef":
            drawSphereBands(ctx, size, ["rgba(74,184,193,0.18)", "rgba(97,238,220,0.16)", "rgba(241,255,248,0.08)"], 6, spin * 0.55);
            drawSphereBlobs(ctx, size, "rgba(255,171,152,0.12)", 5, spin * 0.7, seed);
            break;
        case "ash":
            drawSphereBands(ctx, size, ["rgba(153,138,130,0.16)", "rgba(96,84,77,0.18)", "rgba(234,224,220,0.08)"], 6, spin * 0.28);
            drawSphereBlobs(ctx, size, "rgba(64,56,52,0.16)", 4, spin * 0.38, seed);
            break;
        case "tundra":
            drawSphereBands(ctx, size, ["rgba(198,223,244,0.12)", "rgba(132,165,204,0.14)", "rgba(255,255,255,0.1)"], 5, spin * 0.35);
            drawSphereRifts(ctx, size, "rgba(239,247,255,0.12)", 4, seed);
            break;
        default:
            drawSphereBands(ctx, size, ["rgba(255,255,255,0.12)", "rgba(0,0,0,0.12)"], 4, spin);
    }

    ctx.restore();
}

function drawSphereBands(ctx, size, colors, count, spin) {
    for (let index = 0; index < count; index += 1) {
        const lat = -0.8 + (index / Math.max(1, count - 1)) * 1.6;
        const y = lat * size * 0.72;
        const height = size * (0.1 + (index % 3) * 0.018);
        const stretch = 0.92 - Math.abs(lat) * 0.12;
        ctx.fillStyle = colors[index % colors.length];
        ctx.beginPath();
        ctx.ellipse(Math.sin(spin + index * 1.2) * size * 0.08, y, size * stretch, height, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSphereBlobs(ctx, size, color, count, spin, seed) {
    const seedBase = seed * 0.017;

    for (let index = 0; index < count; index += 1) {
        const longitude = spin + seedBase + index * 1.18;
        const latitude = Math.sin(seedBase * 1.6 + index * 1.1) * 0.62;
        const visibility = Math.cos(longitude);
        if (visibility <= -0.1) continue;

        const px = Math.sin(longitude) * size * 0.56;
        const py = latitude * size * 0.72;
        const squash = clamp(0.28 + visibility * 0.75, 0.16, 1);
        const alpha = clamp(0.08 + visibility * 0.12, 0.05, 0.24);

        ctx.fillStyle = rewriteAlpha(color, alpha);
        ctx.beginPath();
        ctx.ellipse(px, py, size * (0.2 + (index % 2) * 0.05) * squash, size * (0.11 + (index % 3) * 0.02), seedBase + index, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawSphereRifts(ctx, size, color, count, seed) {
    const seedBase = seed * 0.013;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.06);

    for (let index = 0; index < count; index += 1) {
        const longitude = seedBase + index * 0.95;
        const visibility = Math.cos(longitude);
        if (visibility <= 0) continue;

        const px = Math.sin(longitude) * size * 0.48;
        const py = Math.sin(seedBase * 1.8 + index) * size * 0.58;
        const squash = clamp(0.35 + visibility * 0.65, 0.2, 1);

        ctx.beginPath();
        ctx.moveTo(px - size * 0.18 * squash, py - size * 0.1);
        ctx.lineTo(px - size * 0.04 * squash, py - size * 0.02);
        ctx.lineTo(px + size * 0.08 * squash, py - size * 0.12);
        ctx.lineTo(px + size * 0.2 * squash, py);
        ctx.stroke();
    }
}

function drawSphereFacets(ctx, size, color, count, seed) {
    const seedBase = seed * 0.011;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let index = 0; index < count; index += 1) {
        const longitude = seedBase + index * (Math.PI * 0.42);
        const visibility = Math.cos(longitude);
        if (visibility <= -0.05) continue;

        const px = Math.sin(longitude) * size * 0.58;
        const py = Math.cos(seedBase + index * 1.2) * size * 0.5;
        const reach = size * (0.18 + (index % 2) * 0.05) * clamp(0.35 + visibility * 0.6, 0.2, 1);

        ctx.beginPath();
        ctx.moveTo(px - reach * 0.3, py - reach * 0.8);
        ctx.lineTo(px + reach * 0.75, py - reach * 0.18);
        ctx.lineTo(px + reach * 0.14, py + reach * 0.68);
        ctx.closePath();
        ctx.stroke();
    }
}

function drawSphereSwirls(ctx, size, color, count, spin, seed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const seedBase = seed * 0.019;

    for (let index = 0; index < count; index += 1) {
        const longitude = spin + seedBase + index * 1.3;
        const visibility = Math.cos(longitude);
        if (visibility <= -0.08) continue;

        const px = Math.sin(longitude) * size * 0.52;
        const py = Math.sin(seedBase * 0.7 + index * 0.9) * size * 0.24;
        const radius = size * (0.16 + index * 0.06) * clamp(0.34 + visibility * 0.58, 0.2, 1);

        ctx.beginPath();
        ctx.arc(px, py, radius, index * 0.5, index * 0.5 + Math.PI * 1.24);
        ctx.stroke();
    }
}

function drawHemisphereSplit(ctx, size, warmColor, coldColor, spin) {
    const split = Math.sin(spin) * size * 0.12;
    ctx.fillStyle = warmColor;
    ctx.beginPath();
    ctx.ellipse(-split, 0, size * 0.82, size * 0.98, 0, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();

    ctx.fillStyle = coldColor;
    ctx.beginPath();
    ctx.ellipse(split, 0, size * 0.82, size * 0.98, 0, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();
}

function drawTerminator(ctx, x, y, size) {
    const shadow = ctx.createRadialGradient(x + size * 0.24, y + size * 0.2, size * 0.08, x, y, size * 1.05);
    shadow.addColorStop(0, "rgba(0,0,0,0)");
    shadow.addColorStop(0.72, "rgba(0,0,0,0.08)");
    shadow.addColorStop(1, "rgba(0,0,0,0.46)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    const light = ctx.createRadialGradient(x - size * 0.52, y - size * 0.54, 0, x - size * 0.3, y - size * 0.32, size * 0.84);
    light.addColorStop(0, "rgba(255,255,255,0.18)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
}

function drawAtmosphere(ctx, planet, x, y, size) {
    const rim = ctx.createRadialGradient(x, y, size * 0.9, x, y, size * 1.18);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(0.78, hexToRgba(planet.accent, 0.05));
    rim.addColorStop(1, hexToRgba(planet.accent, 0.32));
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.2, size * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, size * 1.02, 0, Math.PI * 2);
    ctx.stroke();
}

function createViewBasis(camera) {
    const cameraPosition = {
        x: camera.target.x + camera.distance * Math.cos(camera.pitch) * Math.sin(camera.yaw),
        y: camera.target.y + camera.distance * Math.sin(camera.pitch),
        z: camera.target.z + camera.distance * Math.cos(camera.pitch) * Math.cos(camera.yaw)
    };
    const forward = normalize(subtract(camera.target, cameraPosition));
    const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
    const up = normalize(cross(right, forward));
    return { cameraPosition, forward, right, up };
}

function projectPoint(point, width, height, view) {
    const relative = subtract(point, view.cameraPosition);
    const camX = dot(relative, view.right);
    const camY = dot(relative, view.up);
    const camZ = dot(relative, view.forward);
    if (camZ <= 0.15) return { visible: false };
    const focal = width * 0.72;
    return {
        visible: true,
        x: width * 0.5 + (camX * focal) / camZ,
        y: height * 0.5 - (camY * focal) / camZ,
        depth: camZ,
        scale: focal / (camZ * 45)
    };
}

function findPlanetAtPoint(projectedPlanets, x, y) {
    const hits = projectedPlanets
        .filter((planet) => distanceBetween(x, y, planet.x, planet.y) <= planet.radius + 8)
        .sort((left, right) => left.depth - right.depth);
    return hits.length ? hits[0].id : null;
}

function createStars(count) {
    return Array.from({ length: count }, () => ({
        position: scaleVector(randomDirection(), 180 + Math.random() * 210),
        size: 0.65 + Math.random() * 2.1,
        alpha: 0.34 + Math.random() * 0.76,
        phase: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.8,
        rgb: pick([[236, 242, 255], [248, 248, 255], [255, 244, 234], [225, 236, 255], [245, 245, 248]])
    }));
}

function randomDirection() {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    return normalize({
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta)
    });
}

function getOrbitalFrame(seed) {
    const normal = normalize({
        x: Math.sin(seed * 0.013) * 0.74,
        y: 0.24 + Math.cos(seed * 0.017) * 0.62,
        z: Math.cos(seed * 0.011) * 0.74
    });
    const helper = Math.abs(normal.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const tangent = normalize(cross(helper, normal));
    const bitangent = normalize(cross(normal, tangent));
    return { normal, tangent, bitangent };
}

function buildRingPaths(center, radius, frame, view, width, height, centerDepth, centerScale) {
    const outerRadius = radius * 1.86;
    const innerRadius = radius * 1.34;
    return {
        outer: sampleRingSegments(center, outerRadius, frame, view, width, height, centerDepth, centerScale),
        inner: sampleRingSegments(center, innerRadius, frame, view, width, height, centerDepth, centerScale),
        frontOuter: sampleRingSegments(center, outerRadius, frame, view, width, height, centerDepth, centerScale, true),
        frontInner: sampleRingSegments(center, innerRadius, frame, view, width, height, centerDepth, centerScale, true)
    };
}

function sampleRingSegments(center, radius, frame, view, width, height, centerDepth, centerScale, frontOnly = false) {
    const segments = [];
    let current = [];

    for (let step = 0; step <= 96; step += 1) {
        const angle = (step / 96) * Math.PI * 2;
        const point = add(center, add(scaleVector(frame.tangent, Math.cos(angle) * radius), scaleVector(frame.bitangent, Math.sin(angle) * radius)));
        const projected = projectPoint(point, width, height, view);
        if (!projected.visible) {
            if (current.length > 1) {
                segments.push(current);
            }
            current = [];
            continue;
        }

        if (frontOnly && projected.depth >= centerDepth) {
            if (current.length > 1) {
                segments.push(current);
            }
            current = [];
            continue;
        }

        current.push({
            x: projected.x,
            y: projected.y,
            widthScale: clamp(projected.scale / centerScale, 0.7, 1.32)
        });
    }

    if (current.length > 1) {
        segments.push(current);
    }

    return segments;
}

function drawRingBase(ctx, outerSegments, innerSegments, planet, isSelected) {
    const outerAlpha = isSelected ? 0.82 : 0.68;
    const innerAlpha = isSelected ? 0.72 : 0.3;
    drawProjectedSegments(ctx, outerSegments, isSelected ? hexToRgba(planet.accent, outerAlpha) : `rgba(167, 212, 255, ${outerAlpha})`, isSelected ? 1.95 : 1.3);
    drawProjectedSegments(ctx, innerSegments, isSelected ? `rgba(255, 240, 204, ${innerAlpha})` : `rgba(255, 255, 255, ${innerAlpha})`, 0.78);
}

function drawRingOverlay(ctx, outerSegments, innerSegments, planet, x, y, size, isSelected) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size * 1.08, 0, Math.PI * 2);
    ctx.clip();

    drawProjectedSegments(ctx, outerSegments, isSelected ? hexToRgba(planet.accent, 0.94) : "rgba(176, 219, 255, 0.86)", isSelected ? 2.05 : 1.45);
    drawProjectedSegments(ctx, innerSegments, isSelected ? "rgba(255, 244, 214, 0.82)" : "rgba(255, 255, 255, 0.42)", 0.82);
    ctx.restore();
}

function drawProjectedSegments(ctx, segments, strokeStyle, baseWidth) {
    segments.forEach((segment) => {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = baseWidth * average(segment.map((point) => point.widthScale));
        ctx.beginPath();
        ctx.moveTo(segment[0].x, segment[0].y);
        for (let index = 1; index < segment.length; index += 1) {
            ctx.lineTo(segment[index].x, segment[index].y);
        }
        ctx.stroke();
    });
}

function getMoonInstances(planet, center, time, seed, frame, view, width, height, centerDepth) {
    if (!planet.moons) return [];

    return Array.from({ length: planet.moons }, (_, index) => {
        const phase = time * (0.32 + index * 0.06) + index * 1.7 + (seed % 97) * 0.03;
        const orbitRadius = planet.radius * (2.3 + index * 0.5);
        const point = add(
            center,
            add(
                scaleVector(frame.tangent, Math.cos(phase) * orbitRadius),
                scaleVector(frame.bitangent, Math.sin(phase) * orbitRadius)
            )
        );
        const projected = projectPoint(point, width, height, view);
        if (!projected.visible) return null;
        return {
            x: projected.x,
            y: projected.y,
            radius: Math.max(1.4, projected.scale * planet.radius * (4.6 - index * 0.38)),
            front: projected.depth < centerDepth,
            depth: projected.depth
        };
    }).filter(Boolean);
}

function drawMoonsBehind(ctx, moons, planet) {
    moons
        .filter((moon) => !moon.front)
        .sort((left, right) => right.depth - left.depth)
        .forEach((moon) => drawMoon(ctx, moon, planet, 1));
}

function drawMoonsFront(ctx, moons, planet) {
    moons
        .filter((moon) => moon.front)
        .sort((left, right) => right.depth - left.depth)
        .forEach((moon) => drawMoon(ctx, moon, planet, 1));
}

function drawMoon(ctx, moon, planet, visibility) {
    const moonX = moon.x;
    const moonY = moon.y;
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moon.radius * 3.2);
    moonGlow.addColorStop(0, hexToRgba(planet.accent, 0.3 * visibility));
    moonGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moon.radius * 3.2, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(moonX - moon.radius * 0.3, moonY - moon.radius * 0.3, moon.radius * 0.2, moonX, moonY, moon.radius * 1.08);
    body.addColorStop(0, lightenHex(planet.accent, 24));
    body.addColorStop(0.65, lightenHex(planet.color, 18));
    body.addColorStop(1, darkenHex(planet.color, 30));
    ctx.fillStyle = body;
    ctx.globalAlpha = visibility;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moon.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function rewriteAlpha(color, alpha) {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return color;

    const parts = match[1].split(",").map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function toVector(array) {
    return { x: array[0], y: array[1], z: array[2] };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVector(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function lerpVector(from, to, factor) {
    return {
        x: from.x + (to.x - from.x) * factor,
        y: from.y + (to.y - from.y) * factor,
        z: from.z + (to.z - from.z) * factor
    };
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function normalize(vector) {
    const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function distanceBetween(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function lerp(from, to, factor) {
    return from + (to - from) * factor;
}

function average(values) {
    return values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
}

function fract(value) {
    return value - Math.floor(value);
}

function pingPong(value) {
    return value < 0.5 ? value * 2 : (1 - value) * 2;
}

function rotatePoint(x, y, angle) {
    return {
        x: x * Math.cos(angle) - y * Math.sin(angle),
        y: x * Math.sin(angle) + y * Math.cos(angle)
    };
}

function normalize2(x, y, fallbackX, fallbackY) {
    const length = Math.hypot(x, y);
    const targetLength = Math.hypot(fallbackX, fallbackY) || 1;
    if (length <= 0.0001) {
        return { x: fallbackX, y: fallbackY };
    }
    return { x: (x / length) * targetLength, y: (y / length) * targetLength };
}

function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const bigint = parseInt(value, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenHex(hex, amount) {
    return shadeHex(hex, amount);
}

function darkenHex(hex, amount) {
    return shadeHex(hex, -amount);
}

function shadeHex(hex, amount) {
    const value = hex.replace("#", "");
    const bigint = parseInt(value, 16);
    const r = clamp(((bigint >> 16) & 255) + amount, 0, 255);
    const g = clamp(((bigint >> 8) & 255) + amount, 0, 255);
    const b = clamp((bigint & 255) + amount, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
}

function colorWithAlpha(color, alpha) {
    if (color.startsWith("#")) {
        return hexToRgba(color, alpha);
    }

    const match = color.match(/rgb\(([^)]+)\)/);
    if (match) {
        return `rgba(${match[1]}, ${alpha})`;
    }

    return color;
}

function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}
