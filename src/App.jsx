import { useState, useMemo, useCallback, useRef } from "react";

const S = 100;
const MID = S / 2;
const PREVIEW_TILES = 6;
const PREVIEW_TILE = 80;
const EDITOR_SIZE = 280;
const FILL_RES = 200;

// All corner arcs: the arc center is at the corner itself.
// Arc from one edge to the adjacent edge, curving OUTWARD (away from corner).
//
// TL corner (0,0): start (0, r) end (r, 0) — arc center at (0,0), sweep=0 curves outward
// TR corner (S,0): start (S-r, 0) end (S, r) — arc center at (S,0), sweep=0 curves outward
// BL corner (0,S): start (r, S) end (0, S-r) — arc center at (0,S), sweep=0 curves outward
// BR corner (S,S): start (S, S-r) end (S-r, S) — arc center at (S,S), sweep=0 curves outward

const cornerArc = (corner, r) => {
  switch (corner) {
    case "TL": return `M 0 ${r} A ${r} ${r} 0 0 0 ${r} 0`;
    case "TR": return `M ${S - r} 0 A ${r} ${r} 0 0 0 ${S} ${r}`;
    case "BL": return `M ${r} ${S} A ${r} ${r} 0 0 0 0 ${S - r}`;
    case "BR": return `M ${S} ${S - r} A ${r} ${r} 0 0 0 ${S - r} ${S}`;
  }
};

