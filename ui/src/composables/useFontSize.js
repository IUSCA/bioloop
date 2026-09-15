/**
 * The text size a user picks on the profile page, saved in this browser's local storage and
 * applied as the root font size, which every rem-based size in the UI follows.
 * @see docs/contributing/v2-design-system.md - Typography
 */
import { useStorage } from "@vueuse/core";
import { watchEffect } from "vue";

/** The sizes offered, each a scale of the browser's default root font size. */
export const FONT_SIZES = [
  { value: "small", label: "Small", rootFontSize: "100%" },
  { value: "medium", label: "Medium", rootFontSize: "110%" },
  { value: "large", label: "Large", rootFontSize: "120%" },
];

// Module scope, so the selector and the root read and write one ref.
const fontSize = useStorage("font-size", "small");

/** @returns {import("vue").Ref<string>} the selected size's `value`, writable */
export function useFontSize() {
  return fontSize;
}

/**
 * Keeps `<html>`'s font size in step with the saved choice. Call once, from App.vue.
 * A stored value that names no size leaves the browser default in place.
 */
export function applyFontSize() {
  watchEffect(() => {
    const size = FONT_SIZES.find((s) => s.value === fontSize.value);
    document.documentElement.style.fontSize = size?.rootFontSize ?? "";
  });
}
