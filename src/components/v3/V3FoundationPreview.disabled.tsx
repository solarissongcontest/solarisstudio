/**
 * Build-time stand-in for the private V3 foundation preview when its existing
 * production beforeLoad guard redirects all visitors. No product component or
 * account/system data is imported into the disabled client build.
 */
export function V3FoundationPreview() {
  return null;
}
