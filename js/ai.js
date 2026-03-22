import { POLICY_OPTIONS } from "./generator.js";

export const PROFILE_FIELDS = [
    { key: "aggression", label: "공격성" },
    { key: "caution", label: "신중함" },
    { key: "greed", label: "탐욕" },
    { key: "curiosity", label: "호기심" },
    { key: "discipline", label: "규율" },
    { key: "zeal", label: "열성" }
];

export const POLICY_FIELDS = [
    { key: "growth", label: "확장 성향", options: POLICY_OPTIONS.growth },
    { key: "diplomacy", label: "외교 노선", options: POLICY_OPTIONS.diplomacy },
    { key: "military", label: "군사 교리", options: POLICY_OPTIONS.military },
    { key: "research", label: "연구 우선순위", options: POLICY_OPTIONS.research }
];

export function advanceUniverse(state, steps = 1) {
    ensureStateShape(state);

    for (let index = 0; index < steps; index += 1) {
        advanceOneCycle(state);
    }
}

export function updatePlanetPolicy(state, planetId, key, value) {
    const planet = state.planets.find((entry) => entry.id === planetId);
    if (!planet) return;
    planet.policies[key] = value;
}

export function updatePlanetProfile(state, planetId, key, value) {
    const planet = state.planets.find((entry) => entry.id === planetId);
    if (!planet) return;
    planet.aiProfile[key] = Number(value);
}

function ensureStateShape(state) {
    if (!Array.isArray(state.logArchive)) {
        state.logArchive = [];
    }

    state.planets.forEach((planet) => {
        if (!planet.relations || typeof planet.relations !== "object") {
            planet.relations = {};
        }
        if (!Array.isArray(planet.eventFeed)) {
            planet.eventFeed = [];
        }
    });

    state.hyperlanes.forEach(([leftId, rightId]) => {
        const left = state.planets.find((planet) => planet.id === leftId);
        const right = state.planets.find((planet) => planet.id === rightId);
        if (!left || !right) return;

        if (typeof left.relations[rightId] !== "number") {
            left.relations[rightId] = 0;
        }
        if (typeof right.relations[leftId] !== "number") {
            right.relations[leftId] = 0;
        }
    });
}

function advanceOneCycle(state) {
    state.cycle += 1;
    if (state.cycle > 12) {
        state.cycle = 1;
        state.year += 1;
    }

    state.planets.forEach((planet) => {
        const neighbors = getNeighborPlanets(state, planet.id);
        const context = getPlanetContext(planet, neighbors);
        const action = chooseAction(planet, context);
        applyAction(state, planet, action);
        appendEvent(state, planet, action);
    });
}

