export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="aava-mark" x1="8" y1="8" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7BFFDF" />
          <stop offset="0.58" stopColor="#56D9C1" />
          <stop offset="1" stopColor="#6A8DFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="10" fill="#071A20" stroke="rgba(255,255,255,.12)" />
      <path d="M10 24.8 18 8.8l8 16" stroke="url(#aava-mark)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 19.8h10" stroke="url(#aava-mark)" strokeWidth="2.2" strokeLinecap="round" opacity=".78" />
      <path d="M6.5 29c3.9-1.5 7.8-1.5 11.5 0s7.6 1.5 11.5 0" stroke="#72F5D1" strokeWidth="1.35" strokeLinecap="round" opacity=".7" />
      <circle cx="27" cy="8.4" r="2.15" fill="#F2C66D" />
    </svg>
  );
}
