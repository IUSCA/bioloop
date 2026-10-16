import { Icon } from "@iconify/vue";
import { createIconsConfig } from "vuestic-ui";

export const vuesticIcons = createIconsConfig({
  fonts: [
    {
      name: "mdi:{icon}",
      resolve: ({ icon }) => ({
        component: Icon,
        attrs: { icon: `mdi:${icon}` },
      }),
    },
    {
      name: "mi-{icon}",
      resolve: ({ icon }) => ({
        component: Icon,
        attrs: { icon: `mdi:${icon.replaceAll("_", "-")}` },
      }),
    },
    {
      name: "{icon}",
      resolve: ({ icon }) => ({
        component: Icon,
        attrs: {
          icon: icon.includes(":") ? icon : `mdi:${icon.replaceAll("_", "-")}`,
        },
      }),
    },
  ],
  aliases: [
    { name: "close", to: "mdi:close" },
    { name: "va-unsorted", to: "mdi:swap-vertical" },
    { name: "va-arrow-first", to: "mdi:page-first" },
    { name: "va-arrow-last", to: "mdi:page-last" },
    { name: "va-arrow-right", to: "mdi:chevron-right" },
    { name: "va-arrow-left", to: "mdi:chevron-left" },
    { name: "va-arrow-down", to: "mdi:chevron-down" },
    { name: "va-arrow-up", to: "mdi:chevron-up" },
    { name: "va-calendar", to: "mdi:calendar" },
    { name: "va-delete", to: "mdi:delete-outline" },
    { name: "va-check", to: "mdi:check" },
    { name: "va-check-circle", to: "mdi:check-circle" },
    { name: "va-warning", to: "mdi:alert" },
    { name: "va-clear", to: "mdi:close-circle-outline" },
    { name: "va-close", to: "mdi:close" },
    { name: "va-loading", to: "mdi:loading", spin: true },
    { name: "va-plus", to: "mdi:plus" },
    { name: "va-minus", to: "mdi:minus" },
  ],
});
