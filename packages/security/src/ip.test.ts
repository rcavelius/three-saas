import { describe, it, expect } from "vitest";
import { classifyAddress, isPublicAddress } from "./ip";

const NON_PUBLIC: Array<[string, string]> = [
  ["127.0.0.1", "loopback"],
  ["127.255.255.254", "loopback v4 /8"],
  ["10.0.0.1", "private 10/8"],
  ["10.255.255.255", "private 10/8 top"],
  ["172.16.0.1", "private 172.16/12"],
  ["172.31.255.255", "private 172.16/12 top"],
  ["192.168.1.1", "private 192.168/16"],
  ["169.254.169.254", "cloud metadata (link-local)"],
  ["169.254.0.1", "link-local"],
  ["100.64.0.1", "CGNAT"],
  ["100.127.255.255", "CGNAT top"],
  ["0.0.0.0", "unspecified"],
  ["0.1.2.3", "0/8"],
  ["224.0.0.1", "multicast"],
  ["239.255.255.250", "multicast SSDP"],
  ["255.255.255.255", "broadcast"],
  ["240.0.0.1", "reserved class E"],
  ["192.0.0.8", "IETF protocol assignments"],
  ["192.0.2.1", "TEST-NET-1"],
  ["198.51.100.7", "TEST-NET-2"],
  ["203.0.113.9", "TEST-NET-3"],
  ["198.18.0.1", "benchmarking"],
  ["198.19.255.255", "benchmarking top"],
  ["192.88.99.1", "6to4 relay anycast"],
  ["::1", "IPv6 loopback"],
  ["::", "IPv6 unspecified"],
  ["fc00::1", "unique local"],
  ["fd00:ec2::254", "AWS IMDS IPv6"],
  ["fe80::1", "link-local v6"],
  ["fe80::1%eth0", "link-local v6 with zone"],
  ["fec0::1", "deprecated site-local"],
  ["ff02::1", "multicast v6"],
  ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ["::ffff:7f00:1", "IPv4-mapped loopback hex"],
  ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
  ["::ffff:8.8.8.8", "IPv4-mapped public (still rejected: never needed)"],
  ["::127.0.0.1", "IPv4-compatible loopback"],
  ["::10.0.0.1", "IPv4-compatible private"],
  ["64:ff9b::7f00:1", "NAT64 embedding 127.0.0.1"],
  ["64:ff9b::a00:1", "NAT64 embedding 10.0.0.1"],
  ["64:ff9b:1::a00:1", "local-use NAT64"],
  ["2002:7f00:1::", "6to4 embedding 127.0.0.1"],
  ["2001::1", "Teredo"],
  ["2001:db8::1", "documentation v6"],
  ["2001:2::1", "benchmarking v6"],
  ["100::1", "discard-only"],
  ["[::1]", "bracketed loopback"],
  ["not-an-ip", "garbage"],
  ["0x7f.0.0.1", "hex v4 is not a valid literal here"],
  ["2130706433", "decimal v4 is not a valid literal here"],
  ["", "empty"],
];

const PUBLIC = ["8.8.8.8", "1.1.1.1", "93.184.215.14", "151.101.1.69", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "[2606:4700:4700::1111]"];

describe("isPublicAddress", () => {
  it.each(NON_PUBLIC)("rejects %s (%s)", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(PUBLIC)("accepts %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
    expect(classifyAddress(ip)).toBe("unicast");
  });
  it("labels the metadata address link-local and mapped addresses as mapped", () => {
    expect(classifyAddress("169.254.169.254")).toBe("linkLocal");
    expect(classifyAddress("::ffff:127.0.0.1")).toBe("ipv4Mapped");
    expect(classifyAddress("::127.0.0.1")).not.toBe("unicast");
    expect(classifyAddress("::a00:1")).not.toBe("unicast");
    expect(classifyAddress("64:ff9b::7f00:1")).toBe("rfc6052");
  });
});
