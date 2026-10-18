import type { ComponentProps } from "react";
import { type ButtonVariant, buttonClass } from "./button-class";

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />;
}
