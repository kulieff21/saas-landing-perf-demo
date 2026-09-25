// Resolves npm packages from tools/node_modules, or from DEPS_DIR when the
// dependencies are installed outside the repository (e.g. outside a synced vault).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.DEPS_DIR || here;
const require = createRequire(path.join(base, 'package.json'));

export const resolve = (spec) => require.resolve(spec);
export const load = async (spec) => {
  const mod = await import(pathToFileURL(require.resolve(spec)).href);
  return mod.default ?? mod;
};
export const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
