import { POLICY_FIELDS, PROFILE_FIELDS } from "./ai.js";

export function createUI(handlers) {
    const dom = {
        stage: document.querySelector(".stage"),
        heroTitle: document.getElementById("hero-title"),
        heroSummary: document.getElementById("hero-summary"),
        planetName: document.getElementById("planet-name"),
        planetBiome: document.getElementById("planet-biome"),
        planetGovernment: document.getElementById("planet-government"),
        planetPopulation: document.getElementById("planet-population"),
        planetThreat: document.getElementById("planet-threat"),
        planetDescription: document.getElementById("planet-description"),
        tensionLabel: document.getElementById("tension-label"),
        focusLabel: document.getElementById("focus-label"),
        civilizationCount: document.getElementById("civilization-count"),
        metricGrid: document.getElementById("metric-grid"),
        currentAction: document.getElementById("current-action"),
        eventFeed: document.getElementById("event-feed"),
        policyEditor: document.getElementById("policy-editor"),
        aiEditor: document.getElementById("ai-editor"),
        searchInput: document.getElementById("planet-search"),
        searchResults: document.getElementById("search-results"),
        searchBlock: document.getElementById("search-block"),
        toggleMusicButton: document.getElementById("toggle-music"),
        toggleSearchButton: document.getElementById("toggle-search"),
        logBlock: document.getElementById("log-block"),
        toggleLogButton: document.getElementById("toggle-log"),
        closeLogButton: document.getElementById("close-log"),
        importantLogFeed: document.getElementById("important-log-feed"),
        archiveLogFeed: document.getElementById("archive-log-feed"),
        simState: document.getElementById("sim-state"),
        simYear: document.getElementById("sim-year"),
        selectionMode: document.getElementById("selection-mode"),
        focusCenterButton: document.getElementById("focus-center"),
        resetButton: document.getElementById("reset-universe"),
        openDetailButton: document.getElementById("open-detail"),
        closeDetailButton: document.getElementById("close-detail"),
        detailDock: document.getElementById("detail-dock"),
        selectionBrief: document.getElementById("selection-brief")
    };

    dom.searchInput.addEventListener("input", (event) => handlers.search(event.target.value));
    dom.toggleMusicButton.addEventListener("click", handlers.toggleMusic);
    dom.toggleSearchButton.addEventListener("click", handlers.toggleSearch);
    dom.toggleLogButton.addEventListener("click", handlers.toggleLog);
    dom.closeLogButton.addEventListener("click", handlers.closeLog);
    dom.focusCenterButton.addEventListener("click", handlers.focusCenter);
    dom.resetButton.addEventListener("click", handlers.resetUniverse);
    dom.openDetailButton.addEventListener("click", handlers.openDetail);
    dom.closeDetailButton.addEventListener("click", handlers.closeDetail);
    document.querySelectorAll(".speed-button").forEach((button) => {
        button.addEventListener("click", () => handlers.setSpeed(Number(button.dataset.speed)));
    });

    return {
        dom,
        render(state) {
            const selected = state.planets.find((planet) => planet.id === state.selectedPlanetId) ?? null;
            const hasSelection = Boolean(selected);
            if (dom.searchInput.value !== state.searchQuery) {
                dom.searchInput.value = state.searchQuery;
            }

            dom.civilizationCount.textContent = String(state.planets.length).padStart(2, "0");
            dom.simState.textContent = state.speed === 0 ? "일시 정지 / 전술 대기" : `자동 관측 진행 / ${state.speed}배속`;
            dom.simYear.textContent = `주기 ${state.year}.${String(state.cycle).padStart(2, "0")}`;
            dom.selectionMode.textContent = state.selectionMode;
            dom.toggleMusicButton.textContent = state.musicEnabled === false ? "음악 켜기" : "음악 끄기";
            dom.stage.classList.toggle("detail-open", Boolean(state.detailPanelOpen));
            dom.selectionBrief.classList.toggle("is-hidden", !hasSelection || Boolean(state.detailPanelOpen));
            dom.detailDock.classList.toggle("is-open", hasSelection && Boolean(state.detailPanelOpen));
            dom.searchBlock.classList.toggle("is-open", Boolean(state.searchPanelOpen));
            dom.logBlock.classList.toggle("is-open", Boolean(state.logPanelOpen));
            dom.toggleSearchButton.classList.toggle("is-active", Boolean(state.searchPanelOpen));
            dom.toggleLogButton.classList.toggle("is-active", Boolean(state.logPanelOpen));

            if (selected) {
                dom.heroTitle.textContent = selected.name;
                dom.heroSummary.textContent = selected.summary;
                dom.planetName.textContent = selected.name;
                dom.planetBiome.textContent = selected.biome;
                dom.planetGovernment.textContent = selected.government;
                dom.planetPopulation.textContent = selected.population;
                dom.planetThreat.textContent = selected.threat;
                dom.planetDescription.textContent = selected.description;
                dom.focusLabel.textContent = selected.focus;
                dom.tensionLabel.textContent = selected.tension;
                renderMetrics(dom.metricGrid, selected.metrics);
                renderActionCard(dom.currentAction, selected.currentAction, "현재 행동");
                renderPolicyEditor(dom.policyEditor, selected, handlers);
                renderAIEditor(dom.aiEditor, selected, handlers);
                renderEvents(dom.eventFeed, selected.eventFeed);
            } else {
                dom.heroTitle.textContent = "";
                dom.heroSummary.textContent = "";
                dom.planetName.textContent = "";
                dom.planetBiome.textContent = "";
                dom.planetGovernment.textContent = "";
                dom.planetPopulation.textContent = "";
                dom.planetThreat.textContent = "";
                dom.planetDescription.textContent = "";
                dom.focusLabel.textContent = "";
                dom.tensionLabel.textContent = "";
                dom.metricGrid.innerHTML = "";
                dom.currentAction.innerHTML = "";
                dom.policyEditor.innerHTML = "";
                dom.aiEditor.innerHTML = "";
                dom.eventFeed.innerHTML = "";
            }

            renderSearchResults(dom.searchResults, state.planets, state.searchQuery, state.selectedPlanetId, handlers);
            renderArchive(dom.importantLogFeed, dom.archiveLogFeed, state.logArchive ?? []);

            document.querySelectorAll(".speed-button").forEach((button) => {
                button.classList.toggle("is-active", Number(button.dataset.speed) === state.speed);
            });
        }
    };
}

