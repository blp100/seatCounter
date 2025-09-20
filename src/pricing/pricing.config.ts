// src/pricing/pricing.config.ts
export type DayType = "weekday" | "holiday";

export type PerPersonTier = {
  hours_from: number; // 含
  hours_to: number | null; // 不含；null = 無上限
  price_cents_per_person: number; // 整段價（每人）
};

export type RulesPerDay = {
  per_person_tiers: PerPersonTier[];
  round_up_to_minutes: number; // 例：60
  room_hourly: { price_cents_per_hour: number; round_up_to_minutes: number };
  teaching: {
    min_people: number; // 最低人數
    base_hours: number; // 基本時數（小時）
    base_price_cents_per_person: number;
    extra_unit_minutes: number; // 例：60
    extra_unit_price_cents_per_person: number; // 例：50元/人/時 → 5000
  };
};

export type PricingPlan = {
  name: string;
  rules: Record<DayType, RulesPerDay>;
};

// === 你的一般座位（A區）價目 ===
export const planA: PricingPlan = {
  name: "A區-Default",
  rules: {
    weekday: {
      per_person_tiers: [
        { hours_from: 1, hours_to: 2, price_cents_per_person: 90_00 },
        { hours_from: 2, hours_to: 3, price_cents_per_person: 180_00 },
        { hours_from: 3, hours_to: 4, price_cents_per_person: 250_00 },
        { hours_from: 4, hours_to: 5, price_cents_per_person: 300_00 },
        { hours_from: 5, hours_to: null, price_cents_per_person: 350_00 },
      ],
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 600_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 6,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
    holiday: {
      per_person_tiers: [
        { hours_from: 1, hours_to: 2, price_cents_per_person: 100_00 },
        { hours_from: 2, hours_to: 3, price_cents_per_person: 200_00 },
        { hours_from: 3, hours_to: 4, price_cents_per_person: 300_00 },
        { hours_from: 4, hours_to: 5, price_cents_per_person: 350_00 },
        { hours_from: 5, hours_to: 6, price_cents_per_person: 400_00 },
        { hours_from: 6, hours_to: null, price_cents_per_person: 450_00 },
      ],
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 600_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 6,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
  },
};

// === 包廂方案：森林/城市（600/小時；教學 min=6） ===
export const planForestCity: PricingPlan = {
  name: "森林/城市包廂",
  rules: {
    weekday: {
      per_person_tiers: [], // 不用
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 600_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 6,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
    holiday: {
      per_person_tiers: [],
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 600_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 6,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
  },
};

// === B區包廂（800/小時；教學 min=7） ===
export const planBoxB: PricingPlan = {
  name: "B區包廂",
  rules: {
    weekday: {
      per_person_tiers: [],
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 800_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 7,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
    holiday: {
      per_person_tiers: [],
      round_up_to_minutes: 60,
      room_hourly: { price_cents_per_hour: 800_00, round_up_to_minutes: 60 },
      teaching: {
        min_people: 7,
        base_hours: 3,
        base_price_cents_per_person: 350_00,
        extra_unit_minutes: 60,
        extra_unit_price_cents_per_person: 50_00,
      },
    },
  },
};

// 綁定：誰用哪套
export type Binding =
  | { scope: "area"; area: string; plan: PricingPlan; priority: number }
  | {
      scope: "tableName";
      tableName: string;
      plan: PricingPlan;
      priority: number;
    };

// 依優先權覆蓋（數字大者優先）
export const bindings: Binding[] = [
  { scope: "area", area: "A區", plan: planA, priority: 100 },
  {
    scope: "tableName",
    tableName: "森林包廂",
    plan: planForestCity,
    priority: 200,
  },
  {
    scope: "tableName",
    tableName: "城市包廂",
    plan: planForestCity,
    priority: 200,
  },
  { scope: "tableName", tableName: "B區包廂", plan: planBoxB, priority: 200 },
];

// （可選）特別假日清單
export const holidayDates: string[] = [
  // '2025-01-01', '2025-02-28', ...
];
