// Magic UI "border-beam", adapted to pure CSS (offset-path + keyframes in globals.css) so it
// needs no `motion` runtime and adds no JS animation loop while recording.
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

interface BorderBeamProps {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  className?: string
  style?: CSSProperties
  reverse?: boolean
  initialOffset?: number
  borderWidth?: number
}

export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => (
  <div
    className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
    style={{ "--border-beam-width": `${borderWidth}px` } as CSSProperties}
  >
    <div
      className={cn(
        "animate-border-beam absolute aspect-square",
        "bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent",
        className
      )}
      style={
        {
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--beam-from": `${initialOffset}%`,
          "--beam-to": `${100 + initialOffset}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${-delay}s`,
          animationDirection: reverse ? "reverse" : "normal",
          ...style,
        } as CSSProperties
      }
    />
  </div>
)
