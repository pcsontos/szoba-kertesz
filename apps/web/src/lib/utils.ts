import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** A shadcn osztály-összefésülője: feltételes osztályok + Tailwind-ütközés-feloldás. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
