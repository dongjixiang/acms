import type { HistoricalEvent, EventCategory } from '../types';

/** 示例事件数据（用于开发/演示） */
const SAMPLE_EVENTS: HistoricalEvent[] = [
  {
    id: 'evt-001',
    title: '第一次世界大战爆发',
    titleEn: 'Outbreak of World War I',
    year: 1914,
    month: 6,
    day: 28,
    country: 'Europe',
    category: 'military',
    description: '萨拉热窝事件引发第一次世界大战',
    descriptionEn: 'The Sarajevo incident triggered World War I',
    significance: 5,
    causes: ['assassination', 'alliance_system', 'imperialism'],
    effects: ['fall_of_empires', 'treaty_of_versailles', 'redrawn_borders'],
    relatedEvents: ['evt-002', 'evt-003'],
    tags: ['war', 'europe', '1914'],
    sources: ['history_archive_001'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-002',
    title: '凡尔登战役',
    titleEn: 'Battle of Verdun',
    year: 1916,
    month: 2,
    day: 21,
    country: 'France',
    category: 'military',
    description: '第一次世界大战中最长的战役',
    descriptionEn: 'The longest battle of World War I',
    significance: 4,
    causes: ['trench_warfare', 'attrition_strategy'],
    effects: ['heavy_casualties', 'french_patriotism'],
    relatedEvents: ['evt-001', 'evt-004'],
    tags: ['battle', 'france', '1916'],
    sources: ['military_archive_001'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-003',
    title: '俄国十月革命',
    titleEn: 'October Revolution',
    year: 1917,
    month: 10,
    day: 25,
    country: 'Russia',
    category: 'political',
    description: '布尔什维克推翻临时政府',
    descriptionEn: 'Bolsheviks overthrow the provisional government',
    significance: 5,
    causes: ['wwi_exhaustion', 'economic_crisis', 'lenin_lead'],
    effects: ['soviet_union', 'cold_war_origins'],
    relatedEvents: ['evt-001', 'evt-005'],
    tags: ['revolution', 'russia', '1917'],
    sources: ['political_archive_001'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-004',
    title: '美国参战',
    titleEn: 'US Enters WWI',
    year: 1917,
    month: 4,
    day: 6,
    country: 'United States',
    category: 'military',
    description: '美国正式对德国宣战',
    descriptionEn: 'The US formally declares war on Germany',
    significance: 4,
    causes: ['unrestricted_submarine_warfare', 'zimmermann_telegram'],
    effects: ['shift_in_momentum', 'industrial_power'],
    relatedEvents: ['evt-001', 'evt-002'],
    tags: ['war', 'usa', '1917'],
    sources: ['military_archive_002'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-005',
    title: '冷战开始',
    titleEn: 'Start of the Cold War',
    year: 1947,
    month: 3,
    day: 12,
    country: 'Global',
    category: 'political',
    description: '杜鲁门主义宣布，冷战正式开始',
    descriptionEn: 'Truman Doctrine announced, Cold War officially begins',
    significance: 5,
    causes: ['power_vacuum', 'ideological_conflict', 'nuclear_weapons'],
    effects: ['arms_race', 'space_race', 'proxy_wars'],
    relatedEvents: ['evt-003', 'evt-006'],
    tags: ['cold_war', 'politics', '1947'],
    sources: ['political_archive_002'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-006',
    title: '柏林墙倒塌',
    titleEn: 'Fall of the Berlin Wall',
    year: 1989,
    month: 11,
    day: 9,
    country: 'Germany',
    category: 'political',
    description: '柏林墙开放，象征冷战结束',
    descriptionEn: 'Berlin Wall opens, symbolizing the end of the Cold War',
    significance: 5,
    causes: ['soviet_weakness', 'civil_unrest', 'glasnost'],
    effects: ['german_reunification', 'end_of_cold_war'],
    relatedEvents: ['evt-005', 'evt-007'],
    tags: ['cold_war', 'germany', '1989'],
    sources: ['political_archive_003'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-007',
    title: '互联网商业化',
    titleEn: 'Commercialization of the Internet',
    year: 1991,
    month: 8,
    day: 6,
    country: 'Global',
    category: 'technological',
    description: 'Tim Berners-Lee发布首个网站',
    descriptionEn: 'Tim Berners-Lee publishes the first website',
    significance: 5,
    causes: ['ARPANET', 'TCP_IP_standardization'],
    effects: ['digital_revolution', 'global_connectivity'],
    relatedEvents: ['evt-008'],
    tags: ['internet', 'technology', '1991'],
    sources: ['tech_archive_001'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'evt-008',
    title: '个人电脑革命',
    titleEn: 'Personal Computer Revolution',
    year: 1977,
    month: 1,
    day: 1,
    country: 'United States',
    category: 'technological',
    description: 'Apple II、Commodore PET等家用电脑上市',
    descriptionEn: 'Apple II, Commodore PET and other home computers released',
    significance: 4,
    causes: ['microprocessor_advancement', 'market_demand'],
    effects: ['information_age', 'software_industry'],
    relatedEvents: ['evt-007'],
    tags: ['computing', 'usa', '1977'],
    sources: ['tech_archive_002'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
];

/**
 * 获取所有样本事件（无筛选）— 异步版本
 */
export function getSampleEvents(): Promise<HistoricalEvent[]> {
  return Promise.resolve(SAMPLE_EVENTS);
}

/**
 * 根据 ID 获取单个事件
 */
export function getEventById(id: string): HistoricalEvent | undefined {
  return SAMPLE_EVENTS.find((e) => e.id === id);
}

/**
 * 根据查询条件过滤事件（异步版本，返回 Promise）
 * @param searchQuery - 搜索关键词（匹配 title/description/tags）
 * @param filterCountry - 国家筛选（精确匹配 country 字段）
 * @param filterCategory - 类别筛选
 * @returns 过滤后的事件数组（始终返回数组）
 */
export function getFilteredEvents(
  searchQuery?: string,
  filterCountry?: string,
  filterCategory?: EventCategory | null,
): Promise<HistoricalEvent[]> {
  let result = SAMPLE_EVENTS;

  // 按国家筛选
  if (filterCountry) {
    result = result.filter((e) => e.country === filterCountry);
  }

  // 按类别筛选
  if (filterCategory) {
    result = result.filter((e) => e.category === filterCategory);
  }

  // 按搜索词筛选
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  return Promise.resolve(result);
}

/**
 * 根据查询条件过滤事件（同步版本）
 * @deprecated 使用 getFilteredEvents 异步版本替代
 */
export function getFilteredEventsSync(
  searchQuery?: string,
  filterCountry?: string,
  filterCategory?: EventCategory | null,
): HistoricalEvent[] {
  let result = SAMPLE_EVENTS;

  if (filterCountry) {
    result = result.filter((e) => e.country === filterCountry);
  }
  if (filterCategory) {
    result = result.filter((e) => e.category === filterCategory);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  return result;
}
