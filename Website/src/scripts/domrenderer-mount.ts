// Mounts the same WebExample app that powers /webexample — same wasm, same
// scene manifest — but presented through @swifttui/web's DOM surface renderer
// instead of the canvas painter. The wasm and manifest are fetched from the
// composed /webexample artifact, so this page adds no second wasm build.
import {
  createWebHostApp,
  type WebHostAppController,
} from "@swifttui/web";
import { createWasmSceneRuntimeFactory } from "@swifttui/web/wasi";
import workerUrl from "./domrenderer-worker.ts?worker&url";

const WEBEXAMPLE_DIST = "/webexample/TerminalApp/dist";

// Match the /webexample embed's responsive sizing so narrow viewports keep
// enough columns for the demo scenes (see WebExample's frontend.ts).
const DEFAULT_FONT_SIZE = 15;
const MIN_FONT_SIZE = 8;
const TARGET_COLUMNS = 72;
const CELL_WIDTH_RATIO = 0.62;

function responsiveFontSize(): number {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  if (!width) return DEFAULT_FONT_SIZE;
  const fit = Math.round(width / (TARGET_COLUMNS * CELL_WIDTH_RATIO));
  return Math.max(MIN_FONT_SIZE, Math.min(DEFAULT_FONT_SIZE, fit));
}

async function bootstrap(): Promise<void> {
  const mount = document.querySelector<HTMLElement>("[data-domrenderer-mount]");
  const scenePicker = document.querySelector<HTMLElement>("[data-domrenderer-scenes]");
  const status = document.querySelector<HTMLElement>("[data-domrenderer-status]");
  if (!mount) return;

  const controller = await createWebHostApp({
    mount,
    manifestUrl: new URL(`${WEBEXAMPLE_DIST}/scene-manifest.json`, window.location.href),
    renderer: "dom",
    style: { fontSize: responsiveFontSize() },
    environment: { TUIGUI_APP_NAME: "DomRendererDemo" },
    sceneRuntimeFactory: createWasmSceneRuntimeFactory(
      new URL(`${WEBEXAMPLE_DIST}/assets/app.wasm`, window.location.href),
      { workerModuleURL: new URL(workerUrl, window.location.href) },
    ),
  });

  installResponsiveFontSize(controller);
  renderScenePicker(controller, scenePicker);
  status?.remove();
}

function installResponsiveFontSize(controller: WebHostAppController): void {
  let current = responsiveFontSize();
  let pending = 0;
  window.addEventListener("resize", () => {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = 0;
      const next = responsiveFontSize();
      if (next !== current) {
        current = next;
        controller.setStyle({ fontSize: next });
      }
    });
  });
}

function renderScenePicker(
  controller: WebHostAppController,
  container: HTMLElement | null,
): void {
  if (!container || controller.scenes.length < 2) return;
  container.replaceChildren();
  for (const scene of controller.scenes) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = scene.title ?? scene.id;
    button.dataset.sceneId = scene.id;
    button.addEventListener("click", async () => {
      await controller.switchScene(scene.id);
      highlightActiveScene(controller, container);
    });
    container.append(button);
  }
  highlightActiveScene(controller, container);
}

function highlightActiveScene(
  controller: WebHostAppController,
  container: HTMLElement,
): void {
  for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.sceneId === controller.selectedSceneId),
    );
  }
}

function renderStartupError(error: unknown): void {
  const status = document.querySelector<HTMLElement>("[data-domrenderer-status]");
  if (!status) return;
  const message = error instanceof Error ? error.message : String(error);
  status.dataset.state = "error";
  status.textContent =
    `Could not start the demo (${message}). In local dev, build the /webexample ` +
    "artifact first: bun run build:wasm:dev in Website/.";
}

try {
  await bootstrap();
} catch (error: unknown) {
  renderStartupError(error);
  console.error("Failed to start the DOM renderer demo:", error);
}
