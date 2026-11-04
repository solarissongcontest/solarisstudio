export type NavigationLinkActivation = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

/**
 * Returns true only when Solaris should take ownership of a normal in-app
 * primary-link activation. Modified/non-primary activations stay browser-owned
 * so open-in-new-tab/window and other native link behaviors keep working.
 */
export function shouldOwnNavigationLinkActivation(
  event: NavigationLinkActivation,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
