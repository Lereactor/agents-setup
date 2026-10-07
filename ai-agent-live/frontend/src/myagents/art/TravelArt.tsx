/** Небо в бирюзовой палитре: плывут облака, по рельсам катится поезд; при работе
 *  пролетает самолёт, поезд ускоряется и выпрыгивает билет. */
export default function TravelArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-trav ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="trav-glow" cx="50%" cy="80%" r="65%">
          <stop offset="0%" stopColor="#26c6da" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#26c6da" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="trav-train" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8f7fa" />
          <stop offset="100%" stopColor="#9fd9e3" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#trav-glow)" />

      {/* облака */}
      <g className="trav-cloud trav-cloud--1" fill="#cfeff5" opacity="0.35">
        <ellipse cx="50" cy="26" rx="18" ry="7" />
        <ellipse cx="62" cy="22" rx="11" ry="7" />
      </g>
      <g className="trav-cloud trav-cloud--2" fill="#cfeff5" opacity="0.28">
        <ellipse cx="180" cy="18" rx="16" ry="6" />
        <ellipse cx="190" cy="14" rx="9" ry="6" />
      </g>

      {/* самолёт — при работе пролетает через всё небо */}
      <g className="trav-plane">
        <path d="M150 38 l26 -4 6 -8 4 1 -3 8 14 -2 4 -5 3 1 -2 6 2 5 -3 1 -4 -4 -14 -1 3 8 -4 1 -6 -8 -26 -3z" fill="#ffffff" opacity="0.9" />
        <path className="trav-trail" d="M100 40 h46" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.4" />
      </g>

      {/* билет — выпрыгивает при работе */}
      <g className="trav-ticket">
        <rect x="104" y="30" width="34" height="18" rx="3" fill="#ffd166" />
        <circle cx="104" cy="39" r="3" fill="#0f1320" />
        <circle cx="138" cy="39" r="3" fill="#0f1320" />
        <path d="M112 36 h18 M112 41 h12" stroke="#8a6a1a" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* рельсы и шпалы */}
      <path d="M0 98 h240" stroke="#5f7a86" strokeWidth="2" />
      <path className="trav-sleepers" d="M0 102 h240" stroke="#5f7a86" strokeWidth="3" strokeDasharray="3 9" opacity="0.6" />

      {/* поезд */}
      <g className="trav-train">
        <path d="M58 70 h92 q22 0 30 20 v6 h-122 z" fill="url(#trav-train)" />
        <rect x="58" y="88" width="122" height="5" fill="#26c6da" />
        <rect x="66" y="75" width="14" height="9" rx="2" fill="#2a4a5a" />
        <rect x="86" y="75" width="14" height="9" rx="2" fill="#2a4a5a" />
        <rect x="106" y="75" width="14" height="9" rx="2" fill="#2a4a5a" />
        <rect x="126" y="75" width="14" height="9" rx="2" fill="#2a4a5a" />
        <path d="M152 74 h14 q8 2 12 12 h-26 z" fill="#2a4a5a" />
        <circle cx="76" cy="96" r="3.5" fill="#33434d" />
        <circle cx="96" cy="96" r="3.5" fill="#33434d" />
        <circle cx="146" cy="96" r="3.5" fill="#33434d" />
        <circle cx="166" cy="96" r="3.5" fill="#33434d" />
      </g>
    </svg>
  )
}
