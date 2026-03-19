export default function useSearchKeyShortcut({
  triggerKey = "/",
  targetElementClass = "search-input",
  metaKey = false, // whether the meta key (command key on Mac, windows key on Windows) should be held
  ctrlKey = false, // whether the ctrl key should be held
  altKey = false, // whether the alt key should be held
  shiftKey = false, // whether the shift key should be held
} = {}) {
  console.log("useSearchKeyShortcut initialized with config", {
    triggerKey,
    targetElementClass,
    metaKey,
    ctrlKey,
    altKey,
    shiftKey,
  });
  useEventListener(window, "keydown", (evt) => {
    const targetElement =
      document.getElementsByClassName(targetElementClass)[0];
    console.log("targetElement", targetElement);

    const keyMatches =
      String(evt.key).toLowerCase() === String(triggerKey).toLowerCase();
    console.log(evt.key, keyMatches, {
      metaKey: evt.metaKey,
      ctrlKey: evt.ctrlKey,
      altKey: evt.altKey,
      shiftKey: evt.shiftKey,
    });
    if (
      keyMatches &&
      evt.metaKey === metaKey &&
      evt.ctrlKey === ctrlKey &&
      evt.altKey === altKey &&
      evt.shiftKey === shiftKey &&
      targetElement &&
      document.activeElement !== targetElement
    ) {
      console.log("shortcut triggered, focusing target element", targetElement);
      evt.preventDefault();
      targetElement.focus();
    }
  });
}
