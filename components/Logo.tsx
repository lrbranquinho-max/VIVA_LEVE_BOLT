export default function Logo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 130" className="w-full h-auto">
      <defs>
        <linearGradient id="roxoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>

        <linearGradient id="verdeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      <g transform="translate(20, 20)">
        <path d="M10,10 L40,80 L70,10" fill="none" stroke="url(#roxoGradient)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />

        <path d="M70,10 L70,80 L110,80" fill="none" stroke="url(#verdeGradient)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M110,80 C125,80 130,65 120,55 C110,45 95,50 95,65" fill="url(#verdeGradient)" opacity="0.9" />
      </g>
      <text x="170" y="75" fontFamily="system-ui, -apple-system, sans-serif" fontSize="46" fontWeight="900" fill="#4C1D95" letterSpacing="-1">VIVA</text>
      <text x="285" y="75" fontFamily="system-ui, -apple-system, sans-serif" fontSize="46" fontWeight="900" fill="#10B981" letterSpacing="-1">LEVE</text>

      <text x="172" y="102" fontFamily="system-ui, -apple-system, sans-serif" fontSize="13" fontWeight="700" fill="#64748B" letterSpacing="3.5">SAÚDE E PRATICIDADE</text>
    </svg>
  );
}
