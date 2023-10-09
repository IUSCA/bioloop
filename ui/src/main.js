import { createApp } from "vue";
import { createPinia } from "pinia";
import { createVuestic } from "vuestic-ui";
import config from "../vuestic.config.js"; // https://vuestic.dev/en/styles/tailwind
import "@fontsource/audiowide";
import "vuestic-ui/css";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
} from "chart.js";

import "./styles/main.css";
import "./styles/overrides.css";
// import "material-design-icons-iconfont/dist/material-design-icons.min.css";

import App from "./App.vue";
import router from "./router";
import vVisible from "./directives/v-visible";

// Tree-shake extra vuestic styles, so there is no conflict with Tailwind
// https://vuestic.dev/en/getting-started/tree-shaking#css-code-split
// import "vuestic-ui/styles/essential.css";
// import "vuestic-ui/styles/typography.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

const app = createApp(App);

app.use(createVuestic({ config }));
app.use(createPinia());
app.use(router);
app.use(vVisible);

app.mount("#app");
