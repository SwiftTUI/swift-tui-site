// Mounts the same WebExample app that powers /webexample — same wasm, same
// scene manifest — but presented through @swifttui/web's DOM surface renderer
// instead of the canvas painter. The wasm and manifest are fetched from the
// composed /webexample artifact, so this page adds no second wasm build.

import type { WebHostAppController } from "@swifttui/web";
import * as WebHost from "@swifttui/web";
import { createWasmSceneRuntimeFactory } from "@swifttui/web/wasi";
import workerUrl from "./domrenderer-worker.ts?worker&url";

const WEBEXAMPLE_DIST = "/webexample/TerminalApp/dist";

async function bootstrap(): Promise<void> {
  const mount = document.querySelector<HTMLElement>("[data-domrenderer-mount]");
  const scenePicker = document.querySelector<HTMLElement>(
    "[data-domrenderer-scenes]",
  );
  const status = document.querySelector<HTMLElement>(
    "[data-domrenderer-status]",
  );
  if (!mount) return;

  // The package owns font sizing and observes this mount's content box.
  // Preserve browser zoom and user text preferences. Assets live alongside
  // the same WASM artifact; older tagged packages have no bundled-font option.
  const fontOptions =
    "DOM_FONT_ASSET_PATH" in WebHost &&
    typeof WebHost.DOM_FONT_ASSET_PATH === "string"
      ? {
          domFont: {
            assetBase: new URL(
              `${WEBEXAMPLE_DIST}/${WebHost.DOM_FONT_ASSET_PATH}`,
              location.href,
            ),
          },
        }
      : {};
  const controller = await WebHost.createWebHostApp({
    ...fontOptions,
    mount,
    manifestUrl: new URL(
      `${WEBEXAMPLE_DIST}/scene-manifest.json`,
      window.location.href,
    ),
    renderer: "dom",
    environment: { SWIFTTUI_APP_NAME: "DomRendererDemo" },
    sceneRuntimeFactory: createWasmSceneRuntimeFactory(
      new URL(`${WEBEXAMPLE_DIST}/assets/app.wasm`, window.location.href),
      { workerModuleURL: new URL(workerUrl, window.location.href) },
    ),
  });

  renderScenePicker(controller, scenePicker);
  status?.remove();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) void controller.dispose();
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
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    "button",
  )) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.sceneId === controller.selectedSceneId),
    );
  }
}

function renderStartupError(error: unknown): void {
  const status = document.querySelector<HTMLElement>(
    "[data-domrenderer-status]",
  );
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
