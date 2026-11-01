import { env as nodeEnv } from "node:process";

export function getServerEnv(name) {
  const denoEnv = globalThis.Deno?.env;
  return denoEnv?.get(name) ?? nodeEnv[name];
}
