import { createApp } from "vue";
import { createPinia } from "pinia";
import { createVuestic } from "vuestic-ui";
import "vuestic-ui/css";
import "material-design-icons-iconfont/dist/material-design-icons.min.css";

import App from "./App.vue";
import router from "./router";

// Tree-shake extra vuestic styles, so there is no conflict with Tailwind
// https://vuestic.dev/en/getting-started/tree-shaking#css-code-split
import "vuestic-ui/styles/essential.css";
import "vuestic-ui/styles/typography.css";
import "./styles/main.css";

const app = createApp(App);

app.use(
  createVuestic({
    config: {
      colors: {
        // Default colors
        primary: "#23e066",
        secondary: "#002c85",
        success: "#40e583",
        info: "#2c82e0",
        danger: "#e34b4a",
        warning: "#ffc200",
        gray: "#babfc2",
        dark: "#34495e",

        // Custom colors
        yourCustomColor: "#d0f55d",
      },
    },
  })
);
app.use(createPinia());
app.use(router);

app.mount("#app");
