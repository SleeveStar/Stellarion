const ARCHETYPES = [
    { kind: "oceanic", biome: "해양 아콜로지", color: "#63b6ff", accent: "#a6ebff", ring: true, moons: [0, 2], focus: "궤도 안정화", tension: "자원 경쟁" },
    { kind: "desert", biome: "사막 제련 행성", color: "#f49d51", accent: "#ffe1a6", ring: false, moons: [1, 3], focus: "합금 채굴", tension: "국경 무장화" },
    { kind: "gas", biome: "가스 거주권 연합", color: "#d9c37d", accent: "#f6edbe", ring: true, moons: [0, 1], focus: "상층 대기 채굴", tension: "정보 침투" },
    { kind: "frozen", biome: "빙하 기계권", color: "#b7c8ff", accent: "#ffffff", ring: false, moons: [0, 2], focus: "지하 핵 재가동", tension: "의도 불명" },
    { kind: "twilight", biome: "성전 메가시티", color: "#ffcb6e", accent: "#fff1b2", ring: false, moons: [1, 3], focus: "교리 확장", tension: "종교 분열" },
    { kind: "jungle", biome: "독성 생명공학 행성", color: "#53d88a", accent: "#bcffd0", ring: false, moons: [0, 1], focus: "적응형 생체 무장", tension: "내부 분열" },
    { kind: "volcanic", biome: "화산 중력 행성", color: "#ff6a4f", accent: "#ffbd73", ring: false, moons: [1, 2], focus: "중력포 격납고", tension: "무기 실험 확산" },
    { kind: "crystal", biome: "수정 공명 행성", color: "#76e5ff", accent: "#defdff", ring: true, moons: [0, 1], focus: "공명 장막", tension: "정신 교란" },
    { kind: "storm", biome: "폭풍 해면 행성", color: "#7db6ff", accent: "#e5f4ff", ring: false, moons: [1, 2], focus: "폭풍 항로", tension: "정착지 이동 혼란" },
    { kind: "machine", biome: "기계 묘지 행성", color: "#8ea0c8", accent: "#d7e0ff", ring: false, moons: [0, 1], focus: "폐허 해독", tension: "잠재적 재가동" },
    { kind: "toxic", biome: "독성 대기 주권체", color: "#8dc45a", accent: "#d7ff9f", ring: false, moons: [0, 2], focus: "독성 정제", tension: "대기 폭주" },
    { kind: "aurora", biome: "오로라 자력 행성", color: "#64d8ff", accent: "#f4ffff", ring: true, moons: [1, 3], focus: "자기권 증폭", tension: "극광 간섭" },
    { kind: "metallic", biome: "금속 판각 행성", color: "#aeb7c7", accent: "#f7fbff", ring: false, moons: [0, 2], focus: "판각 도시망", tension: "핵심부 과열" },
    { kind: "canyon", biome: "협곡 요새 행성", color: "#c77d58", accent: "#ffd2b0", ring: false, moons: [1, 2], focus: "절벽 방어선", tension: "지각 붕괴" },
    { kind: "obsidian", biome: "흑요 융합 행성", color: "#6b5b86", accent: "#d6cbff", ring: true, moons: [0, 1], focus: "암흑 격자망", tension: "심층 공명" },
    { kind: "reef", biome: "산호 해역 행성", color: "#4fd0c8", accent: "#e3fff8", ring: false, moons: [0, 2], focus: "생체 산호권", tension: "생태 변이" },
    { kind: "ash", biome: "재먼지 권역 행성", color: "#8f7e76", accent: "#efe4df", ring: false, moons: [1, 3], focus: "분진 채광", tension: "성층 화산재" },
    { kind: "tundra", biome: "툰드라 감시 행성", color: "#9eb7d8", accent: "#f4fbff", ring: false, moons: [0, 2], focus: "장거리 감시망", tension: "빙원 단절" }
];

const GOVERNMENTS = [
    "기술 평의회",
    "왕조 전쟁 씨족",
    "기업 공의회",
    "기계 수호 핵심체",
    "태양 신정",
    "유전자 카르텔 이사회",
    "강철 집정국",
    "공명 결사단",
    "부유 연합체",
    "상업 통합회",
    "행성 연방 의회",
    "감시자 집정체"
];