function chooseAction(planet, context) {
    const { metrics, aiProfile, policies } = planet;
    const previousAction = planet.currentAction ?? {};
    const rival = context.hostile?.planet;
    const friendly = context.friendly?.planet;
    const tradeTarget = context.tradeTarget?.planet;
    const weakTarget = context.weakTarget?.planet ?? rival ?? tradeTarget;
    const aidTarget = context.aidTarget?.planet;
    const hostileScore = context.hostile?.relation ?? 0;
    const friendlyScore = context.friendly?.relation ?? 0;
    const militaryGap = context.weakTarget ? metrics.military - context.weakTarget.planet.metrics.military : 0;
    const stabilityGap = context.aidTarget ? 100 - context.aidTarget.planet.metrics.stability : 0;
    const preparedForWar = previousAction.key === "mobilize" && previousAction.targetId === weakTarget?.id;
    const warHostility = Math.abs(Math.min(hostileScore, 0));

    const candidates = [
        {
            key: "fortify",
            category: "defense",
            title: "궤도 방어 강화",
            summary: `${rival?.name ?? "인접 문명"}의 무력 압박에 대비해 방어망을 증설합니다.`,
            reason: `군사력 ${metrics.military}가 충분치 않고 신중함 ${aiProfile.caution}이 높아 방어 자산을 우선 보강했습니다.`,
            focus: "방어 격자 재배치",
            tension: "국경 경계 강화",
            delta: { military: 2, stability: 1, science: -1 },
            score: (100 - metrics.military) + aiProfile.caution * 0.78 + (rival ? rival.metrics.military * 0.2 : 0) + (policies.military === "궤도 방어" ? 16 : 0)
        },
        {
            key: "research",
            category: "research",
            title: "심층 연구 집중",
            summary: `${policies.research} 분야에 예산을 몰아 기술 우위를 확보합니다.`,
            reason: `연구력 ${metrics.science}과 호기심 ${aiProfile.curiosity} 기준으로 기술 축적 기대값이 가장 높았습니다.`,
            focus: policies.research,
            tension: "기술 격차 확대",
            delta: { science: 3, industry: -1, diplomacy: 1 },
            score: (100 - metrics.science) + aiProfile.curiosity * 0.92 + (policies.research === "사회 체계" ? 7 : 12)
        },
        {
            key: "trade",
            category: "trade",
            title: "교역 회랑 확장",
            summary: `${tradeTarget?.name ?? "인근 교역권"}과의 물동량을 늘려 시장 지배력을 높입니다.`,
            reason: `외교력 ${metrics.diplomacy}, 탐욕 ${aiProfile.greed}, 관계 ${friendlyScore}를 고려했을 때 교역 확대가 가장 안정적인 수익원으로 계산되었습니다.`,
            focus: "교역 회랑 확장",
            tension: "시장 경쟁",
            delta: { industry: 2, diplomacy: 2, military: -1 },
            targetId: tradeTarget?.id,
            targetDelta: { industry: 1, diplomacy: 1 },
            relationDelta: 8,
            importance: "normal",
            score: (tradeTarget ? 26 : -100) + metrics.diplomacy * 0.48 + aiProfile.greed * 0.46 + Math.max(friendlyScore, 0) * 0.45 + (policies.diplomacy === "교역 우선" ? 18 : 0)
        },
        {
            key: "treaty",
            category: "diplomacy",
            title: "상호 방위 조약 체결",
            summary: `${friendly?.name ?? "우호 문명"}와 방위 조약을 조율해 전선 불확실성을 낮춥니다.`,
            reason: `우호 관계 ${friendlyScore}, 외교 노선 ${policies.diplomacy}, 신중함 ${aiProfile.caution}이 장기 조약 체결을 지지했습니다.`,
            focus: "조약 체결",
            tension: "세력 균형 재편",
            delta: { diplomacy: 2, stability: 1 },
            targetId: friendly?.id,
            targetDelta: { diplomacy: 1, stability: 1 },
            relationDelta: 12,
            importance: "high",
            score: (friendly ? 22 : -100) + metrics.diplomacy * 0.54 + aiProfile.caution * 0.32 + Math.max(friendlyScore, 0) * 0.82 + (policies.diplomacy === "개방 외교" ? 18 : 0)
        },
        {
            key: "aid",
            category: "diplomacy",
            title: "인도 지원단 파견",
            summary: `${aidTarget?.name ?? "주변 문명"}에 안정화 자원과 기술단을 보내 질서 붕괴를 막습니다.`,
            reason: `대상 안정도 부족치 ${stabilityGap}와 자국 외교력 ${metrics.diplomacy}, 문화력 ${metrics.culture}를 종합하면 개입 비용보다 영향력 확보 이익이 컸습니다.`,
            focus: "외부 안정화 개입",
            tension: "난민 수용 압박",
            delta: { diplomacy: 2, culture: 1, industry: -1 },
            targetId: aidTarget?.id,
            targetDelta: { stability: 3, diplomacy: 1 },
            relationDelta: 10,
            importance: "normal",
            score: (aidTarget ? 18 : -100) + metrics.diplomacy * 0.36 + metrics.culture * 0.24 + Math.max(stabilityGap, 0) * 0.58 + (friendlyScore > 15 ? 8 : 0)
        },
        {
            key: "espionage",
            category: "covert",
            title: "첩보망 침투",
            summary: `${rival?.name ?? "적대 세력"}의 항로 데이터와 군수 흐름을 은밀히 수집합니다.`,
            reason: `호기심 ${aiProfile.curiosity}, 탐욕 ${aiProfile.greed}, 적대 관계 ${hostileScore}가 결합되어 공개 충돌보다 첩보 침투가 효율적이라고 판단했습니다.`,
            focus: "정보 탈취",
            tension: "보이지 않는 전쟁",
            delta: { science: 1, diplomacy: -1 },
            targetId: rival?.id,
            targetDelta: { stability: -2 },
            relationDelta: -8,
            importance: "normal",
            score: (rival ? 16 : -100) + aiProfile.curiosity * 0.54 + aiProfile.greed * 0.26 + Math.abs(Math.min(hostileScore, 0)) * 0.62 + (policies.diplomacy === "고립주의" ? 8 : 0)
        },
        {
            key: "sanction",
            category: "pressure",
            title: "경제 제재 발동",
            summary: `${rival?.name ?? "인접 세력"}의 유통망을 차단하며 자원 압박을 가합니다.`,
            reason: `적대 관계 ${hostileScore}, 규율 ${aiProfile.discipline}, 외교력 ${metrics.diplomacy} 기준으로 군사 충돌 이전 단계의 압박 수단이 가장 합리적이었습니다.`,
            focus: "물자 차단",
            tension: "경제 전선 확대",
            delta: { diplomacy: -1, industry: 1 },
            targetId: rival?.id,
            targetDelta: { industry: -2, diplomacy: -1 },
            relationDelta: -10,
            importance: "high",
            score: (rival ? 14 : -100) + aiProfile.discipline * 0.41 + metrics.diplomacy * 0.34 + Math.abs(Math.min(hostileScore, 0)) * 0.84 + (policies.diplomacy === "고립주의" ? 12 : 0)
        },
        {
            key: "invasion",
            category: "war",
            title: "국경 침공 단행",
            summary: `${weakTarget?.name ?? "인접 세력"}의 방어 공백을 노려 국경선 너머로 함대를 투입합니다.`,
            reason: `${preparedForWar ? "사전 집결이 완료되었고 " : ""}군사 우위 ${militaryGap}, 공격성 ${aiProfile.aggression}, 적대 관계 ${hostileScore}가 전면 교전 기준을 넘었습니다.`,
            focus: "전선 돌파",
            tension: "전면 교전",
            delta: { military: -1, culture: -1, stability: -1 },
            targetId: weakTarget?.id,
            targetDelta: { military: -3, stability: -4, culture: -1 },
            relationDelta: -18,
            importance: "high",
            score:
                (weakTarget ? 8 : -100) +
                (preparedForWar ? 28 : -34) +
                (militaryGap >= 12 ? militaryGap * 1.05 : -28) +
                (hostileScore <= -34 ? warHostility * 0.74 : -24) +
                aiProfile.aggression * 0.42 +
                (policies.military === "기동 타격" ? 8 : 0)
        },
        {
            key: "mobilize",
            category: "war",
            title: "함대 집결령",
            summary: `${rival?.name ?? "경쟁 세력"}을 견제하기 위해 항로 요충지에 전투 함대를 집결시킵니다.`,
            reason: `직접 침공 전 단계에서 공격성 ${aiProfile.aggression}, 적대 관계 ${hostileScore}, 군사 교리 ${policies.military}를 바탕으로 전선을 먼저 준비합니다.`,
            focus: "전선 시위",
            tension: "무력 시위",
            delta: { military: 2, diplomacy: -2 },
            targetId: rival?.id,
            relationDelta: -6,
            importance: "high",
            score:
                (rival ? 16 : -100) +
                metrics.military * 0.32 +
                aiProfile.aggression * 0.38 +
                warHostility * 0.58 +
                (hostileScore <= -18 ? 14 : -8) +
                (previousAction.key === "mobilize" && previousAction.targetId === rival?.id ? -18 : 0) +
                (policies.military === "억제 중심" ? 8 : 4)
        },
        {
            key: "festival",
            category: "culture",
            title: "문명 통합 의식",
            summary: `내부 결속을 다지며 이념 선전을 통해 지배 질서를 강화합니다.`,
            reason: `열성 ${aiProfile.zeal}, 문화력 ${metrics.culture}, 안정도 ${metrics.stability} 조합이 내부 결속 강화에 유리하게 작동했습니다.`,
            focus: "문화 선전",
            tension: "이념 경쟁",
            delta: { culture: 2, stability: 1, science: -1 },
            score: metrics.culture * 0.44 + aiProfile.zeal * 0.63 + metrics.stability * 0.16 + (policies.growth === "내정 우선" ? 12 : 0)
        },
        {
            key: "reform",
            category: "internal",
            title: "내부 질서 재정비",
            summary: `관료 조직과 사회 질서를 손질해 붕괴 징후를 억누릅니다.`,
            reason: `안정도 ${metrics.stability}가 낮고 규율 ${aiProfile.discipline}이 높아, 외부 팽창보다 내부 수습이 더 시급했습니다.`,
            focus: "행정 재편",
            tension: "내부 불균형",
            delta: { stability: 3, diplomacy: -1, culture: 1 },
            score: (100 - metrics.stability) * 1.18 + aiProfile.discipline * 0.78 + (policies.growth === "내정 우선" ? 18 : 4)
        }
    ];

    return candidates.sort((left, right) => right.score - left.score)[0];
}