const LINE_ELEMENTS = [
  // Straights
  { id: "v", name: "Vertical", d: `M ${MID} 0 L ${MID} ${S}`, cat: "Straight" },
  { id: "h", name: "Horizontal", d: `M 0 ${MID} L ${S} ${MID}`, cat: "Straight" },
  { id: "d1", name: "Diagonal ╲", d: `M 0 0 L ${S} ${S}`, cat: "Straight" },
  { id: "d2", name: "Diagonal ╱", d: `M ${S} 0 L 0 ${S}`, cat: "Straight" },
  { id: "v_l", name: "Vert Left", d: `M ${S * 0.25} 0 L ${S * 0.25} ${S}`, cat: "Straight" },
  { id: "v_r", name: "Vert Right", d: `M ${S * 0.75} 0 L ${S * 0.75} ${S}`, cat: "Straight" },
  { id: "h_t", name: "Horiz Top", d: `M 0 ${S * 0.25} L ${S} ${S * 0.25}`, cat: "Straight" },
  { id: "h_b", name: "Horiz Bot", d: `M 0 ${S * 0.75} L ${S} ${S * 0.75}`, cat: "Straight" },

  // Curves (tight quadratic)
  { id: "c_tl", name: "Top→Left", d: `M ${MID} 0 Q ${MID * 0.3} ${MID * 0.3} 0 ${MID}`, cat: "Curve" },
  { id: "c_tr", name: "Top→Right", d: `M ${MID} 0 Q ${S - MID * 0.3} ${MID * 0.3} ${S} ${MID}`, cat: "Curve" },
  { id: "c_bl", name: "Bot→Left", d: `M ${MID} ${S} Q ${MID * 0.3} ${S - MID * 0.3} 0 ${MID}`, cat: "Curve" },
  { id: "c_br", name: "Bot→Right", d: `M ${MID} ${S} Q ${S - MID * 0.3} ${S - MID * 0.3} ${S} ${MID}`, cat: "Curve" },
  { id: "c_tl_s", name: "Tight TL", d: `M ${MID} 0 C ${MID} ${MID * 0.4} ${MID * 0.4} ${MID} 0 ${MID}`, cat: "Curve" },
  { id: "c_tr_s", name: "Tight TR", d: `M ${MID} 0 C ${MID} ${MID * 0.4} ${S - MID * 0.4} ${MID} ${S} ${MID}`, cat: "Curve" },
  { id: "c_bl_s", name: "Tight BL", d: `M 0 ${MID} C ${MID * 0.4} ${MID} ${MID} ${S - MID * 0.4} ${MID} ${S}`, cat: "Curve" },
  { id: "c_br_s", name: "Tight BR", d: `M ${S} ${MID} C ${S - MID * 0.4} ${MID} ${MID} ${S - MID * 0.4} ${MID} ${S}`, cat: "Curve" },

  // Arcs (quarter circle edge-to-edge)
  { id: "a_tl", name: "Arc TL", d: `M ${MID} 0 A ${MID} ${MID} 0 0 0 0 ${MID}`, cat: "Arc" },
  { id: "a_tr", name: "Arc TR", d: `M ${MID} 0 A ${MID} ${MID} 0 0 1 ${S} ${MID}`, cat: "Arc" },
  { id: "a_bl", name: "Arc BL", d: `M 0 ${MID} A ${MID} ${MID} 0 0 1 ${MID} ${S}`, cat: "Arc" },
  { id: "a_br", name: "Arc BR", d: `M ${S} ${MID} A ${MID} ${MID} 0 0 0 ${MID} ${S}`, cat: "Arc" },

  // S-curves
  { id: "s_v", name: "S Vertical", d: `M ${MID} 0 C ${S * 0.9} ${S * 0.25} ${S * 0.1} ${S * 0.75} ${MID} ${S}`, cat: "S-Curve" },
  { id: "s_h", name: "S Horizontal", d: `M 0 ${MID} C ${S * 0.25} ${S * 0.1} ${S * 0.75} ${S * 0.9} ${S} ${MID}`, cat: "S-Curve" },
  { id: "s_v2", name: "S Vert Alt", d: `M ${MID} 0 C ${S * 0.1} ${S * 0.25} ${S * 0.9} ${S * 0.75} ${MID} ${S}`, cat: "S-Curve" },
  { id: "s_h2", name: "S Horiz Alt", d: `M 0 ${MID} C ${S * 0.25} ${S * 0.9} ${S * 0.75} ${S * 0.1} ${S} ${MID}`, cat: "S-Curve" },

  // Center shapes
  { id: "diamond", name: "Diamond", d: `M ${MID} ${MID * 0.5} L ${MID * 1.5} ${MID} L ${MID} ${MID * 1.5} L ${MID * 0.5} ${MID} Z`, cat: "Center", fill: true },
  { id: "circle", name: "Circle", d: `M ${MID + 15} ${MID} A 15 15 0 1 1 ${MID - 15} ${MID} A 15 15 0 1 1 ${MID + 15} ${MID}`, cat: "Center" },
  { id: "circle_lg", name: "Circle Lg", d: `M ${MID + 25} ${MID} A 25 25 0 1 1 ${MID - 25} ${MID} A 25 25 0 1 1 ${MID + 25} ${MID}`, cat: "Center" },
  { id: "square", name: "Square", d: `M ${MID - 14} ${MID - 14} L ${MID + 14} ${MID - 14} L ${MID + 14} ${MID + 14} L ${MID - 14} ${MID + 14} Z`, cat: "Center", fill: true },
  { id: "star", name: "Star", d: (() => { const pts = []; for (let i = 0; i < 8; i++) { const a = (i * Math.PI * 2) / 8 - Math.PI / 2; const r = i % 2 === 0 ? 18 : 9; pts.push(`${MID + r * Math.cos(a)},${MID + r * Math.sin(a)}`); } return `M ${pts.join(" L ")} Z`; })(), cat: "Center", fill: true },

  // Corner connectors — all curve OUTWARD from corner. 3 sizes: S(15%), M(30%), L(50%)
  { id: "cn_tl_s", name: "TL S", d: cornerArc("TL", S * 0.15), cat: "Corner" },
  { id: "cn_tr_s", name: "TR S", d: cornerArc("TR", S * 0.15), cat: "Corner" },
  { id: "cn_bl_s", name: "BL S", d: cornerArc("BL", S * 0.15), cat: "Corner" },
  { id: "cn_br_s", name: "BR S", d: cornerArc("BR", S * 0.15), cat: "Corner" },
  { id: "cn_tl_m", name: "TL M", d: cornerArc("TL", S * 0.3), cat: "Corner" },
  { id: "cn_tr_m", name: "TR M", d: cornerArc("TR", S * 0.3), cat: "Corner" },
  { id: "cn_bl_m", name: "BL M", d: cornerArc("BL", S * 0.3), cat: "Corner" },
  { id: "cn_br_m", name: "BR M", d: cornerArc("BR", S * 0.3), cat: "Corner" },
  { id: "cn_tl_l", name: "TL L", d: cornerArc("TL", S * 0.5), cat: "Corner" },
  { id: "cn_tr_l", name: "TR L", d: cornerArc("TR", S * 0.5), cat: "Corner" },
  { id: "cn_bl_l", name: "BL L", d: cornerArc("BL", S * 0.5), cat: "Corner" },
  { id: "cn_br_l", name: "BR L", d: cornerArc("BR", S * 0.5), cat: "Corner" },

  // Diagonals corner-to-edge
  { id: "tl_b", name: "TL→Bot", d: `M 0 0 L ${MID} ${S}`, cat: "Diagonal" },
  { id: "tr_b", name: "TR→Bot", d: `M ${S} 0 L ${MID} ${S}`, cat: "Diagonal" },
  { id: "bl_t", name: "BL→Top", d: `M 0 ${S} L ${MID} 0`, cat: "Diagonal" },
  { id: "br_t", name: "BR→Top", d: `M ${S} ${S} L ${MID} 0`, cat: "Diagonal" },
  { id: "tl_r", name: "TL→Right", d: `M 0 0 L ${S} ${MID}`, cat: "Diagonal" },
  { id: "bl_r", name: "BL→Right", d: `M 0 ${S} L ${S} ${MID}`, cat: "Diagonal" },
  { id: "tr_l", name: "TR→Left", d: `M ${S} 0 L 0 ${MID}`, cat: "Diagonal" },
  { id: "br_l", name: "BR→Left", d: `M ${S} ${S} L 0 ${MID}`, cat: "Diagonal" },

  // Waves
  { id: "w_h", name: "Wave H", d: `M 0 ${MID} Q ${S * 0.25} ${S * 0.2} ${MID} ${MID} Q ${S * 0.75} ${S * 0.8} ${S} ${MID}`, cat: "Wave" },
  { id: "w_v", name: "Wave V", d: `M ${MID} 0 Q ${S * 0.2} ${S * 0.25} ${MID} ${MID} Q ${S * 0.8} ${S * 0.75} ${MID} ${S}`, cat: "Wave" },
  { id: "w_h2", name: "Wave H Alt", d: `M 0 ${MID} Q ${S * 0.25} ${S * 0.8} ${MID} ${MID} Q ${S * 0.75} ${S * 0.2} ${S} ${MID}`, cat: "Wave" },
  { id: "w_v2", name: "Wave V Alt", d: `M ${MID} 0 Q ${S * 0.8} ${S * 0.25} ${MID} ${MID} Q ${S * 0.2} ${S * 0.75} ${MID} ${S}`, cat: "Wave" },
];

