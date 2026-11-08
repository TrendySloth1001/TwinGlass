import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border px-[3px] transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[22px] data-[size=default]:w-10 data-[size=sm]:h-4 data-[size=sm]:w-7 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=unchecked]:border-border-strong data-[state=unchecked]:bg-transparent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0 transition-transform duration-200 ease-[var(--ease-spring)] group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5 data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-muted-foreground group-data-[size=sm]/switch:data-[state=checked]:translate-x-[11px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
