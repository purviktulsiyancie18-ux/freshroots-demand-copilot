import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 disabled:bg-brand-700/45 disabled:shadow-none",
  outline: "border border-slate-300/80 bg-white text-slate-800 shadow-sm shadow-slate-900/5 hover:border-slate-400 hover:bg-slate-50 disabled:text-slate-400 disabled:shadow-none",
  ghost: "text-slate-700 hover:bg-slate-900/5",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
} as const;
const sizes = { default: "h-9 px-4 text-sm", sm: "h-8 px-3 text-xs", lg: "h-11 px-6 text-sm" } as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const buttonClass = (variant: keyof typeof variants = "default", size: keyof typeof sizes = "default", className?: string) =>
  cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed active:translate-y-px",
    variants[variant],
    sizes[size],
    className,
  );

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "default", ...props }, ref) => (
  <button ref={ref} className={buttonClass(variant, size, className)} {...props} />
));
Button.displayName = "Button";
