import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useRipple } from "@/components/ui/ripple"
import { hapticFeedback } from "@/lib/haptics"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/90 shadow-md hover:shadow-xl",
        outline: "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background shadow-sm hover:shadow-md",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 rounded-md px-4",
        lg: "h-12 rounded-md px-8 text-base",
        xl: "h-14 rounded-md px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, onMouseDown, onTouchStart, ...props }, ref) => {
    const { createRipple, RippleContainer } = useRipple()

    // When asChild is true, render a clean Slot with no custom behavior
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        />
      )
    }

    const handleInteraction = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
      hapticFeedback('light')
      createRipple(event)
      if ('touches' in event && onTouchStart) {
        onTouchStart(event as React.TouchEvent<HTMLButtonElement>)
      } else if (!('touches' in event) && onMouseDown) {
        onMouseDown(event as React.MouseEvent<HTMLButtonElement>)
      }
    }

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (onClick) {
        onClick(event)
      }
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        onMouseDown={handleInteraction}
        onTouchStart={handleInteraction}
        {...props}
      >
        {props.children}
        <RippleContainer />
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }



// ─── Liquid Glass Button ──────────────────────────────────────────────────────
// A glossy dark pill button with glass-like specular highlights.
// Works on any background — light, dark, or gradient.

export const liquidButtonVariants = cva(
  [
    "relative inline-flex items-center justify-center cursor-pointer gap-2",
    "whitespace-nowrap rounded-full font-medium",
    "transition-all duration-200 ease-out",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground/50",
    "overflow-hidden select-none",
    // Dark pill base — works on any background
    "bg-[#0f0f0f] dark:bg-[#f5f5f5]",
    "text-[#f5f5f5] dark:text-[#0f0f0f]",
    // Border: thin dark edge + inner light rim via box-shadow
    "border border-black/20 dark:border-white/20",
    "shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.3)]",
    "dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.1)]",
    // Hover & active
    "hover:scale-[1.03] hover:shadow-[0_4px_16px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-1px_0_rgba(0,0,0,0.3)]",
    "dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(0,0,0,0.08)]",
    "active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      size: {
        sm:      "h-8 px-4 text-xs",
        default: "h-10 px-5 text-sm",
        lg:      "h-11 px-7 text-sm",
        xl:      "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidButtonVariants> {
  asChild?: boolean
}

export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, size, asChild = false, children, ...props }, ref) => {
    const Comp = (asChild ? Slot : "button") as React.ElementType
    return (
      <Comp
        ref={ref}
        className={cn(liquidButtonVariants({ size, className }))}
        {...props}
      >
        {/* Top gloss streak — the "glass" shine */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] top-0 h-[45%] rounded-b-full bg-gradient-to-b from-white/20 to-transparent"
        />
        {/* Content sits above the gloss */}
        <span className="relative z-10 flex items-center gap-2">
          {children}
        </span>
      </Comp>
    )
  }
)
LiquidButton.displayName = "LiquidButton"
