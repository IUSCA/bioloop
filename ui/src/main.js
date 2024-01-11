import "@fontsource/audiowide";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { createVuestic } from "vuestic-ui";
import "vuestic-ui/css";
import config from "../vuestic.config.js"; // https://vuestic.dev/en/styles/tailwind

import "./styles/main.css";
import "./styles/overrides.css";
import "./styles/footer.css";
// import "material-design-icons-iconfont/dist/material-design-icons.min.css";

import router from "@/router";
import App from "./App.vue";
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
