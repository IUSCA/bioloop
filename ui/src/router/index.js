import { createRouter, createWebHistory } from "vue-router";
import generatedRoutes from "virtual:generated-pages";
import { setupLayouts } from "virtual:generated-layouts";

// https://github.com/JohnCampionJr/vite-plugin-vue-layouts
const routes = setupLayouts(generatedRoutes);
console.log("routes", routes);
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// const router = createRouter({
//   history: createWebHistory(import.meta.env.BASE_URL),
//   routes: [
//     {
//       path: '/',
//       name: 'home',
//       component: HomeView
//     },
//     {
//       path: '/about',
//       name: 'about',
//       // route level code-splitting
//       // this generates a separate chunk (About.[hash].js) for this route
//       // which is lazy-loaded when the route is visited.
//       component: () => import('../views/AboutView.vue')
//     }
//   ]
// })

export default router;
