"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export function SignaturePad({ onChange, width = 500, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Scale canvas for retina displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1A1A1B";
  }, [width, height]);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;

      if ("touches" in e) {
        const touch = e.touches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [width, height]
  );

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    if (!hasDrawn) setHasDrawn(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Export signature as data URL
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasDrawn(false);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <label className="text-body-xs text-muted uppercase tracking-wider">
        Draw your signature
      </label>
      <div className="relative border border-bone rounded-card bg-white overflow-hidden">
        {/* Signature line */}
        <div
          className="absolute bottom-8 left-6 right-6 border-b border-ash/30"
          style={{ pointerEvents: "none" }}
        />
        <div
          className="absolute bottom-4 left-6 text-body-xs text-muted/40 italic select-none"
          style={{ pointerEvents: "none" }}
        >
          {hasDrawn ? "" : "Sign here"}
        </div>

        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair touch-none"
          style={{ height: `${height}px` }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      {hasDrawn && (
        <button
          type="button"
          onClick={clearSignature}
          className="text-body-xs text-ash hover:text-brick transition-colors"
        >
          Clear signature
        </button>
      )}
    </div>
  );
}
