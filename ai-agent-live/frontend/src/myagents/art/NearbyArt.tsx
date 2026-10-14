/** Кусочек городской карты: кварталы, улицы, точки кафе; посередине булавка.
 *  При работе булавка подпрыгивает, от неё расходятся круги поиска, точки мест загораются. */
export default function NearbyArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-near ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="near-glow" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#f06292" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f06292" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="110" fill="url(#near-glow)" />

      {/* кварталы */}
      <g fill="#3a3f55" opacity="0.85">
        <rect x="18" y="12" width="58" height="34" rx="4" />
        <rect x="88" y="12" width="64" height="34" rx="4" />
        <rect x="164" y="12" width="58" height="34" rx="4" />
        <rect x="18" y="60" width="58" height="38" rx="4" />
        <rect x="164" y="60" width="58" height="38" rx="4" />
      </g>
      <rect x="88" y="60" width="64" height="38" rx="4" fill="#2f5a46" opacity="0.8" />
      {/* улицы */}
      <path d="M0 53 h240 M82 0 v110 M158 0 v110" stroke="#59607a" strokeWidth="3" strokeDasharray="7 6" />

      {/* места рядом */}
      <g className="near-spots">
        <circle className="near-spot" cx="48" cy="29" r="4" />
        <circle className="near-spot near-spot--2" cx="192" cy="78" r="4" />
        <circle className="near-spot near-spot--3" cx="196" cy="28" r="4" />
        <circle className="near-spot near-spot--4" cx="44" cy="80" r="4" />
      </g>

      {/* круги поиска */}
      <circle className="near-ring" cx="120" cy="76" r="10" />
      <circle className="near-ring near-ring--2" cx="120" cy="76" r="10" />

      {/* булавка */}
      <g className="near-pin">
        <path d="M120 78 c-11 -14 -16 -21 -16 -30 a16 16 0 0 1 32 0 c0 9 -5 16 -16 30z" fill="#f06292" />
        <circle cx="120" cy="47" r="6" fill="#2a2235" />
      </g>
      <ellipse cx="120" cy="80" rx="7" ry="2.2" fill="#000" opacity="0.35" />
    </svg>
  )
}
