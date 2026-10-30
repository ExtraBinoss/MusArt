# Your first visit

When there is no project to restore, MusArt opens its landing page. It introduces the editor, effects, Motion and agent-assisted creation. **Start creating** and **Try MusArt** both open the project library. Visiting these pages does not create or save a document, and no account is required.

The landing page currently uses designed video placeholders. Future clips belong in [`apps/web/public/videos/`](../../apps/web/public/videos/README.md); the README describes the four feature slots. The application does not generate or download a demo video. The template carousel automatically drifts through an infinite loop, with dragging, touch swipes, horizontal wheel input and keyboard navigation. It has no visible scrollbar or arrow buttons. Hovering or using the keyboard pauses automatic movement; it resumes gently after interaction and inertia. Hidden or offscreen content pauses, and reduced motion disables automatic movement and inertia. Motion previews pause while the rail moves. Hovering or focusing a Motion card on a device with a fine pointer plays a silent preview through the real engine and GPU graph. Leaving, scrolling, dragging or hiding the page stops it; reduced motion and touch devices keep the poster. The preview does not install or edit a project. Choosing a card opens the corresponding real template through the same guarded loader as the library. The finite headline reveal pauses in hidden tabs and respects reduced motion. Use the MusArt brand in the library to return to this page.

## Choose your starting point

The desktop library has a left sidebar with Projects, Templates and five recent projects with cached thumbnails. Community is marked as coming soon and stays disabled. On phones, Projects and Templates remain available in a compact top navigation. The Back button returns to the landing page. Preferences are at the bottom of the desktop sidebar and in the header on phones. To preview the landing directly, add `?welcome=1` to the app URL; this does not clear stored projects.

Choose a starting point:

- **Projects** shows work saved on this device. Search filters the loaded items; **Load more projects** reads another bounded page without loading every project or its original assets.
- **Templates** shows static and Motion starting points with the same image-card layout. Search by name or format and use the mode filter to narrow the list.

Choose a project or template to open the editor. The creation button’s adjacent arrow opens **Import .musart** for an editable portable project. Switching between Projects and Templates uses a short transition; outgoing controls become inert immediately, and reduced motion removes the movement. Real import, download and storage errors remain visible; an unsuccessful operation leaves the library open.

**New project** opens a separate dialog. Give the project a name, choose a visual format preset or enter custom dimensions, then select **Create**. The preview updates as the dimensions change. The link button locks or unlocks the aspect ratio. New projects use the standard canvas background; background editing remains available in the editor. Escape closes the creation dialog and returns to the library.

In the editor, the MusArt logo opens the Projects/Templates library. The project-name menu's **Projects** action opens it too, on desktop and phones. Explicit creation commands open the shared creation dialog over the canvas; cancelling returns to the current document.

## On a phone

The canvas fills the editor. The bottom navigation opens Properties, Motion, Layers or Tools in a sheet, and Export opens the export options. Drag the sheet's top pill down, press Escape or use its close button to return to the canvas.

Numeric properties use a slider and a precise value input. During a slider gesture, surrounding controls fade so the artwork stays visible. Releasing the slider commits one edit; cancelling restores the starting value. Pinch and pan with two fingers to navigate the canvas. The desktop editor keeps its side panels and keyboard shortcuts.

Projects and fonts remain on this browser's origin. Download a `.musart` backup before clearing site data, and install custom fonts separately on another device. See [keyboard shortcuts and sharing](keyboard-shortcuts.md) and [fonts](fonts.md).
