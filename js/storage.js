const STORAGE_KEY = "stellar-atlas-universe-v7";

export function loadUniverseState(createUniverse) {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const fresh = createUniverse();
            saveUniverseState(fresh);
            return fresh;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.planets) || !Array.isArray(parsed.hyperlanes)) {
            throw new Error("invalid-state");
        }
        return parsed;
    } catch (error) {
        const fresh = createUniverse();
        saveUniverseState(fresh);
        return fresh;
    }
}

export function saveUniverseState(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetUniverseState(createUniverse) {
    const fresh = createUniverse();
    saveUniverseState(fresh);
    return fresh;
}
