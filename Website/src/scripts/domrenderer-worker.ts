// The WASI scene worker for the /domrenderer demo. Bundled by Vite as a
// module worker (`?worker&url` from domrenderer-mount.ts) so the worker and
// the page runtime come from the same @swifttui/web release.
import { startWasmSceneWorker } from "@swifttui/web/wasi-worker";

startWasmSceneWorker();
