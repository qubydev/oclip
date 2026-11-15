const shapes = {
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  'move-horizontal':'<path d="M3 12h18m-14-4-4 4 4 4m10-8 4 4-4 4"/>',
  'panel-left-close':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/>',
  'panel-left-open':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-11 3 3-3 3"/>',
  'panel-right-close':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M8 9l3 3-3 3"/>',
  'panel-right-open':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m-4-11-3 3 3 3"/>',
  'panel-bottom-close':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18M9 8l3 3 3-3"/>',
  'panel-bottom-open':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18m-12-4 3-3 3 3"/>',

  chevron:'<path d="m6 9 6 6 6-6"/>', film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
  music:'<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
  text:'<path d="M4 7V4h16v3M12 4v16m-4 0h8"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>', monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  sliders:'<path d="M5 4v6m0 4v6m7-16v10m0 4v2m7-16v3m0 4v9M3 10h4m3 8h4m3-11h4"/>',
  frame:'<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  timeline:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-14 4h5m-3 3h8"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>', keyboard:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01m4 0h.01m4 0h.01m4 0h.01M7 14h10"/>',
  play:'<path fill="currentColor" d="m9 5 11 7-11 7z"/>', pause:'<path stroke-width="3" d="M9 5v14m6-14v14"/>',
  first:'<path d="M5 5v14m13-13-9 6 9 6z"/>', last:'<path d="M19 5v14M6 6l9 6-9 6z"/>',
  back:'<path d="m15 6-6 6 6 6"/>', forward:'<path d="m9 6 6 6-6 6"/>',
  volume:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="M3 9h4l5-4v14l-5-4H3zm13 1 5 5m0-5-5 5"/>',
  maximize:'<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>', undo:'<path d="M8 6 3 11l5 5m-5-5h11a5 5 0 0 1 5 5v2"/>', redo:'<path d="m16 6 5 5-5 5m5-5H10a5 5 0 0 0-5 5v2"/>',
  split:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/>',
  trash:'<path d="M3 6h18m-12 0V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>',
  magnet:'<path d="M4 13V5h5v8a3 3 0 0 0 6 0V5h5v8a8 8 0 0 1-16 0zm0-4h5m6 0h5"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 16 5-4 4 4 4-6 5 6"/>',
  eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  hidden:'<path d="m3 3 18 18M9 6a11 11 0 0 1 3 0c6 0 10 6 10 6a17 17 0 0 1-4 4M6 7a17 17 0 0 0-4 5s4 6 10 6a11 11 0 0 0 4-1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', check:'<path d="m5 12 4 4L19 6"/>', folder:'<path d="M3 6h7l2 2h9v12H3z"/>'
};
export function icon(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name] || '')+'</svg>';
}
