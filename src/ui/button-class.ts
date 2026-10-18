export type ButtonVariant = keyof typeof variants;

// For a link that looks like a button, too.
export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors disabled:opacity-50 ${variants[variant]}`;
}

const variants = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
};
