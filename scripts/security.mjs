import net from "node:net";

const PRIVATE_IPV4_RANGES = [
  { start: "10.0.0.0", end: "10.255.255.255" },
  { start: "172.16.0.0", end: "172.31.255.255" },
  { start: "192.168.0.0", end: "192.168.255.255" },
  { start: "169.254.0.0", end: "169.254.255.255" },
  { start: "127.0.0.0", end: "127.255.255.255" }
];

function ipv4ToLong(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InRange(ip, range) {
  const value = ipv4ToLong(ip);
  return value >= ipv4ToLong(range.start) && value <= ipv4ToLong(range.end);
}

function isPrivateIpv4(ip) {
  return PRIVATE_IPV4_RANGES.some((range) => isIpv4InRange(ip, range));
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80") || lower === "::1";
}

export function isBlockedHost(hostname, allowPrivate = false) {
  const normalized = hostname.toLowerCase();
  if (allowPrivate) {
    return false;
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

export function normalizeTargetUrl(input) {
  const parsed = new URL(input);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }
  return parsed.toString();
}
