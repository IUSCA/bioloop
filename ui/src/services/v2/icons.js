import constants from "@/constants";

function getIcon(type, { outlined = false } = {}) {
  const baseIcon = constants.icons[type] || "mdi-help-circle";
  if (outlined) {
    return baseIcon + "-outline";
  }
  return baseIcon;
}

export { getIcon };
