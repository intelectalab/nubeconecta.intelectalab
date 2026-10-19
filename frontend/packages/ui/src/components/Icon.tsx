import type { FC } from 'react';

const IC: Record<string, string[]> = {
  home: ['p:M3 10.5 12 3l9 7.5', 'p:M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9'],
  users: ['c:9 8 4', 'p:M2 21a7 7 0 0 1 14 0', 'p:M16 4.1a4 4 0 0 1 0 7.8', 'p:M18 14.5a7 7 0 0 1 4 6.5'],
  user: ['c:12 8 4', 'p:M4 21a8 8 0 0 1 16 0'],
  globe: ['c:12 12 9', 'p:M3 12h18', 'p:M12 3a14 14 0 0 1 0 18', 'p:M12 3a14 14 0 0 0 0 18'],
  server: ['r:3 4 18 7 2', 'r:3 13 18 7 2', 'p:M7 7.5h.01', 'p:M7 16.5h.01', 'p:M11 7.5h6', 'p:M11 16.5h6'],
  cloud: ['p:M17.5 19H8a5.5 5.5 0 1 1 1.2-10.9A6.5 6.5 0 0 1 21 11.5a4 4 0 0 1-3.5 7.5z'],
  msg: ['p:M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  wallet: ['p:M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4', 'p:M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3', 'p:M21 12h-4a2 2 0 0 0 0 4h4z'],
  file: ['p:M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'p:M14 3v6h6', 'p:M8 13h8', 'p:M8 17h5'],
  funnel: ['p:M3 4h18l-7 8.5V19l-4 2v-8.5z'],
  sliders: ['p:M4 6h9', 'p:M17 6h3', 'c:15 6 2', 'p:M4 12h3', 'p:M11 12h9', 'c:9 12 2', 'p:M4 18h11', 'p:M19 18h1', 'c:17 18 2'],
  search: ['c:11 11 7', 'p:m20 20-3.6-3.6'],
  bell: ['p:M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'p:M10.3 21a2 2 0 0 0 3.4 0'],
  sun: ['c:12 12 4', 'p:M12 2v2', 'p:M12 20v2', 'p:m4.9 4.9 1.4 1.4', 'p:m17.7 17.7 1.4 1.4', 'p:M2 12h2', 'p:M20 12h2', 'p:m6.3 17.7-1.4 1.4', 'p:m19.1 4.9-1.4 1.4'],
  moon: ['p:M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  panel: ['r:3 3 18 18 2', 'p:M9 3v18', 'p:m15 10-2 2 2 2'],
  check: ['p:M20 6 9 17l-5-5'],
  tri: ['p:M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'p:M12 9v4', 'p:M12 17h.01'],
  oct: ['p:M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z', 'p:M12 8v4', 'p:M12 16h.01'],
  clock: ['c:12 12 9', 'p:M12 7v5l3 2'],
  plus: ['p:M12 5v14', 'p:M5 12h14'],
  refresh: ['p:M21 12a9 9 0 1 1-3-6.7L21 8', 'p:M21 3v5h-5'],
  shield: ['p:M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  card: ['r:2 5 20 14 2', 'p:M2 10h20', 'p:M6 15h4'],
  activity: ['p:M22 12h-4l-3 9L9 3l-3 9H2'],
  receipt: ['p:M5 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2z', 'p:M9 8h6', 'p:M9 12h6', 'p:M9 16h4'],
  lock: ['r:5 11 14 10 2', 'p:M8 11V7a4 4 0 0 1 8 0v4'],
  chart: ['p:M3 3v18h18', 'p:m7 15 4-4 3 3 5-6'],
  archive: ['r:2 4 20 5 1', 'p:M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9', 'p:M10 13h4'],
  restore: ['p:M3 12a9 9 0 1 0 3-6.7L3 8', 'p:M3 3v5h5', 'p:M12 7v5l3 2'],
  arrow: ['p:M5 12h14', 'p:m13 6 6 6-6 6'],
  cr: ['p:m9 18 6-6-6-6'],
  browser: ['r:3 4 18 16 2', 'p:M3 9h18', 'p:M7 6.5h.01', 'p:M10 6.5h.01'],
  database: ['e:12 5 9 3', 'p:M21 12c0 1.66-4 3-9 3s-9-1.34-9-3', 'p:M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5'],
  dot: ['c:12 12 3'],
};

export const Icon: FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
  const parts = IC[name] || IC.dot;
  return (
    <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {parts.map((s, idx) => {
        const k = s[0];
        const v = s.slice(2);
        if (k === 'p') return <path key={idx} d={v} />;
        const a = v.split(' ').map(Number);
        if (k === 'c') return <circle key={idx} cx={a[0]} cy={a[1]} r={a[2]} />;
        if (k === 'e') return <ellipse key={idx} cx={a[0]} cy={a[1]} rx={a[2]} ry={a[3]} />;
        if (k === 'r') return <rect key={idx} x={a[0]} y={a[1]} width={a[2]} height={a[3]} rx={a[4] || 0} />;
        return null;
      })}
    </svg>
  );
};
