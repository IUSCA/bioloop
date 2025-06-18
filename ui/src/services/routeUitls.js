export function getPagesList(routes, parentPath = "") {
  let pages = [];

  routes.forEach((route) => {
    if (route.path) {
      const fullPath =
        parentPath +
        (route.path.startsWith("/") ? route.path : "/" + route.path);
      pages.push({
        value: fullPath,
        text: route.meta?.title || fullPath,
      });
    }

    if (route.children) {
      pages = pages.concat(
        getPagesList(route.children, parentPath + route.path),
      );
    }
  });

  return pages;
}
