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
// True glass effect: transparent with SVG distortion + specular highlight.
// Requires a non-white background behind it to read properly.

export const liquidButtonVariants = cva(
  [
    "relative inline-flex items-center justify-center cursor-pointer gap-2",
    "whitespace-nowrap rounded-full font-medium text-sm",
    "transition-all duration-700 overflow-hidden",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "outline-none",
    // Hover scale with bouncy easing via CSS
    "hover:scale-105 active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      size: {
        sm:      "h-8 px-5 text-xs",
        default: "h-10 px-6 text-sm",
        lg:      "h-11 px-8 text-sm",
        xl:      "h-13 px-10 text-base",
      },
    },
    defaultVariants: { size: "default" },
  }
)

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidButtonVariants> {
  asChild?: boolean
}

export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, size, asChild = false, children, style, ...props }, ref) => {
    const Comp = (asChild ? Slot : "button") as React.ElementType
    return (
      <Comp
        ref={ref}
        className={cn(liquidButtonVariants({ size, className }))}
        style={{
          boxShadow: "0 6px 6px rgba(0,0,0,0.2), 0 0 20px rgba(0,0,0,0.1)",
          transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
          color: "inherit",
          ...style,
        }}
        {...props}
      >
        {/* Layer 1: backdrop blur + SVG glass distortion */}
        <div
          className="absolute inset-0 z-0 overflow-hidden rounded-full"
          style={{
            backdropFilter: "blur(3px)",
            filter: "url(#glass-distortion)",
            isolation: "isolate",
          }}
        />
        {/* Layer 2: white tint */}
        <div
          className="absolute inset-0 z-10 rounded-full"
          style={{ background: "rgba(255,255,255,0.25)" }}
        />
        {/* Layer 3: inner rim highlight */}
        <div
          className="absolute inset-0 z-20 rounded-full"
          style={{
            boxShadow:
              "inset 2px 2px 1px 0 rgba(255,255,255,0.5), inset -1px -1px 1px 1px rgba(255,255,255,0.5)",
          }}
        />
        {/* Content */}
        <span className="relative z-30 flex items-center gap-2">
          {children}
        </span>
      </Comp>
    )
  }
)
LiquidButton.displayName = "LiquidButton"
