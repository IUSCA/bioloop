function getVisibleNotificationMenuPanel() {
  const panels = Array.from(
    document.querySelectorAll('[data-testid="notification-menu-items"]'),
  );
  return panels.find(
    (panel) => panel instanceof HTMLElement && panel.offsetParent !== null,
  ) || null;
}

function removeVisibleSearchFilterChips() {
  const panel = getVisibleNotificationMenuPanel();
  if (!(panel instanceof HTMLElement)) return;
  panel
    .querySelectorAll('[data-testid="active-filter-chip-search"]')
    .forEach((chip) => chip.remove());
}

export {
  getVisibleNotificationMenuPanel,
  removeVisibleSearchFilterChips,
};
