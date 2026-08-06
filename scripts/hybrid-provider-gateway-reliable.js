"use strict";

const fs = require("fs");
const Module = require("module");
const path = require("path");
const vm = require("vm");

const gatewayPath = path.join(__dirname, "hybrid-provider-gateway.js");

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[hybrid-gateway-reliable] Could not find ${label}; refusing a partial proxy patch.`);
  }
  return source.replace(needle, replacement);
}

function patchGatewaySource(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    '    req.once("close", onClose);',
    '    res.once("close", onClose);',
    "request close listener",
  );
  next = replaceRequired(
    next,
    '      req.off("close", onClose);',
    '      res.off("close", onClose);',
    "request close cleanup",
  );
  next = replaceRequired(
    next,
    '    const onClose = () => controller.abort();',
    '    const onClose = () => { if (!res.writableEnded) controller.abort(); };',
    "unconditional upstream abort",
  );

  new vm.Script(next, { filename: gatewayPath });
  return next;
}

function loadReliableGateway() {
  const source = fs.readFileSync(gatewayPath, "utf8");
  const patched = patchGatewaySource(source);
  const runtimeModule = new Module(gatewayPath, module.parent);
  runtimeModule.filename = gatewayPath;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(gatewayPath));
  runtimeModule._compile(patched, gatewayPath);
  console.log("[hybrid-gateway-reliable] Proxy requests now abort only when the viewer response actually closes.");
  return runtimeModule.exports;
}

module.exports = {
  gatewayPath,
  loadReliableGateway,
  patchGatewaySource,
};
