export default function ReminderArt({ active }: { active: boolean }) {
  return (
    <svg className={`art art-reminder ${active ? 'art--active' : ''}`} viewBox="0 0 240 110" aria-hidden="true">
      <defs>
        <radialGradient id="reminder-glow" cx="50%" cy="55%" r="58%">
          <stop offset="0%" stopColor="#ffd166" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffd166" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="reminder-clock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="100%" stopColor="#f4c95d" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#reminder-glow)" />
      <g className="reminder-waves" fill="none" stroke="#ffd166" strokeWidth="3" strokeLinecap="round">
        <path d="M72 29 Q61 38 60 51" />
        <path d="M168 29 Q179 38 180 51" />
        <path d="M61 18 Q44 32 43 51" opacity="0.55" />
        <path d="M179 18 Q196 32 197 51" opacity="0.55" />
      </g>
      <g className="reminder-bells" fill="#eabf55" stroke="#fff0b5" strokeWidth="1.5">
        <path d="M78 35 Q75 18 91 14 Q105 12 108 25 L86 41 Z" />
        <path d="M162 35 Q165 18 149 14 Q135 12 132 25 L154 41 Z" />
      </g>
      <path d="M89 84 L79 98 M151 84 L161 98" stroke="#d5a83e" strokeWidth="7" strokeLinecap="round" />
      <circle cx="120" cy="59" r="40" fill="url(#reminder-clock)" stroke="#fff0b5" strokeWidth="3" />
      <circle cx="120" cy="59" r="32" fill="#202536" stroke="#d5a83e" strokeWidth="2" />
      <g stroke="#8f98ad" strokeWidth="2" strokeLinecap="round">
        <path d="M120 30 V34 M120 84 V88 M91 59 H95 M145 59 H149" />
        <path d="M100 39 L103 42 M137 76 L140 79 M100 79 L103 76 M137 42 L140 39" opacity="0.7" />
      </g>
      <g className="reminder-hands" stroke="#fff4c7" strokeLinecap="round">
        <path d="M120 59 V39" strokeWidth="3.5" />
        <path d="M120 59 L137 67" strokeWidth="4.5" />
      </g>
      <circle cx="120" cy="59" r="4" fill="#ffd166" />
      <g className="reminder-check" fill="none" stroke="#7ee2a0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="164" cy="78" r="13" fill="#202536" stroke="#3fb950" strokeWidth="2" />
        <path d="M158 78 L162 82 L170 73" />
      </g>
    </svg>
  )
}
