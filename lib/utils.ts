import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge cannot know that the project's `--text-*` scale (text-ui,
 * text-control, …) is a FONT SIZE, so it classifies those classes as text
 * COLOURS and drops any real colour class merged alongside them. That silently
 * stripped `text-primary-foreground` off every primary Button, leaving ink on
 * olive at 2.29:1. Declaring the group restores the distinction.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["tick", "meta", "ui", "control", "body", "title", "display"],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
