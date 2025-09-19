export type PricingRule = { unitMinutes: number; unitPriceCents: number };

export const defaultPricing: PricingRule = {
  unitMinutes: 60,
  unitPriceCents: 50 * 100, // 例：每 30 分鐘 50 元
};

export function computePriceCents(
  totalMinutes: number,
  rule: PricingRule = defaultPricing
) {
  const units = Math.ceil(totalMinutes / rule.unitMinutes);
  return units * rule.unitPriceCents;
}
