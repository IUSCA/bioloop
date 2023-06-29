export default {
  install: (app) => {
    app.directive("visible", function (el, binding) {
      el.style.visibility = binding.value ? "visible" : "hidden";
    });
  },
};
