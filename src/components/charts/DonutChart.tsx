export type DonutSegment = { key: string; value: number; color: string };

type DonutChartProps = {
  segments: readonly DonutSegment[];
  label: string;
  centerValue: string;
  centerCaption?: string;
  size?: number;
  thickness?: number;
};

/** Rosca em SVG com pequenos espaços entre fatias. Decorativa para leitores de tela além do rótulo. */
export function DonutChart({ segments, label, centerValue, centerCaption, size = 120, thickness = 14 }: DonutChartProps) {
  const total = segments.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? Math.min(2, circumference * 0.01) : 0;
  let offset = 0;
  return <div className="donut" style={{ width: size, height: size }} role="img" aria-label={label}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} className="donut-track" strokeWidth={thickness} fill="none" />
      {total > 0 && segments.map((segment) => {
        const length = (Math.max(0, segment.value) / total) * circumference;
        const dash = Math.max(0, length - gap);
        const element = <circle key={segment.key} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness}
          style={{ stroke: segment.color }} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        offset += length;
        return element;
      })}
    </svg>
    <span className="donut-center" aria-hidden="true"><strong>{centerValue}</strong>{centerCaption && <small>{centerCaption}</small>}</span>
  </div>;
}

