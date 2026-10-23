// Simple generic drawings used when a unit has no photo uploaded yet.

export function EquipmentArt({ kind, className }: { kind: string; className?: string }) {
  if (kind === "heat_pump_water_heater") return <WaterHeater className={className} />;
  if (kind === "air_handler" || kind === "furnace") return <AirHandler className={className} />;
  return <Condenser className={className} />;
}

function Condenser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 140" role="img" aria-label="Heat pump outdoor unit">
      <rect x="20" y="18" width="120" height="104" rx="8" fill="#eef1f5" stroke="#9aa6b6" strokeWidth="3" />
      <rect x="20" y="18" width="120" height="14" rx="6" fill="#d7dde6" />
      <circle cx="72" cy="78" r="34" fill="#fff" stroke="#9aa6b6" strokeWidth="3" />
      {[0, 60, 120].map((r) => (
        <path key={r} d="M72 78 q14 -20 0 -30 q-6 14 0 30" fill="#b7c1ce" transform={`rotate(${r} 72 78)`} />
      ))}
      <circle cx="72" cy="78" r="5" fill="#7a8696" />
      <rect x="114" y="46" width="16" height="60" rx="3" fill="#d7dde6" />
      <rect x="30" y="122" width="16" height="8" rx="2" fill="#9aa6b6" />
      <rect x="114" y="122" width="16" height="8" rx="2" fill="#9aa6b6" />
    </svg>
  );
}

function AirHandler({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 140" role="img" aria-label="Air handler">
      <rect x="50" y="8" width="60" height="124" rx="6" fill="#eef1f5" stroke="#9aa6b6" strokeWidth="3" />
      <rect x="58" y="18" width="44" height="48" rx="3" fill="#fff" stroke="#b7c1ce" strokeWidth="2" />
      <rect x="58" y="74" width="44" height="48" rx="3" fill="#fff" stroke="#b7c1ce" strokeWidth="2" />
      {[30, 40, 50].map((y) => <line key={y} x1="64" x2="96" y1={y} y2={y} stroke="#cfd6df" strokeWidth="3" />)}
    </svg>
  );
}

function WaterHeater({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 140" role="img" aria-label="Heat pump water heater">
      <rect x="52" y="8" width="56" height="30" rx="12" fill="#d7dde6" stroke="#9aa6b6" strokeWidth="3" />
      <rect x="52" y="30" width="56" height="98" rx="10" fill="#eef1f5" stroke="#9aa6b6" strokeWidth="3" />
      {[16, 22, 28].map((y) => <line key={y} x1="62" x2="98" y1={y} y2={y} stroke="#9aa6b6" strokeWidth="2" />)}
      <rect x="70" y="52" width="20" height="12" rx="2" fill="#fff" stroke="#b7c1ce" strokeWidth="2" />
      <rect x="66" y="2" width="6" height="10" fill="#9aa6b6" />
      <rect x="88" y="2" width="6" height="10" fill="#9aa6b6" />
    </svg>
  );
}
