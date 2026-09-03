import * as React from "react"
import { ResponsiveContainer } from "recharts"

import { cn } from "@/lib/utils"

type ChartContainerProps = {
  children: React.ComponentProps<typeof ResponsiveContainer>["children"]
  className?: string
  height?: number | string
}

function ChartContainer({
  children,
  className,
  height = 300,
}: ChartContainerProps) {
  return (
    <div
      data-slot="chart-container"
      className={cn("w-full", className)}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export { ChartContainer }
