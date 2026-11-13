interface StatCounterProps {
  value: string
  label: string
}

export default function StatCounter({ value, label }: StatCounterProps) {
  return (
    <div className="text-center">
      <div className="text-gradient-brand whitespace-nowrap text-3xl font-bold tabular-nums sm:text-4xl">
        <span className="sr-only">{value}</span>
        <span aria-hidden="true" data-stat-value={value}>{value}</span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground sm:text-base">{label}</div>
    </div>
  )
}
