interface StatCounterProps {
  value: string
  label: string
}

export default function StatCounter({ value, label }: StatCounterProps) {
  return (
    <div className="text-center">
      <div className="bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#EC4899] bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
        {value}
      </div>
      <div className="mt-1 text-sm text-muted-foreground sm:text-base">{label}</div>
    </div>
  )
}
