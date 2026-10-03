/** Утренняя газета на фоне восходящего солнца, внизу бегущая строка тем дайджеста. */
export default function NewsArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-news ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <linearGradient id="news-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b2a5a" stopOpacity="0.0" />
          <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="news-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="70%" stopColor="#ffb347" />
          <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0" />
        </radialGradient>
        <clipPath id="news-clip">
          <rect x="0" y="0" width="240" height="92" />
        </clipPath>
        <clipPath id="news-ticker-clip">
          <rect x="0" y="94" width="240" height="16" />
        </clipPath>
      </defs>
      <rect width="240" height="92" fill="url(#news-sky)" />
      <g clipPath="url(#news-clip)">
        <circle className="news-sun" cx="168" cy="70" r="30" fill="url(#news-sun)" />
      </g>

      {/* газета */}
      <g className="news-paper">
        <path d="M70 18 h86 v66 h-86 z" fill="#f4efe6" />
        <path d="M156 18 l8 6 v66 l-8 -6z" fill="#d8d0c2" />
        <rect x="76" y="24" width="74" height="8" fill="#2a2a2a" />
        <rect x="76" y="37" width="34" height="22" fill="#c9bfae" />
        <path d="M114 39 h36 M114 45 h36 M114 51 h30 M114 57 h34 M76 65 h74 M76 71 h70 M76 77 h60" stroke="#8a8478" strokeWidth="2.5" />
      </g>

      {/* бегущая строка */}
      <rect x="0" y="94" width="240" height="16" fill="#1a1d26" />
      <g clipPath="url(#news-ticker-clip)">
        <text className="news-ticker" x="0" y="106" fontSize="10" fill="#ffb347" fontWeight="600">
          БАНКИ • IT • ИИ • КИБЕРБЕЗ • ЦБ • СТАРТАПЫ • БАНКИ • IT • ИИ • КИБЕРБЕЗ • ЦБ • СТАРТАПЫ •
        </text>
      </g>
    </svg>
  )
}
