/**
 * Cloudflare's development surface is mounted under /dev while the public app
 * routes themselves are defined from /. Keep route-aware styling and helpers
 * working on both forms without changing normal production URLs.
 */
export function appRoutePath(pathname: string) {
  if (pathname === "/dev") return "/";
  return pathname.startsWith("/dev/") ? pathname.slice(4) : pathname;
}
