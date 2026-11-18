/** Axonometric vault drawn from planes, mesh lines and registration marks. */
const p = (x: number, y: number, z: number) => [230 + (x - y) * 5.45, 120 + (x + y) * 2.1 - z];
const pt = (a: number[]) => a.map((x) => x.toFixed(2)).join(',');
const plane = (s: number, z: number) =>
  [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ]
    .map(([x, y]) => pt(p(x, y, z)))
    .join(' ');
function Line({
  a,
  b,
  ...props
}: {
  a: number[];
  b: number[];
  stroke?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeDasharray?: string;
}) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...props} />;
}
function Plate({ z, top }: { z: number; top?: boolean }) {
  const s = 10,
    depth = 13;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <polygon points={plane(s, z - depth)} fill="#192b20" stroke="#71ab58" strokeWidth=".8" />
      <polygon
        points={[
          [s, -s, z],
          [s, s, z],
          [s, s, z - depth],
          [s, -s, z - depth],
        ]
          .map((a) => pt(p(a[0], a[1], a[2])))
          .join(' ')}
        fill="url(#face-r)"
        stroke="#8dce6f"
        strokeWidth=".9"
      />
      <polygon
        points={[
          [-s, s, z],
          [s, s, z],
          [s, s, z - depth],
          [-s, s, z - depth],
        ]
          .map((a) => pt(p(a[0], a[1], a[2])))
          .join(' ')}
        fill="url(#face-l)"
        stroke="#9ade7b"
        strokeWidth=".9"
      />
      {Array.from({ length: 30 }, (_, n) => -9.7 + n * 0.66).map((v, i) => (
        <g
          key={i}
          stroke="#a0da77"
          opacity={i % 4 === 0 ? 0.68 : 0.27}
          strokeWidth={i % 4 === 0 ? 1.2 : 0.6}
        >
          <Line a={p(v, s, z - 3)} b={p(v, s, z - 8)} />
          <Line a={p(s, v, z - 3)} b={p(s, v, z - 8)} />
        </g>
      ))}
      <polygon
        points={plane(s, z)}
        stroke={top ? '#bbff8d' : '#8ed06e'}
        strokeWidth="1.35"
        fill={top ? 'url(#face-top)' : '#223b2b'}
      />
      {Array.from({ length: 15 }, (_, i) => -8.75 + i * 1.25).map((v, i) => (
        <g
          key={i}
          stroke="#91d674"
          strokeWidth={i % 2 === 0 ? 0.45 : 0.65}
          opacity={i % 2 === 0 ? 0.36 : 0.56}
        >
          <Line a={p(v, -s, z)} b={p(v, s, z)} />
          <Line a={p(-s, v, z)} b={p(s, v, z)} />
        </g>
      ))}
      <polygon
        points={plane(8.65, z + 0.1)}
        stroke="#92d674"
        strokeOpacity=".65"
        strokeWidth=".8"
        fill="none"
      />
      {top && (
        <g>
          <polygon
            points={plane(5.8, z + 0.5)}
            fill="#2f5234"
            fillOpacity=".8"
            stroke="#a8f086"
            strokeWidth=".8"
          />
          <polygon points={plane(4.7, z + 1.4)} fill="none" stroke="#a8ee86" strokeWidth=".6" />
          {[-2, 0, 2].map((v, i) => (
            <polygon
              key={i}
              points={[
                [v - 1.3, -2.3],
                [v - 0.4, -2.3],
                [v + 1.6, 2.3],
                [v + 0.7, 2.3],
              ]
                .map(([a, b]) => pt(p(a, b, z + 1.5)))
                .join(' ')}
              fill="#b6f691"
              fillOpacity=".86"
            />
          ))}
        </g>
      )}
      {[
        [s, s],
        [-s, s],
        [s, -s],
        [-s, -s],
      ].map(([x, y], i) => (
        <circle key={i} cx={p(x, y, z)[0]} cy={p(x, y, z)[1]} r="1.8" fill="#c9ffa6" />
      ))}
    </g>
  );
}
export function VaultArt() {
  return (
    <div className="vault-art" aria-hidden="true">
      <svg viewBox="0 0 410 214" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="face-top" x1="0" x2="1" y1="1" y2="0">
            <stop stopColor="#2c4b32" />
            <stop offset=".54" stopColor="#3e6540" />
            <stop offset="1" stopColor="#24452e" />
          </linearGradient>
          <linearGradient id="face-l">
            <stop stopColor="#416b41" />
            <stop offset="1" stopColor="#2c4930" />
          </linearGradient>
          <linearGradient id="face-r">
            <stop stopColor="#294b30" />
            <stop offset="1" stopColor="#3e6740" />
          </linearGradient>
          <radialGradient id="halo">
            <stop stopColor="#76e955" stopOpacity=".16" />
            <stop offset="1" stopColor="#76e955" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="231" cy="122" rx="172" ry="111" fill="url(#halo)" />
        <g stroke="#78b964" strokeWidth=".6" opacity=".19">
          {Array.from({ length: 17 }, (_, i) => -24 + i * 3).map((i) => (
            <g key={i}>
              <Line a={p(i, -22, -20)} b={p(i, 22, -20)} />
              <Line a={p(-22, i, -20)} b={p(22, i, -20)} />
            </g>
          ))}
        </g>
        <polygon
          points={plane(10, -23)}
          fill="#223623"
          fillOpacity=".45"
          stroke="#7fbd63"
          strokeWidth=".7"
          strokeDasharray="2 4"
        />
        <g stroke="#9ddb78" strokeWidth=".7" strokeDasharray="2 3" opacity=".68">
          {[
            [-10, -10],
            [10, -10],
            [-10, 10],
            [10, 10],
          ].map(([a, b]) => (
            <Line key={`${a},${b}`} a={p(a, b, 69)} b={p(a, b, -25)} />
          ))}
        </g>
        <Plate z={-11} />
        <Plate z={24} />
        <Plate z={59} top />
        <g fill="none" stroke="#83b66c" strokeWidth=".65" opacity=".75">
          <path d="m121 61-21-16H72" />
          <circle cx="71" cy="45" r="1.8" />
          <path d="m339 131 14 9h23" />
          <circle cx="377" cy="140" r="1.6" />
          <path d="m214 169-31 16h-42" strokeDasharray="2 3" />
        </g>
        <g fontSize="6.8" fontFamily="monospace" fill="#8aae7b" letterSpacing="1">
          <text x="60" y="37">
            LAYER_03
          </text>
          <text x="337" y="152">
            NODE.01
          </text>
        </g>
        <g stroke="#83a879" strokeWidth=".8" opacity=".64">
          {[
            [88, 19],
            [366, 30],
            [89, 160],
            [357, 186],
          ].map(([x, y]) => (
            <path key={x + ',' + y} d={`M${x - 3} ${y}h6m-3 -3v6`} />
          ))}
        </g>
      </svg>
      <span className="figure-tag">
        FIG. 01 <b>/</b> VAULT CORE
      </span>
    </div>
  );
}
