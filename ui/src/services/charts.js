// Default theme-dependent colors for Chart.js
function getDefaultChartColors(isDark) {
  return {
    GRID: isDark ? "rgb(40, 40, 40)" : "rgba(0, 0, 0, 0.1)",
    FONT: isDark ? "rgba(241, 241, 241, 1)" : "rgba(11, 18, 26, 1)",
    TOOLTIP: {
      BACKGROUND: isDark ? "rgba(129, 137, 146, 1)" : "rgba(17, 17, 17, 1)",
      FONT: isDark ? "rgba(11, 18, 26, 1)" : "rgba(241, 241, 241, 1)",
    },
  };
}

export { getDefaultChartColors };
