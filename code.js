figma.showUI(__html__, { width: 640, height: 600, themeColors: true });

let cancelRequested = false;

function getSelectedFrames() {
  const selection = figma.currentPage.selection;
  const frames = [];
  function collect(node) {
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
      frames.push(node);
    } else if ("children" in node) {
      for (const child of node.children) collect(child);
    }
  }
  for (const node of selection) collect(node);
  return frames;
}

figma.on("selectionchange", () => {
  figma.ui.postMessage({ type: "selection-changed" });
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === "get-frames") {
    try {
      const frames = getSelectedFrames();
      const frameData = [];
      for (const frame of frames) {
        const thumbBytes = await frame.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 0.25 }
        });
        frameData.push({
          id: frame.id,
          name: frame.name,
          width: frame.width,
          height: frame.height,
          layerIndex: frame.parent ? frame.parent.children.indexOf(frame) : 0,
          thumbnail: thumbBytes
        });
      }
      figma.ui.postMessage({
        type: "frames-loaded",
        frames: frameData,
        fileName: figma.root.name,
        pageName: figma.currentPage.name
      });
    } catch (err) {
      figma.ui.postMessage({ type: "get-frames-error", message: (err && err.message) || String(err) });
    }
  }

  if (msg.type === "cancel-export") { cancelRequested = true; }

  if (msg.type === "start-export") {
    cancelRequested = false;
    const { orderedIds, scale, convertToImage } = msg.settings;
    const total = orderedIds.length;

    for (let i = 0; i < orderedIds.length; i++) {
      if (cancelRequested) { figma.ui.postMessage({ type: "export-cancelled" }); return; }
      try {
        const node = await figma.getNodeByIdAsync(orderedIds[i]);
        if (!node) { figma.ui.postMessage({ type: "export-error", message: "Frame not found: " + orderedIds[i] }); continue; }

        if (convertToImage) {
          const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
          figma.ui.postMessage({ type: "frame-exported", index: i, total: total, frameId: orderedIds[i], bytes: bytes, originalWidth: node.width, originalHeight: node.height, mode: "image" });
        } else {
          const bytes = await node.exportAsync({ format: "PDF" });
          figma.ui.postMessage({ type: "frame-exported", index: i, total: total, frameId: orderedIds[i], bytes: bytes, originalWidth: node.width, originalHeight: node.height, mode: "pdf" });
        }
      } catch (err) {
        figma.ui.postMessage({ type: "export-error", message: "Failed frame " + (i + 1) + ": " + ((err && err.message) || err) });
      }
    }
    figma.ui.postMessage({ type: "export-complete" });
  }

  if (msg.type === "close-plugin") { figma.closePlugin(); }
};
