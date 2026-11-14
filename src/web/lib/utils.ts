import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Helper standar shadcn: gabung className + resolusi konflik Tailwind (generated). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