function applyAction(state, planet, action) {
    applyMetricDelta(planet.metrics, action.delta);

    let target = null;
    if (action.targetId) {
        target = state.planets.find((entry) => entry.id === action.targetId) ?? null;
        if (target && action.targetDelta) {
            applyMetricDelta(target.metrics, action.targetDelta);
        }
        if (target && typeof action.relationDelta === "number") {
            adjustRelation(planet, target, action.relationDelta);
        }
        if (target) {
            target.threat = computeThreat(target.metrics, target.aiProfile);
        }
    }

    planet.focus = action.focus;
    planet.tension = action.tension;
    planet.currentAction = {
        key: action.key,
        category: action.category ?? "internal",
        title: action.title,
        summary: action.summary,
        reason: action.reason,
        targetId: action.targetId ?? null
    };
    planet.rationale = {
        title: `${action.title} 판단 이유`,
        summary: action.summary,
        reason: action.reason
    };
    planet.threat = computeThreat(planet.metrics, planet.aiProfile);
    planet.summary = createSummary(planet);
}

function appendEvent(state, planet, action) {
    const date = `주기 ${state.year}.${String(state.cycle).padStart(2, "0")}`;
    const archiveEntry = {
        id: `archive-${state.year}-${state.cycle}-${planet.id}-${action.key}`,
        date,
        title: `${planet.name} / ${action.title}`,
        detail: action.summary,
        reason: action.reason,
        importance: action.importance ?? "normal"
    };

    pushPlanetEvent(planet, {
        date,
        title: action.title,
        detail: action.summary,
        reason: action.reason
    });

    if (action.targetId) {
        const target = state.planets.find((entry) => entry.id === action.targetId);
        if (target) {
            pushPlanetEvent(target, {
                date,
                title: `${planet.name} 관련 ${action.title}`,
                detail: buildTargetDetail(planet, action),
                reason: buildTargetReason(planet, target, action)
            });
            target.summary = createSummary(target);
        }
    }

    state.logArchive.unshift(archiveEntry);
    state.logArchive = state.logArchive.slice(0, 160);
}

