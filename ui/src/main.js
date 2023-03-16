import { createApp } from "vue";
import { createPinia } from "pinia";
import { createVuestic } from "vuestic-ui";
import config from "../vuestic.config.js"; // https://vuestic.dev/en/styles/tailwind
import "vuestic-ui/css";
import "./styles/main.css";
import "./styles/overrides.css";
// import "material-design-icons-iconfont/dist/material-design-icons.min.css";

import App from "./App.vue";
import router from "./router";

// Tree-shake extra vuestic styles, so there is no conflict with Tailwind
// https://vuestic.dev/en/getting-started/tree-shaking#css-code-split
// import "vuestic-ui/styles/essential.css";
// import "vuestic-ui/styles/typography.css";

const app = createApp(App);

app.use(createVuestic({ config }));
app.use(createPinia());
app.use(router);

app.mount("#app");
