"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useResolvedTheme } from "@/hooks/use-theme"

// Electron app: follows the app's own theme setting (System / Light / Dark), no next-themes.
// Styled with the app's shadcn tokens (popover surface, muted description, outline buttons) rather
// than sonner's saturated "richColors", so notices read calmly over the phone mirror.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      visibleToasts={3}
      gap={6}
      offset={14}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-muted-foreground" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!w-[360px] !rounded-lg !border !border-border !bg-popover/95 !text-popover-foreground !shadow-lg !backdrop-blur-md !items-center !gap-2 !px-3 !py-2",
          title: "!line-clamp-1 !text-[12px] !font-medium !leading-tight",
          description: "!text-[11px] !leading-snug !text-muted-foreground",
          icon: "!self-start !mt-px",
          actionButton:
            "!h-6 !shrink-0 !rounded-md !border !border-border !bg-background !px-2 !text-[11px] !font-medium !text-foreground hover:!bg-accent",
          cancelButton: "!h-6 !rounded-md !bg-transparent !px-2 !text-[11px] !text-muted-foreground",
          closeButton: "!border-border !bg-popover !text-muted-foreground hover:!text-foreground",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
