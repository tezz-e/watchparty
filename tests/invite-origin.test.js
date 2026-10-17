import assert from "node:assert/strict";
import { test } from "node:test";
import { getInviteOrigin } from "../server/inviteOrigin.js";

const interfaces = {
  loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
  linkLocal: [{ family: "IPv4", internal: false, address: "169.254.10.20" }],
  wifi: [{ family: "IPv4", internal: false, address: "192.168.29.11" }],
};

test("configured public origin takes precedence and ignores URL paths", () => {
  assert.equal(getInviteOrigin({
    publicUrl: "https://watch.example.com/app",
    origin: "http://localhost:5173",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), "https://watch.example.com");
});

test("public and LAN origins remain unchanged", () => {
  assert.equal(getInviteOrigin({
    origin: "https://watch.example.com",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), "https://watch.example.com");
  assert.equal(getInviteOrigin({
    origin: "http://192.168.29.11:5173",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), "http://192.168.29.11:5173");
});

test("localhost origins are rewritten to an active LAN IPv4 while retaining the port", () => {
  assert.equal(getInviteOrigin({
    origin: "http://localhost:5173",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), "http://192.168.29.11:5173");
});

test("configured LAN IPv4 takes precedence over interface detection", () => {
  assert.equal(getInviteOrigin({
    lanIp: "10.20.30.40",
    origin: "http://localhost:3001",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), "http://10.20.30.40:3001");
});

test("localhost is retained when there is no usable LAN IPv4", () => {
  assert.equal(getInviteOrigin({
    origin: "http://127.0.0.1:3001",
    protocol: "http",
    host: "127.0.0.1:3001",
    interfaces: { loopback: interfaces.loopback, linkLocal: interfaces.linkLocal },
  }), "http://127.0.0.1:3001");
});

test("IPv6 loopback is rewritten to the available IPv4 LAN address", () => {
  assert.equal(getInviteOrigin({
    origin: "http://[::1]:3001",
    protocol: "http",
    host: "[::1]:3001",
    interfaces,
  }), "http://192.168.29.11:3001");
});

test("configured LAN address must be a reachable IPv4", () => {
  assert.throws(() => getInviteOrigin({
    lanIp: "127.0.0.1",
    origin: "http://localhost:3001",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), /reachable non-loopback IPv4/);
});

test("configured invite origins must use HTTP or HTTPS", () => {
  assert.throws(() => getInviteOrigin({
    publicUrl: "javascript:alert(1)",
    origin: "http://localhost:5173",
    protocol: "http",
    host: "localhost:3001",
    interfaces,
  }), /must use HTTP or HTTPS/);
});