const STROKE_COLORS = [
  "#E8453C", "#2D7DD2", "#97CC04", "#F5A623",
  "#9B59B6", "#1ABC9C", "#F06292", "#ECEFF1",
];
const STROKE_WIDTHS = [1.5, 2.5, 4];

const FILL_PALETTES = [
  { name: "Midnight", colors: ["#1a2744", "#2a1a3a", "#0f2a2a", "#2a2218", "#1a1a2e", "#261a2e"] },
  { name: "Ocean", colors: ["#1e3a5f", "#163a4f", "#1a4a3f", "#2a3a5f", "#1e2f5f", "#1a3a4a"] },
  { name: "Berry", colors: ["#4a2040", "#3a1040", "#2a1a3a", "#4a1a30", "#381a48", "#301a3a"] },
  { name: "Forest", colors: ["#1a3328", "#1a2a1a", "#2a3a1a", "#1a3a2a", "#223a18", "#183a22"] },
  { name: "Ember", colors: ["#3a1a1a", "#4a2a1a", "#3a2a0a", "#4a1a2a", "#3a2218", "#2a1a0a"] },
];

// --- Utils ---

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(arr, seed) {
  const rng = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// --- Canvas flood fill ---

function buildRegionMap(activeIds, strokeW) {
  const res = FILL_RES;
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, res, res);
  const scale = res / S;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.max(strokeW * 0.6, 1.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const el of LINE_ELEMENTS) {
    if (!activeIds.has(el.id)) continue;
    const p = new Path2D(el.d);
    ctx.stroke(p);
  }
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, res, res);
  const pixels = imageData.data;
  const regionMap = new Uint16Array(res * res);
  let regionCount = 0;
  const isLine = (idx) => pixels[idx * 4] < 128;

  for (let i = 0; i < res * res; i++) {
    if (regionMap[i] !== 0 || isLine(i)) continue;
    regionCount++;
    const rid = regionCount;
    const queue = [i];
    regionMap[i] = rid;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const x = cur % res;
      const y = (cur - x) / res;
      if (x > 0 && regionMap[cur - 1] === 0 && !isLine(cur - 1)) { regionMap[cur - 1] = rid; queue.push(cur - 1); }
      if (x < res - 1 && regionMap[cur + 1] === 0 && !isLine(cur + 1)) { regionMap[cur + 1] = rid; queue.push(cur + 1); }
      if (y > 0 && regionMap[cur - res] === 0 && !isLine(cur - res)) { regionMap[cur - res] = rid; queue.push(cur - res); }
      if (y < res - 1 && regionMap[cur + res] === 0 && !isLine(cur + res)) { regionMap[cur + res] = rid; queue.push(cur + res); }
    }
  }
  return { regionMap, regionCount, res };
}