function renderMetrics(container, metrics) {
    container.innerHTML = "";
    Object.entries(metrics).forEach(([key, value]) => {
        const card = document.createElement("article");
        card.className = "metric-card";
        card.innerHTML = `<span>${metricLabel(key)}</span><strong>${value}</strong>`;
        container.appendChild(card);
    });
}

function renderActionCard(container, data, fallbackTitle) {
    container.innerHTML = `
        <h4>${data?.title ?? fallbackTitle}</h4>
        <p>${data?.summary ?? "데이터 없음"}</p>
        <small class="mini-note">${data?.reason ?? "이유 정보가 아직 없습니다."}</small>
    `;
}

function renderPolicyEditor(container, planet, handlers) {
    container.innerHTML = "";
    POLICY_FIELDS.forEach((field) => {
        const wrapper = document.createElement("div");
        wrapper.className = "control-field";
        const select = document.createElement("select");
        select.className = "control-select";
        select.innerHTML = field.options.map((option) => `<option value="${option}">${option}</option>`).join("");
        select.value = planet.policies[field.key];
        select.addEventListener("change", (event) => handlers.updatePolicy(field.key, event.target.value));
        wrapper.innerHTML = `<label>${field.label}</label>`;
        wrapper.appendChild(select);
        container.appendChild(wrapper);
    });
}

function renderAIEditor(container, planet, handlers) {
    container.innerHTML = "";
    PROFILE_FIELDS.forEach((field) => {
        const wrapper = document.createElement("div");
        wrapper.className = "control-field";
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.value = String(planet.aiProfile[field.key]);
        range.className = "control-range";
        const value = document.createElement("span");
        value.className = "range-value";
        value.textContent = String(planet.aiProfile[field.key]);
        range.addEventListener("input", (event) => {
            value.textContent = event.target.value;
        });
        range.addEventListener("change", (event) => {
            handlers.updateProfile(field.key, Number(event.target.value));
        });
        wrapper.innerHTML = `<label>${field.label}</label>`;
        const row = document.createElement("div");
        row.className = "range-row";
        row.append(range, value);
        wrapper.appendChild(row);
        container.appendChild(wrapper);
    });
}

function renderEvents(container, eventFeed) {
    container.innerHTML = "";
    eventFeed.slice(0, 2).forEach((event) => {
        const item = document.createElement("li");
        item.innerHTML = `<strong>${event.date} / ${event.title}</strong><span>${event.detail}</span>`;
        container.appendChild(item);
    });
}

function renderSearchResults(container, planets, query, selectedPlanetId, handlers) {
    const filtered = query
        ? planets.filter((planet) => planet.name.toLowerCase().includes(query.toLowerCase()))
        : planets;

    container.innerHTML = "";
    filtered.forEach((planet) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `search-result${planet.id === selectedPlanetId ? " is-active" : ""}`;
        button.innerHTML = `<span>${planet.name}</span><small>${planet.government}</small>`;
        button.addEventListener("click", () => handlers.selectPlanet(planet.id));
        container.appendChild(button);
    });
}

function renderArchive(importantContainer, archiveContainer, entries) {
    importantContainer.innerHTML = "";
    archiveContainer.innerHTML = "";

    const importantEntries = entries.filter((entry) => entry.importance === "high").slice(0, 8);
    const recentEntries = entries.slice(0, 18);

    if (importantEntries.length === 0) {
        importantContainer.innerHTML = `<li class="archive-empty">아직 중요 사건이 기록되지 않았습니다.</li>`;
    } else {
        importantEntries.forEach((entry) => {
            importantContainer.appendChild(createArchiveItem(entry));
        });
    }

    if (recentEntries.length === 0) {
        archiveContainer.innerHTML = `<li class="archive-empty">아직 관측 로그가 없습니다.</li>`;
    } else {
        recentEntries.forEach((entry) => {
            archiveContainer.appendChild(createArchiveItem(entry));
        });
    }
}

function createArchiveItem(entry) {
    const item = document.createElement("li");
    item.className = "archive-item";
    item.innerHTML = `
        <strong>${entry.date} / ${entry.title}</strong>
        <span>${entry.detail}</span>
        <small class="mini-note">${entry.reason}</small>
    `;
    return item;
}

function metricLabel(key) {
    return {
        industry: "산업력",
        science: "연구력",
        stability: "안정도",
        military: "군사력",
        diplomacy: "외교력",
        culture: "문화력"
    }[key] ?? key;
}
