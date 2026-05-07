export const daysUntilExpiry = (d: string) => Math.ceil((new Date(d).getTime() - new Date().getTime()) / 86400000);

export const daysUntilStockout = (s: number, v: number) => (v <= 0 ? 999 : Math.floor(s / v));

