# oclip development plan

oclip is a Windows video editor for assembling video, images, audio, and titles. Ship a dependable editor first. Add a catalog of paid assets and effects once projects can reliably reopen and export.

## What to take from OpenCut

This review uses the active [OpenCut repository](https://github.com/OpenCut-app/OpenCut). Its desktop shell and FFmpeg build tooling are in the repository. Its [engine and editor API proposal](https://github.com/OpenCut-app/OpenCut/issues/867) describes future work. Use the separation of document data, media, editing operations, and rendering as a guide. Keep Electron and oclip's free track layout.

| Area | In oclip now | Next step |
| --- | --- | --- |
| Editing | Undo and redo, locks, group movement, snapping, and linked audio | Exercise real pointer gestures in Electron and make link rules consistent across ripple operations |
| Projects | Autosave, crash recovery, media relinking, and portable project collection | Add a tested migration when the project format first needs a breaking change |
| Export | MP4 and WebM, streamed output, cancellation, and an initial seek before recording | Build frame-driven rendering with explicit timestamps and audio mixing, then compare it with the current recorder on Windows |
| Development | Model and desktop storage tests | Add Electron smoke tests for the home screen, the timeline, and a completed export |

## Release order

1. **Verify the editor on Windows.** Install on a clean PC. Import a video with audio, an image, and an audio file. Trim, split, move linked clips, undo, and reopen. Kill the app during an edit and check the recovery prompt. Collect the project, move the collected folder, and open its Project.oclip from Home → Import project.
2. **Verify exports before selling.** Use short and long projects with trims, titles, silence, and mixed audio. Measure duration, frame count, A/V sync, peak memory, and cancellation. The current recorder follows wall-clock playback. Treat frame-driven export as unfinished until sample files pass these checks.
3. **Ship one paid pack end to end.** Your asset server owns the catalog, prices, purchase verification, and authorized downloads. The app handles discovery, download, caching, application, and missing-asset errors. Start with a pack the current editor can render, such as overlays and sound effects. Verify that reopening and export work offline after downloading, and define how collection handles paid files before offering those packs.
4. **Add editable effects and MCP once the edit API is ready.** Define an effect's parameters, validation, saved representation, and renderer behavior together. Have MCP call the same editing operations as the UI so undo, locks, and validation apply consistently. Start with project inspection and asset search, then expose a small set of undoable edit operations.

Defer cross-platform rewrites, a public plugin runtime, and a full marketplace until the Windows workflow and first paid pack work end to end.

## Code map

- `src/model.js` and `src/timeline-edits.js` hold the reusable project and editing rules.
- `src/editor.js` connects the UI, selection, gestures, history, and autosave.
- `src/playback.js` determines the layers for each frame and records exports.
- `desktop/main.cjs` owns project files, native dialogs, media access, and export writes.

Run `npm test` before handing off changes. Use `npm run build` when preparing a Windows installer to verify on a clean machine.
