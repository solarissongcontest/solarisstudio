export function AnniversaryDeepExperience() {
  // Temporarily disabled: the previous implementation inserted portal hosts
  // directly into React-managed route DOM. During client-side navigation that
  // could race React's own mount/unmount work and crash the whole destination
  // route, especially in mobile Safari. Route-native anniversary modules can
  // be reintroduced without DOM injection after the navigation path is stable.
  return null;
}
