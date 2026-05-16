export const FREE_PERIOD_END = new Date('2026-07-01T23:59:59Z');
export const isFreePeriodActive = () => new Date() < FREE_PERIOD_END;
