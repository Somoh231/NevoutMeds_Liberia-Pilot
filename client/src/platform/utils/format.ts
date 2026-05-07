export const fmt = (n: number, d = 2) => `$${Number(n).toFixed(d)}`;

export const fmtK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt(n, 0));