function buildTargetDetail(actor, action) {
    switch (action.key) {
        case "trade":
            return `${actor.name}과의 교역 규모가 확대되며 항로 수익이 증가했습니다.`;
        case "treaty":
            return `${actor.name}과의 방위 조약 협상이 진전되며 국경 긴장이 완화되었습니다.`;
        case "aid":
            return `${actor.name}이 보급단과 기술 고문단을 보내 내부 질서 회복을 지원했습니다.`;
        case "espionage":
            return `${actor.name} 관련 비인가 신호가 감지되며 보안 체계가 흔들렸습니다.`;
        case "sanction":
            return `${actor.name}이 물자 통로를 압박하며 시장 접근성이 떨어졌습니다.`;
        case "invasion":
            return `${actor.name}이 국경선을 넘어 무장 침공을 개시했습니다.`;
        case "mobilize":
            return `${actor.name}의 함대 집결로 국경 항로의 긴장이 급상승했습니다.`;
        default:
            return `${actor.name}의 대외 행동 여파가 관측되었습니다.`;
    }
}

function buildTargetReason(actor, target, action) {
    const relation = getRelation(target, actor.id);
    return `${actor.name}와의 관계 수치가 ${relation}(${describeRelation(relation)})로 이동하며 대응 필요성이 커졌습니다.`;
}

