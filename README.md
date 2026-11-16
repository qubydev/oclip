<div align="center">

<img src="assets/oclip.png" alt="Oclip logo" width="88" height="88">

# Oclip

**An open-source video editor for Windows.**

Bring video, images, audio, and text together in a local desktop workspace.

[Releases](https://github.com/qubydev/oclip/releases) · [Getting started](#getting-started) · [Roadmap](docs/ROADMAP.md) · [Report an issue](https://github.com/qubydev/oclip/issues)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform: Windows x64](https://img.shields.io/badge/Platform-Windows%20x64-0078D4)
![Status: Early development](https://img.shields.io/badge/Status-Early%20development-orange)

</div>

## Overview

Oclip is a desktop editor built with Electron and TypeScript. Arrange media on a multitrack timeline, adjust your composition in the preview, and export a finished video. Projects and source media stay on your computer.

The project is in early development, with Windows x64 as the current build target. See the [development roadmap](docs/ROADMAP.md) for priorities and release checks.

## Features

- **Multitrack editing** — Move, trim, split, and reorder clips with snapping, linked selections, ripple deletion, and undo/redo.
- **Composition controls** — Position and scale layers in the preview. Adjust text, color, opacity, volume, and canvas dimensions in the inspector.
- **Media library** — Import video, images, and audio; preview assets before adding them to the timeline.
- **Project management** — Create, reopen, duplicate, and delete projects from the home screen, with autosave and recovery support.
- **Portable projects** — Relink missing media or collect a project and its source files into a folder for transfer.
- **Video export** — Export MP4 (H.264) or WebM when supported by the installed encoder, with progress reporting and cancellation.

## Getting started

### Install on Windows

Check [GitHub Releases](https://github.com/qubydev/oclip/releases) for a Windows x64 installer named `oclip-Setup-<version>-x64.exe`. If an installer is not available, follow the source setup below.

Installers are currently unsigned, so Windows may display an unknown-publisher warning.

### Run from source

Install **Node.js 24** and **Git**, then run:

```sh
git clone https://github.com/qubydev/oclip.git
cd oclip
npm ci
npm run dev
```

Development mode recompiles TypeScript and reloads the editor after renderer or preload changes. HTML, CSS, and asset changes are copied into the running app. Restart the command after editing `desktop/main.cts`.

For a browser preview, run `npm run preview` and open [localhost:4173](http://127.0.0.1:4173). Native project dialogs and desktop file operations require Electron.

### Make your first edit

1. Create a project from the home screen and import your media.
2. Click an asset to insert it at the playhead, or drag it onto the timeline.
3. Move clips, drag their edges to trim, and use the inspector for precise adjustments.
4. Press **Ctrl+S** to save, then choose **Export** to render your video.

Project files reference source media on disk. Keep those files available, or use **Collect project files** from the home screen's project menu before moving a project to another computer.

## Development

Run these commands from the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start Electron with compilation and automatic reloads. |
| `npm start` | Compile and launch the desktop app. |
| `npm run preview` | Compile and serve the browser preview. |
| `npm run typecheck` | Check TypeScript without generating files. |
| `npm test` | Compile and run the model and project-storage tests. |
| `npm run test:smoke` | Check the renderer and sandboxed preload in hidden Electron windows. |
| `npm run build` | Compile and build the Windows x64 installer. |

Generated application files go into `.build/`; installers go into `dist/`. Both directories are ignored by Git. Edit the source files rather than generated output.

### Project structure

```text
src/          Editor interface, timeline, playback, and shared types
desktop/      Electron main process, preload bridge, and preview server
scripts/      Development runner and static asset copying
test/         Model, storage, build-input, and Electron smoke checks
assets/       App icons and sample media
docs/         Development roadmap and release checks
```

The renderer and tests use `.ts`. Electron's main and preload scripts use `.cts`, and the preview server uses `.mts`. Relative `.js` imports resolve to TypeScript source during compilation. Shared data types live in `src/types.ts`, and the desktop bridge contract lives in `src/desktop-api.ts`.

Type errors stop compilation. Strict mode is currently disabled, so unannotated parameters can still use implicit `any`.

## Current limitations

- Windows x64 is the supported installer target; macOS and Linux releases are not configured.
- Export currently runs in real time at 30 fps. Available formats depend on Chromium's encoder support; frame-driven rendering remains planned work.
- Project portability depends on keeping source media available or collecting it with the project.

## Contributing

Bug reports, focused fixes, and documentation improvements are welcome. Check the [roadmap](docs/ROADMAP.md) and [existing issues](https://github.com/qubydev/oclip/issues) before starting a larger change.

For bug reports, include your Windows version, steps to reproduce the issue, and the expected and actual behavior. Include media format details when the issue involves import or export.

Before submitting a pull request, run `npm run typecheck`, `npm test`, and `npm run test:smoke`. For installer changes, also run `npm run build` and verify installation on Windows.

## Releases

The [release workflow](.github/workflows/release.yml) runs only when a version tag is pushed. It checks the package version, runs the tests and Electron smoke check, builds the Windows installer, and publishes a GitHub Release with generated notes. Ordinary branch pushes and pull requests do not publish releases.

<details>
<summary>Maintainer release instructions</summary>

Complete the [Windows release checks](docs/ROADMAP.md#release-order) before tagging. Ensure the workflow is committed and pushed, and start with a clean working tree.

To release the current package version:

```sh
git push origin HEAD
git tag v0.1.0
git push origin v0.1.0
```

The example assumes `package.json` is at `0.1.0`. Every release tag must exactly match `v` followed by the package version.

For the next patch release:

```sh
npm version patch
git push origin HEAD
git push origin v0.1.1
```

Use the tag printed by `npm version` in the last command. Use `minor` or `major` for larger version changes. Versions with a suffix, such as `0.2.0-beta.1`, are published as prereleases.

Follow the run under **Actions → Release Windows installer**. The workflow uses GitHub's built-in token and uploads the installer to a draft before publishing. If a failed run leaves an incomplete draft, inspect and delete that draft before rerunning the workflow.

</details>

## License

Oclip is available under the [MIT License](LICENSE).
