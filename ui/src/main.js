import "@fontsource/audiowide";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { createVuestic } from "vuestic-ui";

// reset styles first
import "vuestic-ui/styles/reset.css";
// then import vuestic styles
import "vuestic-ui/styles/essential.css";
import "vuestic-ui/styles/typography.css";
import config from "../vuestic.config.js"; // https://vuestic.dev/en/styles/tailwind

// override vuestic styles
import "./styles/overrides.css";
// import app styles
import "./styles/footer.css";
import "./styles/main.css";

// import "material-design-icons-iconfont/dist/material-design-icons.min.css";

import router from "@/router";
import App from "./App.vue";
import vVisible from "./directives/v-visible";

// Tree-shake extra vuestic styles, so there is no conflict with Tailwind
// https://vuestic.dev/en/getting-started/tree-shaking#css-code-split
// import "vuestic-ui/styles/essential.css";
// import "vuestic-ui/styles/typography.css";

const app = createApp(App);

app.use(createVuestic({ config }));
app.use(createPinia());
app.use(router);
app.use(vVisible);

app.mount("#app");
