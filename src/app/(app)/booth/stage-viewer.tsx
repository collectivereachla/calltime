"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { updateElementPosition } from "./set-design-actions";

interface Piece {
  id: string;
  name: string;
  pos_x: number;
  pos_y: number;
  width_ft: number;
  depth_ft: number;
  height_ft: number;
  rotation: number;
  color: string;
  status: string;
}

interface StageConfig {
  stage_width: number;
  stage_depth: number;
  proscenium_width: number;
  proscenium_height: number;
  grid_size: number;
}

interface Props {
  pieces: Piece[];
  config: StageConfig;
  canManage: boolean;
  onRefresh: () => void;
}

const SCALE = 12; // pixels per foot

export function StageViewer({ pieces, config, canManage, onRefresh }: Props) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-bone overflow-hidden">
          <button onClick={() => setMode("2d")}
            className={`px-3 py-1.5 text-body-xs font-medium transition-colors ${mode === "2d" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"}`}>
            Ground Plan
          </button>
          <button onClick={() => setMode("3d")}
            className={`px-3 py-1.5 text-body-xs font-medium transition-colors ${mode === "3d" ? "bg-ink text-paper" : "bg-card text-ash hover:text-ink"}`}>
            3D Model
          </button>
        </div>
        <span className="text-body-xs text-muted ml-auto">
          {config.stage_width}' × {config.stage_depth}' stage
        </span>
      </div>

      {mode === "2d" ? (
        <GroundPlan pieces={pieces} config={config} canManage={canManage} onRefresh={onRefresh} />
      ) : (
        <ThreeDView pieces={pieces} config={config} />
      )}
    </div>
  );
}

