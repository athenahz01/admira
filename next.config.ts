import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @xenova/transformers loads onnxruntime-node, whose native binary
  // (libonnxruntime.so + the .node binding) is not traced into the Vercel
  // serverless bundle by default, causing /api/fit to fail at runtime with
  // "cannot open shared object file: libonnxruntime.so". Keep these packages
  // external (do not bundle/transpile them) and explicitly include the native
  // binaries in the function output trace for the routes that embed at runtime.
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/fit": [
      "./node_modules/onnxruntime-node/bin/**/*",
      "./node_modules/onnxruntime-node/**/*.node",
    ],
  },
};

export default nextConfig;