function renderFillImage(regionData, colors) {
  if (!regionData || regionData.regionCount === 0) return null;
  const { regionMap, regionCount, res } = regionData;
  const canvas = document.createElement("canvas");
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(res, res);
  const out = imageData.data;
  const colorLut = new Uint8Array((regionCount + 1) * 3);
  for (let r = 1; r <= regionCount; r++) {
    const rgb = hexToRgb(colors[(r - 1) % colors.length]);
    colorLut[r * 3] = rgb[0];
    colorLut[r * 3 + 1] = rgb[1];
    colorLut[r * 3 + 2] = rgb[2];
  }
  for (let i = 0; i < res * res; i++) {
    const rid = regionMap[i];
    if (rid > 0) {
      out[i * 4] = colorLut[rid * 3];
      out[i * 4 + 1] = colorLut[rid * 3 + 1];
      out[i * 4 + 2] = colorLut[rid * 3 + 2];
      out[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

// --- Print B&W tile ---

function printTileBW(activeIds, strokeW) {
  const paths = LINE_ELEMENTS.filter((el) => activeIds.has(el.id))
    .map((el) =>
      `<path d="${el.d}" fill="none" stroke="#000" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>`
    ).join("\n");

  const tileSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${S} ${S}" style="display:block">${paths}</svg>`;

  const gridSize = 4;
  const gridTileSize = 120;
  const gridCells = Array(gridSize * gridSize).fill(tileSvg(gridTileSize)).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tile Pattern - Print</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #f8f8f8;
      color: #222;
      display: flex;
      justify-content: center;
      padding: 40px 20px;
    }
    .page {
      background: #fff;
      max-width: 700px;
      width: 100%;
      padding: 48px;
      box-shadow: 0 1px 8px rgba(0,0,0,0.08);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 2px solid #111;
      padding-bottom: 12px;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .header span {
      font-size: 11px;
      color: #999;
    }
    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #999;
      margin-bottom: 12px;
    }
    .single-tile {
      display: flex;
      justify-content: center;
      padding: 24px;
      margin-bottom: 36px;
      border: 1px solid #eee;
      background: #fafafa;
    }
    .grid-section { margin-bottom: 32px; }
    .tile-grid {
      display: inline-grid;
      grid-template-columns: repeat(${gridSize}, ${gridTileSize}px);
      border: 1px solid #ddd;
    }
    .tile-grid svg {
      border: 0.5px solid #eee;
    }
    .cut-note {
      margin-top: 20px;
      font-size: 11px;
      color: #aaa;
      border-top: 1px solid #eee;
      padding-top: 12px;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 24px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      border-radius: 6px;
      background: #111;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transition: background 0.15s;
    }
    .print-btn:hover { background: #333; }
    @media print {
      .print-btn { display: none; }
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
  <div class="page">
    <div class="header">
      <h1>Tile Pattern</h1>
      <span>Cut along grid lines. Paint and assemble as mosaic.</span>
    </div>

    <div class="section-label">Single Tile</div>
    <div class="single-tile">
      ${tileSvg(200)}
    </div>

    <div class="grid-section">
      <div class="section-label">${gridSize} x ${gridSize} Tiled Preview</div>
      <div class="tile-grid">
        ${gridCells}
      </div>
    </div>

    <div class="cut-note">
      Each tile is designed to connect seamlessly at all edges. Cut tiles to equal size and arrange in any grid layout.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// --- SVG Components ---

function TileLines({ active, strokeColor, strokeWidth, size }) {
  const scale = size / S;
  return (
    <g transform={`scale(${scale})`}>
      {LINE_ELEMENTS.filter((el) => active.has(el.id)).map((el) => (
        <path
          key={el.id}
          d={el.d}
          fill={el.fill ? strokeColor + "22" : "none"}
          stroke={strokeColor}
          strokeWidth={strokeWidth / scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function EdgeDots({ size }) {
  const mid = size / 2;
  const r = size * 0.02;
  return (
    <g>
      {[[mid, 0], [size, mid], [mid, size], [0, mid]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.3)" />
      ))}
    </g>
  );
}

// --- Main ---

export default function TileDesigner() {
  const [active, setActive] = useState(new Set(["c_tl", "c_br"]));
  const [strokeColor, setStrokeColor] = useState(STROKE_COLORS[1]);
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [fillEnabled, setFillEnabled] = useState(false);
  const [fillMode, setFillMode] = useState("random");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [colorSeed, setColorSeed] = useState(42);

  const toggle = (id) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const randomize = () => {
    const count = 2 + Math.floor(Math.random() * 5);
    const picks = [...LINE_ELEMENTS].sort(() => Math.random() - 0.5).slice(0, count);
    setActive(new Set(picks.map((e) => e.id)));
    setStrokeColor(STROKE_COLORS[Math.floor(Math.random() * STROKE_COLORS.length)]);
    setColorSeed(Math.floor(Math.random() * 99999));
  };

  const regionData = useMemo(() => {
    if (!fillEnabled || active.size === 0) return null;
    return buildRegionMap(active, strokeWidth);
  }, [active, fillEnabled, strokeWidth]);

  const baseFillUrl = useMemo(() => {
    if (!regionData) return null;
    return renderFillImage(regionData, FILL_PALETTES[paletteIdx].colors);
  }, [regionData, paletteIdx]);

  const previewFillUrls = useMemo(() => {
    if (!regionData) return null;
    if (fillMode === "uniform") {
      return Array.from({ length: PREVIEW_TILES }, () =>
        Array.from({ length: PREVIEW_TILES }, () => baseFillUrl)
      );
    }
    const urls = [];
    for (let r = 0; r < PREVIEW_TILES; r++) {
      const row = [];
      for (let c = 0; c < PREVIEW_TILES; c++) {
        const colors = shuffled(FILL_PALETTES[paletteIdx].colors, colorSeed + r * 997 + c * 13);
        row.push(renderFillImage(regionData, colors));
      }
      urls.push(row);
    }
    return urls;
  }, [regionData, paletteIdx, colorSeed, fillMode, baseFillUrl]);

  const categories = [...new Set(LINE_ELEMENTS.map((e) => e.cat))];
  const totalPreview = PREVIEW_TILES * PREVIEW_TILE;

  return (
    <div style={{
      minHeight: "100vh", background: "#0C0C0C", color: "#ccc",
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace", padding: 24, userSelect: "none",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>◈ Tile Line Designer</h1>
        <p style={{ fontSize: 11, color: "#555", margin: "0 0 20px" }}>
          Toggle lines to compose a tile. Randomize for inspiration. Print B&W for hand-painting.
        </p>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Controls */}
          <div style={{ width: 340 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button onClick={randomize} style={{ ...btnStyle, background: "rgba(255,255,255,0.06)", color: "#fff" }}>↻ Randomize</button>
              <button onClick={() => setActive(new Set())} style={btnStyle}>Clear</button>
              <button
                onClick={() => printTileBW(active, strokeWidth)}
                disabled={active.size === 0}
                style={{
                  ...btnStyle,
                  background: active.size > 0 ? "rgba(255,255,255,0.06)" : "transparent",
                  color: active.size > 0 ? "#fff" : "#333",
                  cursor: active.size > 0 ? "pointer" : "default",
                }}
              >
                ⎙ Print B&W
              </button>
            </div>

            <div style={{ ...labelStyle, marginBottom: 5 }}>Stroke</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center" }}>
              {STROKE_COLORS.map((c) => (
                <button key={c} onClick={() => setStrokeColor(c)} style={{
                  width: 20, height: 20, borderRadius: 4, padding: 0, cursor: "pointer", background: c,
                  border: strokeColor === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.08)",
                }} />
              ))}
              <div style={{ marginLeft: 6, display: "flex", gap: 3 }}>
                {STROKE_WIDTHS.map((w) => (
                  <button key={w} onClick={() => setStrokeWidth(w)} style={{
                    ...btnSmall,
                    background: strokeWidth === w ? "rgba(255,255,255,0.1)" : "transparent",
                    color: strokeWidth === w ? "#fff" : "#555",
                  }}>{w === 1.5 ? "S" : w === 2.5 ? "M" : "L"}</button>
                ))}
              </div>
            </div>

            <div style={{ ...labelStyle, marginBottom: 5 }}>Region Fill</div>
            <div style={{ display: "flex", gap: 5, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => setFillEnabled((f) => !f)} style={{
                ...btnStyle,
                background: fillEnabled ? "rgba(255,255,255,0.1)" : "transparent",
                color: fillEnabled ? "#fff" : "#555",
              }}>{fillEnabled ? "◆ On" : "◇ Off"}</button>
              {fillEnabled && <>
                <button onClick={() => setFillMode((m) => m === "random" ? "uniform" : "random")} style={{
                  ...btnStyle, background: "rgba(255,255,255,0.04)", color: "#aaa",
                }}>{fillMode === "random" ? "Random" : "Uniform"}</button>
                {fillMode === "random" && (
                  <button onClick={() => setColorSeed(Math.floor(Math.random() * 99999))} style={{ ...btnSmall, color: "#888" }} title="Reshuffle colors">↻</button>
                )}
              </>}
            </div>
            {fillEnabled && (
              <div style={{ display: "flex", gap: 5, marginBottom: 12, alignItems: "center" }}>
                {FILL_PALETTES.map((pal, i) => (
                  <button key={i} onClick={() => setPaletteIdx(i)} title={pal.name} style={{
                    width: 36, height: 18, borderRadius: 3, padding: 0, cursor: "pointer",
                    border: paletteIdx === i ? "2px solid #fff" : "2px solid rgba(255,255,255,0.06)",
                    background: `linear-gradient(90deg, ${pal.colors[0]}, ${pal.colors[1]}, ${pal.colors[2]})`,
                  }} />
                ))}
              </div>
            )}

            {categories.map((cat) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ ...labelStyle, marginBottom: 3 }}>{cat}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {LINE_ELEMENTS.filter((e) => e.cat === cat).map((el) => {
                    const on = active.has(el.id);
                    return (
                      <button key={el.id} onClick={() => toggle(el.id)} title={el.name} style={{
                        width: 36, height: 36, padding: 0, cursor: "pointer", borderRadius: 5,
                        border: on ? `2px solid ${strokeColor}` : "2px solid rgba(255,255,255,0.05)",
                        background: on ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.01)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width={28} height={28} viewBox={`0 0 ${S} ${S}`}>
                          <path d={el.d} fill={el.fill ? (on ? strokeColor : "#555") + "22" : "none"}
                            stroke={on ? strokeColor : "#333"} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Editor tile */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Your Tile</div>
            <svg width={EDITOR_SIZE} height={EDITOR_SIZE} viewBox={`0 0 ${EDITOR_SIZE} ${EDITOR_SIZE}`} style={{
              display: "block", borderRadius: 10, background: "#141414", border: "1px solid rgba(255,255,255,0.08)",
            }}>
              {baseFillUrl && <image href={baseFillUrl} x={0} y={0} width={EDITOR_SIZE} height={EDITOR_SIZE} />}
              <TileLines active={active} strokeColor={strokeColor} strokeWidth={strokeWidth} size={EDITOR_SIZE} />
              <EdgeDots size={EDITOR_SIZE} />
            </svg>
          </div>

          {/* Preview */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Tiled Preview</div>
            <div style={{
              width: totalPreview, height: totalPreview, borderRadius: 10, overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)", background: "#141414",
            }}>
              <svg width={totalPreview} height={totalPreview} viewBox={`0 0 ${totalPreview} ${totalPreview}`} style={{ display: "block" }}>
                {Array.from({ length: PREVIEW_TILES }).map((_, r) =>
                  Array.from({ length: PREVIEW_TILES }).map((_, c) => (
                    <g key={`${r}-${c}`} transform={`translate(${c * PREVIEW_TILE},${r * PREVIEW_TILE})`}>
                      {previewFillUrls && previewFillUrls[r][c] && (
                        <image href={previewFillUrls[r][c]} x={0} y={0} width={PREVIEW_TILE} height={PREVIEW_TILE} />
                      )}
                      <TileLines active={active} strokeColor={strokeColor} strokeWidth={strokeWidth} size={PREVIEW_TILE} />
                    </g>
                  ))
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 10, textTransform: "uppercase", letterSpacing: "1.5px", color: "#555" };
const btnStyle = { padding: "5px 12px", fontSize: 11, fontFamily: "inherit", background: "transparent", color: "#666", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, cursor: "pointer" };
const btnSmall = { padding: "3px 8px", fontSize: 10, fontFamily: "inherit", background: "transparent", color: "#666", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, cursor: "pointer" };