function pushPlanetEvent(planet, event) {
    planet.eventFeed.unshift(event);
    planet.eventFeed = planet.eventFeed.slice(0, 10);
}

function getPlanetContext(planet, neighbors) {
    const scored = neighbors.map((neighbor) => ({
        planet: neighbor,
        relation: getRelation(planet, neighbor.id),
        militaryGap: planet.metrics.military - neighbor.metrics.military,
        tradeWeight: neighbor.metrics.diplomacy + getRelation(planet, neighbor.id),
        vulnerability: (100 - neighbor.metrics.military) + (100 - neighbor.metrics.stability)
    }));

    const hostile = [...scored].sort((left, right) => left.relation - right.relation || right.planet.metrics.military - left.planet.metrics.military)[0];
    const friendly = [...scored].sort((left, right) => right.relation - left.relation || right.planet.metrics.diplomacy - left.planet.metrics.diplomacy)[0];
    const tradeTarget = [...scored].sort((left, right) => right.tradeWeight - left.tradeWeight)[0];
    const weakTarget = [...scored].sort((left, right) => right.vulnerability - left.vulnerability || right.militaryGap - left.militaryGap)[0];
    const aidTarget = [...scored]
        .filter((entry) => entry.relation > 5)
        .sort((left, right) => left.planet.metrics.stability - right.planet.metrics.stability)[0];

    return { hostile, friendly, tradeTarget, weakTarget, aidTarget };
}

function getNeighborPlanets(state, planetId) {
    const ids = state.hyperlanes
        .filter(([left, right]) => left === planetId || right === planetId)
        .map(([left, right]) => (left === planetId ? right : left));
    return state.planets.filter((planet) => ids.includes(planet.id));
}

function getRelation(planet, otherId) {
    return Number(planet.relations?.[otherId] ?? 0);
}

function adjustRelation(left, right, delta) {
    left.relations[right.id] = clampRelation(getRelation(left, right.id) + delta);
    right.relations[left.id] = clampRelation(getRelation(right, left.id) + delta);
}

function applyMetricDelta(metrics, delta = {}) {
    Object.entries(delta).forEach(([key, value]) => {
        metrics[key] = clampMetric(metrics[key] + value);
    });
}

function createSummary(planet) {
    const relationValues = Object.values(planet.relations ?? {});
    const averageRelation = relationValues.length
        ? relationValues.reduce((sum, value) => sum + value, 0) / relationValues.length
        : 0;
    const diplomaticTone = averageRelation > 18 ? "협조적" : averageRelation < -18 ? "대립적" : "신중한";
    return `${planet.biome} 기반의 ${diplomaticTone} 문명. 현재 ${planet.focus}에 자원을 집중하며 ${planet.tension} 상황에 대응 중이다.`;
}

function clampMetric(value) {
    return Math.max(0, Math.min(100, value));
}

function clampRelation(value) {
    return Math.max(-100, Math.min(100, value));
}

function computeThreat(metrics, profile) {
    const score = metrics.military * 0.5 + profile.aggression * 0.3 + (100 - metrics.stability) * 0.2;
    if (score >= 74) return "높음";
    if (score >= 48) return "보통";
    return "낮음";
}

function describeRelation(score) {
    if (score >= 45) return "우호";
    if (score >= 10) return "완화";
    if (score <= -45) return "적대";
    if (score <= -10) return "경계";
    return "중립";
}