// ─── 2D GROUND PLAN ──────────────────────────────────────
function GroundPlan({ pieces, config, canManage, onRefresh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const w = config.stage_width * SCALE;
  const h = config.stage_depth * SCALE;
  const pad = 40;
  const viewW = w + pad * 2;
  const viewH = h + pad * 2 + 30; // extra for audience label

  function toSvg(ftX: number, ftY: number) {
    return { x: pad + (ftX + config.stage_width / 2) * SCALE, y: pad + ftY * SCALE };
  }

  function toFt(svgX: number, svgY: number) {
    return { x: (svgX - pad) / SCALE - config.stage_width / 2, y: (svgY - pad) / SCALE };
  }

  function getSvgPoint(e: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const scaleX = viewW / rect.width;
    const scaleY = viewH / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent, piece: Piece) {
    if (!canManage) return;
    e.stopPropagation();
    const pt = getSvgPoint(e);
    const pos = toSvg(piece.pos_x, piece.pos_y);
    setDragging({ id: piece.id, offsetX: pt.x - pos.x, offsetY: pt.y - pos.y });
    setSelected(piece.id);
  }

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const pt = getSvgPoint(e);
    const ft = toFt(pt.x - dragging.offsetX, pt.y - dragging.offsetY);
    // Snap to grid
    const snap = config.grid_size;
    ft.x = Math.round(ft.x / snap) * snap;
    ft.y = Math.round(ft.y / snap) * snap;
    // Update locally (will save on pointer up)
    const piece = pieces.find((p) => p.id === dragging.id);
    if (piece) { piece.pos_x = ft.x; piece.pos_y = ft.y; }
    // Force re-render by updating dragging ref
    setDragging({ ...dragging });
  }, [dragging, config.grid_size, pieces]);

  const handlePointerUp = useCallback(async () => {
    if (!dragging) return;
    const piece = pieces.find((p) => p.id === dragging.id);
    if (piece) {
      await updateElementPosition(piece.id, { pos_x: piece.pos_x, pos_y: piece.pos_y });
    }
    setDragging(null);
    onRefresh();
  }, [dragging, pieces, onRefresh]);

  // Grid lines
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = 0; x <= config.stage_width; x += config.grid_size) {
    const sx = pad + x * SCALE;
    gridLines.push({ x1: sx, y1: pad, x2: sx, y2: pad + h });
  }
  for (let y = 0; y <= config.stage_depth; y += config.grid_size) {
    const sy = pad + y * SCALE;
    gridLines.push({ x1: pad, y1: sy, x2: pad + w, y2: sy });
  }

  // Center line
  const cx = pad + (config.stage_width / 2) * SCALE;

  // Proscenium
  const prosL = pad + ((config.stage_width - config.proscenium_width) / 2) * SCALE;
  const prosR = prosL + config.proscenium_width * SCALE;

  return (
    <div className="bg-card border border-bone rounded-card p-3 overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="w-full max-w-3xl mx-auto select-none"
        style={{ touchAction: "none" }}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onClick={() => setSelected(null)}
      >
        {/* Grid */}
        {gridLines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#E8E1D2" strokeWidth={0.5} />
        ))}

        {/* Stage outline */}
        <rect x={pad} y={pad} width={w} height={h} fill="none" stroke="#1A1A1B" strokeWidth={2} />

        {/* Center line */}
        <line x1={cx} y1={pad} x2={cx} y2={pad + h} stroke="#C4522D" strokeWidth={1} strokeDasharray="6 4" />

        {/* Proscenium */}
        <line x1={prosL} y1={pad + h} x2={prosR} y2={pad + h} stroke="#C4522D" strokeWidth={3} />

        {/* Audience label */}
        <text x={viewW / 2} y={pad + h + 22} textAnchor="middle" className="text-[10px]" fill="#A39E96">
          AUDIENCE
        </text>

        {/* Upstage label */}
        <text x={viewW / 2} y={pad - 8} textAnchor="middle" className="text-[10px]" fill="#A39E96">
          UPSTAGE
        </text>

        {/* Set pieces */}
        {pieces.filter((p) => p.status !== "cut").map((piece) => {
          const pos = toSvg(piece.pos_x, piece.pos_y);
          const pw = piece.width_ft * SCALE;
          const pd = piece.depth_ft * SCALE;
          const isSelected = selected === piece.id;
          const isDragging = dragging?.id === piece.id;

          return (
            <g key={piece.id}
              transform={`translate(${pos.x}, ${pos.y}) rotate(${piece.rotation}, ${pw / 2}, ${pd / 2})`}
              onMouseDown={(e) => handlePointerDown(e, piece)}
              onTouchStart={(e) => handlePointerDown(e, piece)}
              style={{ cursor: canManage ? "grab" : "default" }}
            >
              <rect
                width={pw} height={pd}
                fill={piece.color}
                fillOpacity={0.6}
                stroke={isSelected ? "#C4522D" : "#1A1A1B"}
                strokeWidth={isSelected ? 2 : 1}
                rx={2}
              />
              <text
                x={pw / 2} y={pd / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#1A1A1B"
                className="text-[9px] font-medium"
                style={{ pointerEvents: "none" }}
              >
                {piece.name.length > 12 ? piece.name.slice(0, 11) + "…" : piece.name}
              </text>
              {/* Dimensions */}
              {isSelected && (
                <text x={pw / 2} y={pd + 12} textAnchor="middle" fill="#7A726A" className="text-[8px]">
                  {piece.width_ft}' × {piece.depth_ft}' × {piece.height_ft}'h
                </text>
              )}
            </g>
          );
        })}

        {/* Scale indicator */}
        <line x1={pad} y1={viewH - 8} x2={pad + 10 * SCALE} y2={viewH - 8} stroke="#7A726A" strokeWidth={1} />
        <text x={pad + 5 * SCALE} y={viewH - 12} textAnchor="middle" fill="#7A726A" className="text-[8px]">10'</text>
      </svg>
      {canManage && <p className="text-body-xs text-muted text-center mt-2">Drag pieces to position them. Click to select.</p>}
    </div>
  );
}

