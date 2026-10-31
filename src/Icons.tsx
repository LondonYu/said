const paths = {
  home: 'm3 10 9-7 9 7v10h-6v-7H9v7H3Z',
  plus: 'M12 4v16M4 12h16',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  user: 'M4 21v-2a8 8 0 0 1 16 0v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  menu: 'M5 8h14M5 16h14',
  settings: 'M3 6h18M3 12h18M3 18h18M8 4v4M16 10v4M9 16v4',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z',
  monitor: 'M3 4h18v13H3ZM8 21h8M12 17v4',
  check: 'm5 12 4 4L19 6',
} as const;
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}
