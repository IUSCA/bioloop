import { defineStore } from "pinia";

export const useToastStore = defineStore("toast", () => {
  let toast = null;

  function setup(obj) {
    toast = obj;
  }

  function make_opts(arg) {
    let options = {};
    if (typeof arg === "object" && arg !== null) {
      options = { ...arg };
    } else {
      options.message = arg;
    }
    options.position = options.position || "bottom-right";
    return options;
  }

  function success(arg) {
    const options = make_opts(arg);
    options.color = "success";
    toast.init(options);
  }

  function error(arg) {
    const options = make_opts(arg);
    options.color = "danger";
    toast.init(options);
  }

  function info(arg) {
    const options = make_opts(arg);
    options.color = "info";
    toast.init(options);
  }
  return { setup, toast, success, error, info };
});
