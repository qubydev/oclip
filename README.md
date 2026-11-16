# oclip

oclip is an MIT-licensed desktop editor for images, video clips, audio, and text. The workspace includes an asset library, composition preview, inspector, and four timeline tracks.

## Run

Install Node.js 24, then run:

```sh
npm install
npm run dev
```

In dev mode, saving HTML, CSS, renderer TypeScript, or the Electron preload script reloads the editor window and restores the open project. Edits to `desktop/main.cts` require restarting the dev command.

TypeScript compiles into the ignored `.build/` folder. Development mode watches TypeScript and copies changed HTML, CSS, and assets into that folder. The start, preview, test, and installer commands compile automatically; edit the source files rather than generated files.

To inspect the interface without installing Electron, run `npm run preview` and open http://127.0.0.1:4173. Native project dialogs require Electron.

## Build for Windows

Run `npm install` and then `npm run build` from the project folder. Share the Windows x64 installer from `dist/oclip-Setup-<version>-x64.exe`. Recipients can run the installer directly on their Windows PCs.

## Publish a release

GitHub Actions builds and publishes a Windows x64 installer only when you push a version tag such as `v0.1.0`. Ordinary branch pushes and pull requests do not publish releases. Commit and push `.github/workflows/release.yml` before pushing your first release tag.

To release the current version (`0.1.0`), commit any intended changes, then run:

```sh
git push origin HEAD
git tag v0.1.0
git push origin v0.1.0
```

For subsequent releases, first run `npm version patch` (or `minor` / `major`). This updates `package.json` and `package-lock.json`, commits the version change, and creates its version tag. Start with a clean working tree, then push the commit and that specific tag:

```sh
npm version patch
git push origin HEAD
git push origin v0.1.1
```

Use the tag printed by `npm version` in the last command. The tag must exactly match `v` plus the version in `package.json`; a mismatch stops the workflow. Versions with a suffix, such as `0.2.0-beta.1`, are published as GitHub prereleases.

Watch **Actions > Release Windows installer** on GitHub. After tests and the build succeed, the workflow uploads the installer to a draft, then publishes it with automatically generated release notes. No personal access token is needed; it uses GitHub's built-in workflow token. If upload or publishing fails after a draft was created, inspect the draft under **Releases**; delete the incomplete draft before rerunning the workflow.

The installer is currently unsigned, so Windows may show an unknown-publisher warning. Follow the Windows release checks in [the development plan](docs/ROADMAP.md) before tagging a version.

## Edit

- Use **Project > New project** to start fresh, or open the sample project to explore the controls.
- Import media, then click an asset to insert it near the playhead or drag it onto a compatible track.
- Drag a clip to move it. Drag either edge to trim it. Use the inspector to set an exact duration in frames.
- Use the canvas inspector to change frame dimensions and background. Select a layer to edit its position, scale, opacity, text, or volume as applicable.
- Save with **Ctrl+S**. Project files reference the original media on disk. Keep the source files in place.
- **Export** lets you choose MP4 (H.264) or WebM and select a destination before rendering. The dialog shows formats supported by the installed encoder. Chromium uses hardware video encoding when available and can fall back to software. Export still runs in real time at 30 fps.

## Code

See the [development plan](docs/ROADMAP.md) for Windows release checks and the order for adding paid assets and MCP.

`src/model.ts` defines the project and frame operations. `src/editor.ts` connects the UI and editor state. `src/playback.ts` composes the preview and renders exports. `desktop/` contains the Electron shell, native dialogs, and local media server.

The renderer and tests use `.ts`. Electron's main and preload scripts use `.cts` to preserve CommonJS output, and the preview server uses `.mts`. Relative imports retain their runtime `.js` extensions; TypeScript resolves them to the corresponding source files.

Run `npm run typecheck` to check types without generating files, `npm test` for the model and desktop storage tests, and `npm run test:smoke` for a hidden Electron check of the compiled renderer and sandboxed preload. The release workflow runs both test commands before building the installer.

Shared project, track, clip, and media types live in `src/types.ts`; `src/desktop-api.ts` defines the desktop bridge. The compiler refuses to emit code with type errors. Strict mode is currently disabled, so unannotated parameters still allow implicit `any`.
