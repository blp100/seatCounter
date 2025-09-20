// src/pricing/engine.ts
import { differenceInMinutes, isSaturday, isSunday } from "date-fns";
import {
  bindings,
  holidayDates,
  type DayType,
  type PricingPlan,
  type RulesPerDay,
} from "./pricing.config";

export function isHoliday(d: Date): DayType {
  const iso = d.toISOString().slice(0, 10);
  if (isSaturday(d) || isSunday(d)) return "holiday";
  if (holidayDates.includes(iso)) return "holiday";
  return "weekday";
}

export type ResolveInput = { tableName: string; area: string; at: Date };
export function resolvePlan({ tableName, area, at }: ResolveInput): {
  plan: PricingPlan;
  day: DayType;
  rules: RulesPerDay;
} {
  const day = isHoliday(at);
  // 先比對 tableName，再比對 area，取 priority 最大
  const hit = bindings
    .filter(
      (b) =>
        (b.scope === "tableName" && b.tableName === tableName) ||
        (b.scope === "area" && b.area === area)
    )
    .sort((a, b) => b.priority - a.priority)[0];
  const plan = hit ? hit.plan : bindings.find((b) => b.scope === "area")!.plan; // 後備：找一個預設 plan
  return { plan, day, rules: plan.rules[day] };
}

// —— 計算工具 —— //
function ceilDiv(a: number, b: number) {
  return Math.ceil(a / b);
}
function roundUpMinutes(mins: number, step: number) {
  return ceilDiv(mins, step) * step;
}

export function computePerPersonTier(totalMinutes: number, rules: RulesPerDay) {
  const mins = roundUpMinutes(totalMinutes, rules.round_up_to_minutes);
  const hours = Math.max(1, Math.ceil(mins / 60)); // 以小時階梯定位
  const tier = rules.per_person_tiers.find(
    (t) => hours >= t.hours_from && (t.hours_to == null || hours < t.hours_to)
  );
  if (tier) {
    return { perPersonCents: tier.price_cents_per_person, matchedHours: hours };
  }

  // 當無明確區間匹配時，退回到最高起始小時的方案（視為上限階梯）。
  if (!rules.per_person_tiers.length) {
    throw new Error("No per-person tiers configured");
  }
  const fallback = rules.per_person_tiers.reduce((max, current) =>
    current.hours_from > max.hours_from ? current : max
  );
  if (!fallback) {
    throw new Error("No tier matched for hours=" + hours);
  }
  return { perPersonCents: fallback.price_cents_per_person, matchedHours: hours };
}

export function computeRoomHourly(totalMinutes: number, rules: RulesPerDay) {
  const mins = roundUpMinutes(
    totalMinutes,
    rules.room_hourly.round_up_to_minutes
  );
  const hours = ceilDiv(mins, 60);
  const total = hours * rules.room_hourly.price_cents_per_hour;
  return { totalCents: total, billedHours: hours };
}

export function computeTeaching(
  totalMinutes: number,
  people: number,
  rules: RulesPerDay
) {
  const p = Math.max(people, rules.teaching.min_people);
  const baseMins = rules.teaching.base_hours * 60;
  if (totalMinutes <= baseMins) {
    return {
      perPersonCents: rules.teaching.base_price_cents_per_person,
      people: p,
      totalCents: p * rules.teaching.base_price_cents_per_person,
    };
  }
  const extra = totalMinutes - baseMins;
  const extraUnits = ceilDiv(extra, rules.teaching.extra_unit_minutes);
  const perPerson =
    rules.teaching.base_price_cents_per_person +
    extraUnits * rules.teaching.extra_unit_price_cents_per_person;
  return { perPersonCents: perPerson, people: p, totalCents: p * perPerson };
}

export function computeTeachingPerPerson(
  totalMinutes: number,
  rules: RulesPerDay
) {
  const baseMins = rules.teaching.base_hours * 60;
  if (totalMinutes <= baseMins) {
    return rules.teaching.base_price_cents_per_person;
  }
  const extra = totalMinutes - baseMins;
  const extraUnits = ceilDiv(extra, rules.teaching.extra_unit_minutes);
  return (
    rules.teaching.base_price_cents_per_person +
    extraUnits * rules.teaching.extra_unit_price_cents_per_person
  );
}

// —— 高階：給桌頁使用 —— //
// 一般座位：每票在「結束」時計價
export function pricePerTicket(params: {
  tableName: string;
  area: string;
  startedAt: Date;
  endedAt: Date;
}) {
  const { rules, day } = resolvePlan({
    tableName: params.tableName,
    area: params.area,
    at: params.startedAt,
  });
  const mins = Math.max(
    1,
    differenceInMinutes(params.endedAt, params.startedAt)
  );
  const { perPersonCents, matchedHours } = computePerPersonTier(mins, rules);
  return {
    day,
    minutes: mins,
    price_cents: perPersonCents,
    meta: { mode: "per_person_tiers" as const, matchedHours },
  };
}

// 包廂：整桌在「結帳」時計價
export function priceForRoomSession(params: {
  tableName: string;
  area: string;
  sessionOpenedAt: Date;
  sessionEndedAt: Date;
  people: number;
  teaching: boolean;
}) {
  const { rules, day } = resolvePlan({
    tableName: params.tableName,
    area: params.area,
    at: params.sessionOpenedAt,
  });
  const mins = Math.max(
    1,
    differenceInMinutes(params.sessionEndedAt, params.sessionOpenedAt)
  );
  if (!params.teaching) {
    const r = computeRoomHourly(mins, rules);
    return {
      day,
      minutes: mins,
      total_cents: r.totalCents,
      meta: { mode: "room_hourly", billedHours: r.billedHours },
    };
  } else {
    const r = computeTeaching(mins, params.people, rules);
    return {
      day,
      minutes: mins,
      total_cents: r.totalCents,
      meta: {
        mode: "teaching",
        perPersonCents: r.perPersonCents,
        billedPeople: r.people,
      },
    };
  }
}
