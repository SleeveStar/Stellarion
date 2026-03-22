import { createRandomUniverse } from "./generator.js";
import { loadUniverseState, resetUniverseState, saveUniverseState } from "./storage.js";
import { advanceUniverse, updatePlanetPolicy, updatePlanetProfile } from "./ai.js";
import { UniverseRenderer } from "./renderer-three.js";
import { createUI } from "./ui.js";

if (typeof window !== "undefined") {
    bootstrap();
}

function bootstrap() {
    initBackgroundMusic();
    let state = loadUniverseState(createRandomUniverse);
    state.selectedPlanetId = null;
    state.detailPanelOpen = false;
    state.detailPanelOpen = Boolean(state.detailPanelOpen);
    state.searchPanelOpen = Boolean(state.searchPanelOpen);
    state.logPanelOpen = Boolean(state.logPanelOpen);
    let renderer;
    let hoverPlanetId = null;
    let lastTime = performance.now();
    let simulationAccumulator = 0;

    const ui = createUI({
        search(query) {
            state.searchQuery = query.trim();
            state.searchPanelOpen = true;
            state.logPanelOpen = false;
            render();
            saveUniverseState(state);
        },
        resetUniverse() {
            state = resetUniverseState(createRandomUniverse);
            state.detailPanelOpen = false;
            state.searchPanelOpen = false;
            state.logPanelOpen = false;
            hoverPlanetId = null;
            renderer.setState(state);
            renderer.focusCenter();
            render();
        },
        setSpeed(speed) {
            state.speed = speed;
            render();
            saveUniverseState(state);
        },
        selectPlanet(planetId) {
            state.selectedPlanetId = planetId;
            state.searchPanelOpen = false;
            renderer.setState(state);
            render();
            saveUniverseState(state);
        },
        toggleSearch() {
            state.searchPanelOpen = !state.searchPanelOpen;
            if (state.searchPanelOpen) {
                state.logPanelOpen = false;
            }
            render();
            saveUniverseState(state);
        },
        toggleLog() {
            state.logPanelOpen = !state.logPanelOpen;
            if (state.logPanelOpen) {
                state.searchPanelOpen = false;
            }
            render();
            saveUniverseState(state);
        },
        closeLog() {
            state.logPanelOpen = false;
            render();
            saveUniverseState(state);
        },
        focusCenter() {
            renderer?.focusCenter();
        },
        openDetail() {
            if (!state.selectedPlanetId) return;
            state.detailPanelOpen = true;
            render();
            saveUniverseState(state);
        },
        closeDetail() {
            state.detailPanelOpen = false;
            render();
            saveUniverseState(state);
        },
        updatePolicy(key, value) {
            if (!state.selectedPlanetId) return;
            updatePlanetPolicy(state, state.selectedPlanetId, key, value);
            render();
            saveUniverseState(state);
        },
        updateProfile(key, value) {
            if (!state.selectedPlanetId) return;
            updatePlanetProfile(state, state.selectedPlanetId, key, value);
            render();
            saveUniverseState(state);
        }
    });

    renderer = new UniverseRenderer(document.getElementById("universe-canvas"), {
        selectPlanet(planetId) {
            state.selectedPlanetId = planetId;
            state.searchPanelOpen = false;
            renderer.setState(state);
            render();
            saveUniverseState(state);
        },
        setHoverPlanetId(planetId) {
            hoverPlanetId = planetId;
        },
        get hoverPlanetId() {
            return hoverPlanetId;
        }
    });

    renderer.setState(state);
    renderer.focusCenter();
    render();
    requestAnimationFrame(loop);

    function loop(now) {
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        renderer.tick(delta);

        if (state.speed > 0) {
            simulationAccumulator += delta * state.speed;
            let stepped = false;
            while (simulationAccumulator >= 4.5) {
                advanceUniverse(state, 1);
                simulationAccumulator -= 4.5;
                stepped = true;
            }
            if (stepped) {
                render();
                saveUniverseState(state);
            }
        }

        renderer.render(now * 0.001);
        requestAnimationFrame(loop);
    }

    function render() {
        state.selectionMode = hoverPlanetId ? "행성 전술 관측" : "자율 전략 관측";
        ui.render(state);
    }
}

function initBackgroundMusic() {
    const audio = document.getElementById("bgm-player");
    if (!audio) return;

    audio.volume = 0.42;

    const tryPlay = () => {
        const playback = audio.play();
        if (playback && typeof playback.catch === "function") {
            playback.catch(() => {
                // Browser autoplay policy may require an explicit user interaction.
            });
        }
    };

    const unlockPlayback = () => {
        tryPlay();
        if (!audio.paused) {
            window.removeEventListener("pointerdown", unlockPlayback);
            window.removeEventListener("keydown", unlockPlayback);
            window.removeEventListener("touchstart", unlockPlayback);
        }
    };

    tryPlay();
    window.addEventListener("pointerdown", unlockPlayback, { passive: true });
    window.addEventListener("keydown", unlockPlayback, { passive: true });
    window.addEventListener("touchstart", unlockPlayback, { passive: true });
}
