export default function useSearchKeyShortcut({
  triggerKey = "/",
  targetElementClass = "search-input",
} = {}) {
  useEventListener(window, "keypress", (evt) => {
    const targetElement =
      document.getElementsByClassName(targetElementClass)[0];
    if (
      evt.key === triggerKey &&
      targetElement &&
      document.activeElement !== targetElement
    ) {
      evt.preventDefault();
      targetElement.focus();
    }
  });
}
