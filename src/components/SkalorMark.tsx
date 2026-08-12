export function SkalorMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} fill="none" aria-hidden="true">
      {/* rising slash */}
      <path d="M2 30.5 L45.5 2" stroke="#E01A2B" strokeWidth="2.6" strokeLinecap="square" />
      {/* four white bars */}
      <path d="M2 32h6.6v6H2z" fill="#F2F2F0" />
      <path d="M10.9 25.4h6.6V38h-6.6z" fill="#F2F2F0" />
      <path d="M19.8 18.6h6.6V38h-6.6z" fill="#F2F2F0" />
      <path d="M28.7 11.8h6.6V38h-6.6z" fill="#F2F2F0" />
      {/* red bar */}
      <path d="M37.6 5h6.6v33h-6.6z" fill="#E01A2B" />
    </svg>
  );
}
