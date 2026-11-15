# oclip

oclip is an MIT-licensed desktop editor for images, video clips, audio, and text. The workspace includes an asset library, composition preview, inspector, and four timeline tracks.

## Run

Install Node.js 24, then run:

```sh
npm install
npm run dev
```

In dev mode, saving HTML, CSS, renderer JavaScript, or the Electron preload script reloads the editor window and restores the open project. Edits to `desktop/main.cjs` require restarting the dev command.

To inspect the interface without installing Electron, run `npm run preview` and open http://127.0.0.1:4173. Native project dialogs require Electron.

## Build for Windows

Run `npm install` and then `npm run build` from the project folder. The build creates a portable Windows x64 app at `dist/oclip-win32-x64/oclip.exe`. Keep the entire output folder together when moving or sharing it.

## Edit

- Use **Project > New project** to start fresh, or open the sample project to explore the controls.
- Import media, then click an asset to insert it near the playhead or drag it onto a compatible track.
- Drag a clip to move it. Drag either edge to trim it. Use the inspector to set an exact duration in frames.
- Use the canvas inspector to change frame dimensions and background. Select a layer to edit its position, scale, opacity, text, or volume as applicable.
- Save with **Ctrl+S**. Project files reference the original media on disk. Keep the source files in place.
- **Export** lets you choose MP4 (H.264) or WebM and select a destination before rendering. The dialog shows formats supported by the installed encoder. Chromium uses hardware video encoding when available and can fall back to software. Export still runs in real time at 30 fps.

## Code

`src/model.js` defines the project and frame operations. `src/editor.js` connects the UI and editor state. `src/playback.js` composes the preview and renders exports. `desktop/` contains the Electron shell, native dialogs, and local media server.

Run `npm test` to check the timeline model.