const NAME_PREFIX = ["아이", "케프", "솔", "닉스", "할", "미르", "반타", "탈로", "오리", "세라", "루미", "카이"];
const NAME_CORE = ["테라", "리온", "카리나", "베일", "게이트", "스핀들", "드리프트", "오스", "미르", "자르", "노바", "폴리스"];
const NAME_SUFFIX = [" 프라임", " IX", " 게이트", " 미어", " 베일", " 스테이션", " 널", " 드리프트", " 하이브", " 아크"];
const FLEET_SHAPES = ["rect", "cone", "ellipse"];

const POLICY_OPTIONS = {
    growth: ["점진적 성장", "공격적 확장", "내정 우선"],
    diplomacy: ["개방 외교", "고립주의", "교역 우선"],
    military: ["궤도 방어", "기동 타격", "억제 중심"],
    research: ["항로 이론", "생명공학", "전장 공학", "사회 체계"]
};

export { POLICY_OPTIONS };

export function createRandomUniverse() {
    const count = randomInt(28, 32);
    const positions = createPlanetPositions(count, 9.8, 22, 42);
    const planets = Array.from({ length: count }, (_, index) => createPlanet(index, positions[index]));
    const hyperlanes = buildHyperlanes(planets);
    seedRelations(planets, hyperlanes);

    return {
        version: 7,
        year: 2473,
        cycle: 4,
        speed: 1,
        searchQuery: "",
        selectionMode: "자율 전략 관측",
        selectedPlanetId: null,
        planets,
        hyperlanes,
        logArchive: [
            {
                id: "archive-0",
                date: "주기 2473.00",
                title: "심우주 관측망 가동",
                detail: `${planets.length}개 행성 문명이 은하 지도에 동기화되었습니다.`,
                reason: "초기 관측 범위 설정과 항로 분석이 완료되어 전략 로그 수집을 시작했습니다.",
                importance: "high"
            }
        ]
    };
}

function createPlanet(index, position) {
    const archetype = ARCHETYPES[index % ARCHETYPES.length];
    const name = createName(index);
    const id = `planet-${index}-${slugify(name)}`;
    const metrics = {
        industry: randomInt(42, 96),
        science: randomInt(38, 95),
        stability: randomInt(34, 99),
        military: randomInt(30, 94),
        diplomacy: randomInt(28, 90),
        culture: randomInt(30, 92)
    };
    const aiProfile = {
        aggression: randomInt(18, 92),
        caution: randomInt(18, 90),
        greed: randomInt(20, 88),
        curiosity: randomInt(22, 95),
        discipline: randomInt(28, 94),
        zeal: randomInt(12, 86)
    };
    const policies = {
        growth: pick(POLICY_OPTIONS.growth),
        diplomacy: pick(POLICY_OPTIONS.diplomacy),
        military: pick(POLICY_OPTIONS.military),
        research: pick(POLICY_OPTIONS.research)
    };

    const radius = 0.94 + Math.random() * 0.38;

    return {
        id,
        name,
        biome: archetype.biome,
        government: pick(GOVERNMENTS),
        population: `${randomInt(18, 96)}억`,
        threat: computeThreat(metrics, aiProfile),
        summary: `${archetype.biome} 기반의 ${toneFromProfile(aiProfile)} 문명. ${policies.diplomacy} 노선을 유지한다.`,
        description: `${name}은 ${archetype.biome} 환경과 ${pick(["고밀도 궤도 산업", "거대 교역망", "강압적 군정", "정교한 데이터 체계", "종교적 결속", "폐쇄적 연구 체계"])}를 바탕으로 독자적인 질서를 유지한다.`,
        focus: archetype.focus,
        tension: archetype.tension,
        color: archetype.color,
        accent: archetype.accent,
        position,
        radius,
        kind: archetype.kind,
        fleetShape: pick(FLEET_SHAPES),
        ring: archetype.ring,
        moons: randomInt(archetype.moons[0], archetype.moons[1]),
        metrics,
        policies,
        aiProfile,
        relations: {},
        currentAction: {
            key: "idle",
            category: "internal",
            title: "상황 분석 중",
            summary: "아직 독립 AI가 첫 행동을 선택하지 않았습니다.",
            reason: "초기 우주 생성 직후라서 주변 성계 정보와 내부 지표를 정리 중입니다.",
            targetId: null
        },
        rationale: {
            title: "초기 브리핑",
            summary: "문명 성향과 정책이 확정되면 행동 논리가 축적됩니다.",
            reason: `공격성 ${aiProfile.aggression}, 신중함 ${aiProfile.caution}, 호기심 ${aiProfile.curiosity} 기반으로 첫 전략을 계산합니다.`
        },
        eventFeed: [
            {
                date: "주기 2473.00",
                title: `${name} 문명이 성계 지도에 등록됨`,
                detail: `${pick(["행성 통합 선언", "권력 재편", "행성 헌장 공포", "신정부 출범"])} 이후 자율 의사결정 체계를 구축했다.`,
                reason: `${policies.growth}, ${policies.diplomacy}, ${policies.military} 정책이 기본 국가 방침으로 설정되었다.`
            }
        ]
    };
}

