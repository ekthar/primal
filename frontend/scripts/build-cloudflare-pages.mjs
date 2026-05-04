import { spawnSync } from "node:child_process";

const buildEnvironment = {
  ...process.env,
  PRIMAL_DEPLOY_TARGET: "cloudflare-pages",
};

const buildResult = spawnSync("npx next build", {
  env: buildEnvironment,
  shell: true,
  stdio: "inherit",
});

if (buildResult.error) {
  throw buildResult.error;
}

process.exit(buildResult.status ?? 1);
