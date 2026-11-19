export default function DocumentArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-document ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="document-glow" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor="#64d8cb" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#64d8cb" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="document-page" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2fffd" />
          <stop offset="100%" stopColor="#b9eae4" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#document-glow)" />
      <g className="document-back" opacity="0.45">
        <path d="M67 20 H129 L149 40 V94 H67 Z" fill="#4c8f8a" stroke="#8de7dc" strokeWidth="1.5" />
      </g>
      <g className="document-page">
        <path d="M80 10 H142 L164 32 V92 H80 Z" fill="url(#document-page)" stroke="#e6fffb" strokeWidth="2" />
        <path d="M142 10 V32 H164" fill="#8ed8cf" stroke="#e6fffb" strokeWidth="2" strokeLinejoin="round" />
        <rect x="92" y="24" width="35" height="6" rx="2" fill="#2b756e" />
        <g stroke="#62a9a2" strokeWidth="3" strokeLinecap="round">
          <path d="M93 44 H146 M93 54 H140 M93 64 H147 M93 74 H127" />
        </g>
        <path d="M94 82 L99 86 L108 78" fill="none" stroke="#2b9b76" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="document-lens">
        <circle cx="155" cy="67" r="19" fill="#20343dcc" stroke="#8ffff0" strokeWidth="4" />
        <path d="M169 81 L184 96" stroke="#8ffff0" strokeWidth="7" strokeLinecap="round" />
        <path d="M146 63 H162 M146 70 H158" stroke="#c5fff7" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="document-sparks" stroke="#9ffff2" strokeWidth="2" strokeLinecap="round">
        <path d="M177 24 V34 M172 29 H182" />
        <path d="M58 62 V70 M54 66 H62" opacity="0.65" />
      </g>
    </svg>
  )
}