function createPlanetPositions(count, minDistance, minRadius, maxRadius) {
    const positions = [];
    let gap = minDistance;
    let attempts = 0;

    while (positions.length < count && attempts < count * 200) {
        const candidate = randomPosition(minRadius, maxRadius);
        const isFarEnough = positions.every((position) => getDistance(position, candidate) >= gap);

        if (isFarEnough) {
            positions.push(candidate);
        }

        attempts += 1;

        // If packing gets tight, ease the constraint slightly instead of failing generation.
        if (attempts % (count * 20) === 0 && positions.length < count) {
            gap = Math.max(7.6, gap - 0.4);
        }
    }

    while (positions.length < count) {
        positions.push(randomPosition(minRadius, maxRadius));
    }

    return positions;
}

function randomPosition(minRadius, maxRadius) {
    const distance = minRadius + Math.random() * (maxRadius - minRadius);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    return [
        Number((distance * Math.sin(phi) * Math.cos(theta)).toFixed(2)),
        Number((distance * Math.cos(phi)).toFixed(2)),
        Number((distance * Math.sin(phi) * Math.sin(theta)).toFixed(2))
    ];
}

function buildHyperlanes(planets) {
    const lanes = new Set();

    planets.forEach((planet) => {
        const nearest = [...planets]
            .filter((target) => target.id !== planet.id)
            .map((target) => ({ target, distance: getDistance(planet.position, target.position) }))
            .sort((left, right) => left.distance - right.distance)
            .slice(0, 3);

        nearest.forEach(({ target }) => {
            const lane = [planet.id, target.id].sort().join("::");
            lanes.add(lane);
        });
    });

    return [...lanes].map((lane) => lane.split("::"));
}

function seedRelations(planets, hyperlanes) {
    planets.forEach((planet) => {
        planet.relations = {};
    });

    hyperlanes.forEach(([leftId, rightId]) => {
        const score = randomInt(-28, 28);
        const left = planets.find((planet) => planet.id === leftId);
        const right = planets.find((planet) => planet.id === rightId);
        if (!left || !right) return;
        left.relations[rightId] = score;
        right.relations[leftId] = score;
    });
}

function computeThreat(metrics, profile) {
    const score = metrics.military * 0.5 + profile.aggression * 0.3 + (100 - metrics.stability) * 0.2;
    if (score >= 74) return "높음";
    if (score >= 48) return "보통";
    return "낮음";
}

function toneFromProfile(profile) {
    if (profile.aggression > 75) return "공세적인";
    if (profile.curiosity > 78) return "탐사 중심의";
    if (profile.caution > 75) return "신중한";
    if (profile.zeal > 70) return "교리 지향적";
    return "균형형";
}

function createName(index) {
    return `${NAME_PREFIX[index % NAME_PREFIX.length]}${pick(NAME_CORE)}${pick(NAME_SUFFIX)}`;
}

function slugify(value) {
    return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-가-힣]/g, "");
}

function getDistance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
