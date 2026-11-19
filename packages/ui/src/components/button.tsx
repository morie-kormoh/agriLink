import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border bg-card shadow-xs hover:bg-secondary hover:text-secondary-foreground dark:border-input dark:bg-input/30",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        accent: "bg-accent text-accent-foreground shadow-xs hover:bg-accent/85",
        ghost: "hover:bg-secondary hover:text-secondary-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        brand: "bg-indigo text-white shadow-xs hover:bg-indigo/90",
      },
      size: {
        default: "h-12 px-4 py-2 md:h-10 has-[>svg]:px-3",
        sm: "h-10 gap-1.5 rounded-lg px-3 md:h-8 has-[>svg]:px-2.5",
        lg: "h-14 rounded-xl px-6 text-base has-[>svg]:px-4",
        icon: "size-12 md:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
