import { systemErrorCodeFromUnknown } from "../src/lib/system-error";

const rawUrl = process.argv[2]?.trim();
if (!rawUrl) {
  console.error("Usage: dependency-probe <loopback-url>");
  process.exit(64);
}

let target: URL;
try {
  target = new URL(rawUrl);
} catch {
  console.error("Dependency probe URL is invalid");
  process.exit(64);
}

if (
  target.protocol !== "http:"
  || (target.hostname !== "127.0.0.1" && target.hostname !== "localhost")
) {
  console.error(`Refusing non-loopback dependency probe (${target.origin})`);
  process.exit(64);
}

let result = "OK";
try {
  const response = await fetch(target, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) {
    result = systemErrorCodeFromUnknown({ status: response.status }) ?? "UNKNOWN";
  }
} catch (error) {
  result = systemErrorCodeFromUnknown(error) ?? "UNKNOWN";
}

process.stdout.write(`${result}\n`);