// ─── 3D VIEW ──────────────────────────────────────────────
function ThreeDView({ pieces, config }: { pieces: Piece[]; config: StageConfig }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    async function init() {
      try {
        const THREE = await import("three");

        const container = mountRef.current;
        if (!container) return;

        const width = container.clientWidth;
        const height = Math.min(500, width * 0.6);

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#FAF7F1");

        // Camera
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
        camera.position.set(0, 30, 40);
        camera.lookAt(0, 0, -5);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(10, 20, 15);
        scene.add(directional);

        // Stage floor
        const floorGeo = new THREE.PlaneGeometry(config.stage_width, config.stage_depth);
        const floorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -config.stage_depth / 2);
        scene.add(floor);

        // Grid on floor
        const gridHelper = new THREE.GridHelper(Math.max(config.stage_width, config.stage_depth), Math.max(config.stage_width, config.stage_depth) / config.grid_size, 0x444444, 0x333333);
        gridHelper.position.set(0, 0.01, -config.stage_depth / 2);
        scene.add(gridHelper);

        // Proscenium arch (simple frame)
        const archMat = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
        // Left pillar
        const pillarGeo = new THREE.BoxGeometry(1, config.proscenium_height, 1);
        const leftPillar = new THREE.Mesh(pillarGeo, archMat);
        leftPillar.position.set(-config.proscenium_width / 2, config.proscenium_height / 2, 0);
        scene.add(leftPillar);
        // Right pillar
        const rightPillar = new THREE.Mesh(pillarGeo, archMat);
        rightPillar.position.set(config.proscenium_width / 2, config.proscenium_height / 2, 0);
        scene.add(rightPillar);
        // Top beam
        const beamGeo = new THREE.BoxGeometry(config.proscenium_width + 1, 1, 1);
        const beam = new THREE.Mesh(beamGeo, archMat);
        beam.position.set(0, config.proscenium_height, 0);
        scene.add(beam);

        // Set pieces
        for (const piece of pieces.filter((p) => p.status !== "cut")) {
          const geo = new THREE.BoxGeometry(piece.width_ft, piece.height_ft, piece.depth_ft);
          const color = new THREE.Color(piece.color);
          const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(
            piece.pos_x,
            piece.height_ft / 2,
            -(piece.pos_y + piece.depth_ft / 2)
          );
          mesh.rotation.y = -(piece.rotation * Math.PI) / 180;
          scene.add(mesh);

          // Wireframe
          const wire = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
          );
          wire.position.copy(mesh.position);
          wire.rotation.copy(mesh.rotation);
          scene.add(wire);
        }

        // Manual orbit controls
        let isDragging = false;
        let prevX = 0;
        let prevY = 0;
        let theta = 0;
        let phi = Math.PI / 4;
        let radius = 45;
        const target = new THREE.Vector3(0, 4, -config.stage_depth / 3);

        function updateCamera() {
          camera.position.set(
            target.x + radius * Math.sin(phi) * Math.sin(theta),
            target.y + radius * Math.cos(phi),
            target.z + radius * Math.sin(phi) * Math.cos(theta)
          );
          camera.lookAt(target);
        }

        function onMouseDown(e: MouseEvent) { isDragging = true; prevX = e.clientX; prevY = e.clientY; }
        function onMouseUp() { isDragging = false; }
        function onMouseMove(e: MouseEvent) {
          if (!isDragging) return;
          theta += (e.clientX - prevX) * 0.005;
          phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, phi - (e.clientY - prevY) * 0.005));
          prevX = e.clientX;
          prevY = e.clientY;
          updateCamera();
        }
        function onWheel(e: WheelEvent) {
          e.preventDefault();
          radius = Math.max(10, Math.min(80, radius + e.deltaY * 0.05));
          updateCamera();
        }

        // Touch orbit
        function onTouchStart(e: TouchEvent) {
          if (e.touches.length === 1) { isDragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY; }
        }
        function onTouchEnd() { isDragging = false; }
        function onTouchMove(e: TouchEvent) {
          if (!isDragging || e.touches.length !== 1) return;
          e.preventDefault();
          theta += (e.touches[0].clientX - prevX) * 0.005;
          phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, phi - (e.touches[0].clientY - prevY) * 0.005));
          prevX = e.touches[0].clientX;
          prevY = e.touches[0].clientY;
          updateCamera();
        }

        const el = renderer.domElement;
        el.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("mousemove", onMouseMove);
        el.addEventListener("wheel", onWheel, { passive: false });
        el.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchend", onTouchEnd);
        el.addEventListener("touchmove", onTouchMove, { passive: false });

        updateCamera();

        // Render loop
        let animId: number;
        function animate() {
          animId = requestAnimationFrame(animate);
          renderer.render(scene, camera);
        }
        animate();

        cleanup = () => {
          cancelAnimationFrame(animId);
          el.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("mouseup", onMouseUp);
          window.removeEventListener("mousemove", onMouseMove);
          el.removeEventListener("wheel", onWheel);
          el.removeEventListener("touchstart", onTouchStart);
          window.removeEventListener("touchend", onTouchEnd);
          el.removeEventListener("touchmove", onTouchMove);
          renderer.dispose();
          if (container.contains(el)) container.removeChild(el);
        };
      } catch (err) {
        setError("Failed to load 3D viewer");
        console.error(err);
      }
    }

    init();
    return () => { if (cleanup) cleanup(); };
  }, [pieces, config]);

  if (error) {
    return <div className="bg-card border border-bone rounded-card px-6 py-10 text-center"><p className="text-body-md text-ash">{error}</p></div>;
  }

  return (
    <div className="bg-card border border-bone rounded-card overflow-hidden">
      <div ref={mountRef} className="w-full" style={{ minHeight: 300 }} />
      <p className="text-body-xs text-muted text-center py-2">Drag to orbit · Scroll to zoom · Touch supported</p>
    </div>
  );
}
