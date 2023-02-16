import typescript from "rollup-plugin-typescript2";
import {terser} from "rollup-plugin-terser";
import postcss from "rollup-plugin-postcss";
import image from "@rollup/plugin-image";
import json from "@rollup/plugin-json";

export default [
  {
    input: {
      index: "src/index.ts"
    },
    output: {
      dir: "dist",
      format: "cjs",
      name: "PeraConnect",
      globals: {
        "@walletconnect/sign-client": "WalletConnect",
        algosdk: "algosdk",
        bowser: "bowser",
        "@json-rpc-tools/utils": "format",
        "qr-code-styling": "QRCodeStyling",
        "lottie-web": "lottie"
      }
    },
    external: [
      "@walletconnect/sign-client",
      "@walletconnect/utils",
      "@walletconnect/types",
      "@json-rpc-tools/utils",
      "algosdk",
      "lottie-web",
      "bowser",
      "qr-code-styling",
      "bufferutil",
      "utf-8-validate"
    ],
    plugins: [
      image(),
      terser(),
      postcss(),
      typescript({
        rollupCommonJSResolveHack: true,
        exclude: "**/__tests__/**",
        clean: true
      }),
      json()
    ]
  }
];
