import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, FlipHorizontal2, FlipVertical2, ImageUp, RefreshCw, RotateCw, X } from 'lucide-react';
import { CaptureFrame } from '../../types/qc';
import {
  ASPECT_PRESETS,
  containScale,
  displayToNorm,
  normToDisplay,
  Point,
  Quad,
  rectForAspect,
  RectNorm,
} from '../../utils/photoTransform';
import {
  buildWorkCanvas,
  calculateSharpness,
  loadImage,
  MIN_SHARPNESS_SCORE,
  renderAdvancedCrop,
} from '../../utils/photoCapture';

type CaptureMode = 'CAMERA' | 'UPLOAD';
type AspectMode = 'FREE' | '16:9' | '4:3' | '1:1' | '9:16' | 'SLOT';

interface PhotoCaptureModalProps {
  key?: string;
  mode: CaptureMode;
  frame: CaptureFrame;
  aspectRatio?: number;
  selectedFile?: File;
  initialImageUrl?: string;
  slotLabel: string;
  initialError?: string;
  onClose: () => void;
  onComplete: (file: File, sharpnessScore: number, outputAspect?: number) => void;
}

type DragState =
  | { kind: 'FREE_CORNER'; target: keyof Quad }
  | { kind: 'FREE_EDGE'; target: 'top' | 'right' | 'bottom' | 'left'; startQuad: Quad }
  | { kind: 'RECT_MOVE'; startRect: RectNorm }
  | { kind: 'RECT_CORNER'; target: 'tl' | 'tr' | 'br' | 'bl'; startRect: RectNorm }
  | { kind: 'RECT_EDGE'; target: 'top' | 'right' | 'bottom' | 'left'; startRect: RectNorm };

const FREE_EDGE_CORNERS: Record<'top' | 'right' | 'bottom' | 'left', Array<keyof Quad>> = {
  top: ['tl', 'tr'],
  right: ['tr', 'br'],
  bottom: ['bl', 'br'],
  left: ['tl', 'bl'],
};

function clampRect(r: RectNorm, min = 0.04): RectNorm {
  const w = Math.max(min, r.w);
  const h = Math.max(min, r.h);
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

export function PhotoCaptureModal({ mode, frame, aspectRatio, selectedFile, initialImageUrl, slotLabel, initialError, onClose, onComplete }: PhotoCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const initializedRef = useRef(false);
  const initialLoadedRef = useRef(false);

  const [source, setSource] = useState<File | null>(selectedFile || null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(Boolean(initialImageUrl && !selectedFile));
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [work, setWork] = useState<{ canvas: HTMLCanvasElement; w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspectMode, setAspectMode] = useState<AspectMode>('4:3');
  const [quad, setQuad] = useState<Quad>({ tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } });
  const [cropRect, setCropRect] = useState<RectNorm>({ x: 0, y: 0, w: 1, h: 1 });
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [quality, setQuality] = useState(0.85);
  const [cameraError, setCameraError] = useState('');
  const [isStartingCamera, setIsStartingCamera] = useState(mode === 'CAMERA' && !selectedFile && !initialImageUrl);
  const [isPreparing, setIsPreparing] = useState(false);
  const [sharpnessError, setSharpnessError] = useState(initialError || '');

  const slotAspect = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null;

  const presets = useMemo<Array<{ key: AspectMode; label: string; value: number | null }>>(() => {
    const list: Array<{ key: AspectMode; label: string; value: number | null }> = ASPECT_PRESETS.map((p) => ({ ...p, key: p.key as AspectMode }));
    if (slotAspect) list.push({ key: 'SLOT', label: `Báo cáo ${Math.round(slotAspect * 100)}%`, value: slotAspect });
    return list;
  }, [slotAspect]);

  const presetValue = (modeKey: AspectMode): number | null => {
    if (modeKey === 'SLOT') return slotAspect;
    return presets.find((p) => p.key === modeKey)?.value ?? null;
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!initialImageUrl || source || selectedFile || initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    let cancelled = false;
    const loadExistingImage = async () => {
      setIsLoadingInitial(true);
      setSharpnessError('');
      try {
        const response = await fetch(initialImageUrl);
        if (!response.ok) throw new Error('Không tải được ảnh hiện tại từ server.');
        const blob = await response.blob();
        if (cancelled) return;
        setSource(new File([blob], `current-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' }));
      } catch (error) {
        if (!cancelled) setSharpnessError(error instanceof Error ? error.message : 'Không tải được ảnh hiện tại từ server.');
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    };
    void loadExistingImage();
    return () => {
      cancelled = true;
    };
  }, [initialImageUrl, source, selectedFile]);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    loadImage(source)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch(() => {
        if (!cancelled) setSharpnessError('Không thể đọc ảnh. Hãy chọn ảnh khác.');
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (!image) {
      setWork(null);
      return;
    }
    const canvas = buildWorkCanvas(image, rotation, flipH, flipV);
    setWork({ canvas, w: canvas.width, h: canvas.height });
  }, [image, rotation, flipH, flipV]);

  useEffect(() => {
    if (!image || initializedRef.current) return;
    initializedRef.current = true;
    setAspectMode(slotAspect ? 'SLOT' : frame === 'SQUARE' ? '1:1' : '4:3');
  }, [image, slotAspect, frame]);

  useEffect(() => {
    if (!work) return;
    if (aspectMode === 'FREE') {
      setQuad({ tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } });
      return;
    }
    setCropRect(rectForAspect(work.w / work.h, presetValue(aspectMode) || 4 / 3));
  }, [aspectMode, work]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setContainerSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = previewCanvasRef.current;
    if (!el || !work) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.drawImage(work.canvas, 0, 0);
  }, [work]);

  useEffect(() => {
    if (source || mode !== 'CAMERA') return;
    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Thiết bị hoặc trình duyệt này không hỗ trợ mở camera.');
        setIsStartingCamera(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError('Không thể mở camera sau. Hãy cấp quyền camera hoặc tải ảnh từ thiết bị.');
      } finally {
        if (!cancelled) setIsStartingCamera(false);
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [mode, source]);

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không thể chụp ảnh.')), 'image/jpeg', 0.9));
    stopCamera();
    setSource(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    setSharpnessError('');
  };

  const resetEditor = () => {
    setSource(null);
    setImage(null);
    setWork(null);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setQuad({ tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } });
    setCropRect({ x: 0, y: 0, w: 1, h: 1 });
    initializedRef.current = false;
    setSharpnessError('');
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  const fit = useMemo(() => {
    if (!work || !containerSize) return null;
    return containScale(containerSize.w, containerSize.h, work.w, work.h);
  }, [work, containerSize]);

  const quadDisp = useMemo(() => {
    if (!fit) return null;
    return {
      tl: normToDisplay(quad.tl, fit),
      tr: normToDisplay(quad.tr, fit),
      br: normToDisplay(quad.br, fit),
      bl: normToDisplay(quad.bl, fit),
    };
  }, [quad, fit]);

  const rectDisp = useMemo(() => {
    if (!fit) return null;
    return {
      x: fit.offsetX + cropRect.x * fit.dispW,
      y: fit.offsetY + cropRect.y * fit.dispH,
      w: cropRect.w * fit.dispW,
      h: cropRect.h * fit.dispH,
    };
  }, [cropRect, fit]);

  const edgeMid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const startDrag = (state: DragState) => (e: React.PointerEvent<SVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = state;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  const onDragMove = (e: PointerEvent) => {
    const state = dragRef.current;
    const start = dragStartRef.current;
    if (!state || !start || !fit || !containerRef.current) return;
    const box = containerRef.current.getBoundingClientRect();
    const normPos = displayToNorm(e.clientX - box.left, e.clientY - box.top, fit);

    if (state.kind === 'FREE_CORNER') {
      setQuad((prev) => ({ ...prev, [state.target]: normPos }));
    } else if (state.kind === 'FREE_EDGE') {
      const corners = FREE_EDGE_CORNERS[state.target];
      const dx = e.clientX - start.clientX;
      const dy = e.clientY - start.clientY;
      const moved: Partial<Quad> = {};
      corners.forEach((key) => {
        const disp = normToDisplay(state.startQuad[key], fit);
        moved[key] = displayToNorm(disp.x + dx, disp.y + dy, fit);
      });
      setQuad((prev) => ({ ...prev, ...moved }));
    } else if (state.kind === 'RECT_MOVE') {
      const dx = (e.clientX - start.clientX) / fit.dispW;
      const dy = (e.clientY - start.clientY) / fit.dispH;
      const x = Math.min(1 - state.startRect.w, Math.max(0, state.startRect.x + dx));
      const y = Math.min(1 - state.startRect.h, Math.max(0, state.startRect.y + dy));
      setCropRect({ ...state.startRect, x, y });
    } else if (state.kind === 'RECT_CORNER' || state.kind === 'RECT_EDGE') {
      const r = state.startRect;
      const aspect = r.w / r.h;
      const min = 0.04;
      let next: RectNorm;
      if (state.kind === 'RECT_CORNER') {
        let w = state.target === 'tr' || state.target === 'br' ? normPos.x - r.x : r.x + r.w - normPos.x;
        let h = state.target === 'bl' || state.target === 'br' ? normPos.y - r.y : r.y + r.h - normPos.y;
        w = Math.max(min, w);
        h = Math.max(min, h);
        if (w / h > aspect) h = w / aspect;
        else w = h * aspect;
        next = {
          x: state.target === 'tl' || state.target === 'bl' ? r.x + r.w - w : r.x,
          y: state.target === 'tl' || state.target === 'tr' ? r.y + r.h - h : r.y,
          w,
          h,
        };
      } else {
        // edge: adjust one dimension, keep aspect
        if (state.target === 'right') {
          const w = Math.max(min, normPos.x - r.x);
          next = { x: r.x, y: r.y, w, h: w / aspect };
        } else if (state.target === 'left') {
          const w = Math.max(min, r.x + r.w - normPos.x);
          next = { x: r.x + r.w - w, y: r.y, w, h: w / aspect };
        } else if (state.target === 'bottom') {
          const h = Math.max(min, normPos.y - r.y);
          next = { x: r.x, y: r.y, w: h * aspect, h };
        } else {
          const h = Math.max(min, r.y + r.h - normPos.y);
          next = { x: r.x, y: r.y + r.h - h, w: h * aspect, h };
        }
      }
      setCropRect(clampRect(next, min));
    }
  };

  const onDragEnd = () => {
    dragRef.current = null;
    dragStartRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  };

  const preparePhoto = async () => {
    if (!work) return;
    setIsPreparing(true);
    setSharpnessError('');
    try {
      const free = aspectMode === 'FREE';
      const result = await renderAdvancedCrop({
        image: work.canvas,
        width: work.w,
        height: work.h,
        mode: free ? 'FREE' : 'ASPECT',
        quad: free ? quad : undefined,
        rect: free ? undefined : cropRect,
        format,
        quality,
        maxSide: 1600,
      });
      const score = await calculateSharpness(result.file);
      if (score < MIN_SHARPNESS_SCORE) {
        setSharpnessError('Ảnh bị mờ hoặc thiếu chi tiết. Hãy căn lại sản phẩm, chụp ảnh rõ nét hơn.');
        return;
      }
      onComplete(result.file, score, result.outputAspect);
    } catch (error) {
      setSharpnessError(error instanceof Error ? error.message : 'Không thể xử lý ảnh.');
    } finally {
      setIsPreparing(false);
    }
  };

  const aspectLabel = presets.find((p) => p.key === aspectMode)?.label || '4:3';

  const cornerKeys: Array<keyof Quad> = ['tl', 'tr', 'br', 'bl'];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Căn chỉnh ảnh ${slotLabel}`}>
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-950 sm:h-auto sm:max-h-[94dvh] sm:rounded-lg sm:border sm:border-slate-700">
        <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3 text-white">
          <div className="min-w-0"><p className="text-xs font-semibold text-sky-300">Căn chỉnh ảnh · {aspectLabel}</p><h2 className="truncate text-sm font-bold">{slotLabel}</h2></div>
          <button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col justify-center p-4">
          {!source && (
            <div className="mx-auto w-full max-w-2xl">
              {isLoadingInitial ? (
                <div className="flex aspect-video max-h-[55dvh] flex-col items-center justify-center gap-3 border-2 border-sky-300 bg-black text-sm text-slate-300">
                  <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
                  Đang tải ảnh hiện tại để cắt lại...
                </div>
              ) : mode === 'CAMERA' ? (
                <>
                  <div className="relative mx-auto overflow-hidden border-2 border-sky-300 bg-black aspect-video max-h-[55dvh]">
                    {!cameraError && <video ref={videoRef} className={`h-full w-full object-cover ${isStartingCamera ? 'hidden' : ''}`} playsInline muted />}
                    {isStartingCamera && <div className="grid h-full place-items-center text-sm text-slate-300"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Đang mở camera...</div>}
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-300">Đặt sản phẩm chính vào giữa khung, đủ sáng và lấy nét trước khi chụp.</p>
                  {cameraError && <div className="mt-3 flex items-start gap-2 border border-amber-400/50 bg-amber-300/10 p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" />{cameraError}</div>}
                  <div className="mt-4 flex gap-3">
                    {!cameraError && <button type="button" onClick={() => void captureFromCamera()} disabled={isStartingCamera} className="flex flex-1 items-center justify-center gap-2 bg-sky-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Camera className="h-5 w-5" />Chụp ảnh</button>}
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-slate-600 py-3 text-sm font-bold text-white hover:bg-slate-800"><ImageUp className="h-5 w-5" />Tải ảnh<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSource(file); setSharpnessError(''); } }} /></label>
                  </div>
                </>
              ) : (
                <>
                  <div className="mx-auto flex aspect-video max-h-[55dvh] flex-col items-center justify-center gap-4 border-2 border-dashed border-sky-500 bg-slate-900 p-8 text-center">
                    <p className="text-sm font-semibold text-slate-200">Chọn ảnh từ thiết bị để cắt lại hoặc thay thế ảnh công nhân đã gửi</p>
                    <label className="flex cursor-pointer items-center justify-center gap-2 border border-slate-600 bg-slate-800 px-8 py-4 text-sm font-bold text-white hover:bg-slate-700">
                      <ImageUp className="h-5 w-5" />Tải ảnh lên<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSource(file); setSharpnessError(''); } }} />
                    </label>
                    <p className="text-[11px] text-slate-500">Định dạng JPG / PNG / WEBP</p>
                  </div>
                </>
              )}
            </div>
          )}

          {source && (
            <div className="mx-auto w-full max-w-2xl">
              <div ref={containerRef} className="relative h-[48dvh] overflow-hidden border-2 border-sky-300 bg-black touch-none">
                {work && fit && (
                  <>
                    <canvas
                      ref={previewCanvasRef}
                      width={work.w}
                      height={work.h}
                      className="absolute"
                      style={{ left: fit.offsetX, top: fit.offsetY, width: fit.dispW, height: fit.dispH }}
                    />
                    <svg width={containerSize?.w || 0} height={containerSize?.h || 0} className="absolute inset-0" style={{ touchAction: 'none' }}>
                      <defs>
                        <mask id="crop-mask">
                          <rect width={containerSize?.w || 0} height={containerSize?.h || 0} fill="white" />
                          <polygon
                            points={
                              aspectMode === 'FREE' && quadDisp
                                ? [quadDisp.tl, quadDisp.tr, quadDisp.br, quadDisp.bl].map((p) => `${p.x},${p.y}`).join(' ')
                                : rectDisp
                                  ? `${rectDisp.x},${rectDisp.y} ${rectDisp.x + rectDisp.w},${rectDisp.y} ${rectDisp.x + rectDisp.w},${rectDisp.y + rectDisp.h} ${rectDisp.x},${rectDisp.y + rectDisp.h}`
                                  : ''
                            }
                            fill="black"
                          />
                        </mask>
                      </defs>

                      <rect width={containerSize?.w || 0} height={containerSize?.h || 0} fill="rgba(2,6,23,0.6)" mask="url(#crop-mask)" />

                      {aspectMode === 'FREE' && quadDisp && (
                        <>
                          <polygon
                            points={[quadDisp.tl, quadDisp.tr, quadDisp.br, quadDisp.bl].map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth={2}
                          />
                          <line x1={(quadDisp.tl.x + quadDisp.tr.x) / 2} y1={(quadDisp.tl.y + quadDisp.tr.y) / 2} x2={(quadDisp.bl.x + quadDisp.br.x) / 2} y2={(quadDisp.bl.y + quadDisp.br.y) / 2} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
                          <line x1={(quadDisp.tl.x + quadDisp.bl.x) / 2} y1={(quadDisp.tl.y + quadDisp.bl.y) / 2} x2={(quadDisp.tr.x + quadDisp.br.x) / 2} y2={(quadDisp.tr.y + quadDisp.br.y) / 2} stroke="#38bdf8" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
                          {cornerKeys.map((key) => (
                            <circle key={key} cx={quadDisp[key].x} cy={quadDisp[key].y} r={10} fill="#0ea5e9" stroke="#e0f2fe" strokeWidth={2} style={{ cursor: 'pointer' }} onPointerDown={startDrag({ kind: 'FREE_CORNER', target: key })} />
                          ))}
                          {(['top', 'right', 'bottom', 'left'] as const).map((edge) => {
                            const [a, b] = FREE_EDGE_CORNERS[edge];
                            const mid = edgeMid(quadDisp[a], quadDisp[b]);
                            return <rect key={edge} x={mid.x - 7} y={mid.y - 7} width={14} height={14} fill="#f8fafc" stroke="#38bdf8" strokeWidth={1.5} style={{ cursor: 'pointer' }} onPointerDown={startDrag({ kind: 'FREE_EDGE', target: edge, startQuad: quad })} />;
                          })}
                        </>
                      )}

                      {aspectMode !== 'FREE' && rectDisp && (
                        <>
                          <rect x={rectDisp.x} y={rectDisp.y} width={rectDisp.w} height={rectDisp.h} fill="none" stroke="#38bdf8" strokeWidth={2} />
                          <rect
                            x={rectDisp.x}
                            y={rectDisp.y}
                            width={rectDisp.w}
                            height={rectDisp.h}
                            fill="rgba(56,189,248,0.08)"
                            style={{ cursor: 'move' }}
                            onPointerDown={startDrag({ kind: 'RECT_MOVE', startRect: cropRect })}
                          />
                          {(['tl', 'tr', 'br', 'bl'] as const).map((key) => {
                            const cx = key === 'tl' || key === 'bl' ? rectDisp!.x : rectDisp!.x + rectDisp!.w;
                            const cy = key === 'tl' || key === 'tr' ? rectDisp!.y : rectDisp!.y + rectDisp!.h;
                            return <rect key={key} x={cx - 8} y={cy - 8} width={16} height={16} fill="#0ea5e9" stroke="#e0f2fe" strokeWidth={2} style={{ cursor: 'nwse-resize' }} onPointerDown={startDrag({ kind: 'RECT_CORNER', target: key, startRect: cropRect })} />;
                          })}
                          {(['top', 'right', 'bottom', 'left'] as const).map((edge) => {
                            const cx = edge === 'left' ? rectDisp!.x : edge === 'right' ? rectDisp!.x + rectDisp!.w : rectDisp!.x + rectDisp!.w / 2;
                            const cy = edge === 'top' ? rectDisp!.y : edge === 'bottom' ? rectDisp!.y + rectDisp!.h : rectDisp!.y + rectDisp!.h / 2;
                            return <rect key={edge} x={cx - 7} y={cy - 7} width={14} height={14} fill="#f8fafc" stroke="#38bdf8" strokeWidth={1.5} style={{ cursor: 'pointer' }} onPointerDown={startDrag({ kind: 'RECT_EDGE', target: edge, startRect: cropRect })} />;
                          })}
                        </>
                      )}
                    </svg>
                  </>
                )}
              </div>

              {/* Toolbar */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setAspectMode(preset.key as AspectMode)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${aspectMode === preset.key ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700" title="Xoay 90°"><RotateCw className="h-3.5 w-3.5" />90°</button>
                <button type="button" onClick={() => setFlipH((v) => !v)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${flipH ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`} title="Lật ngang"><FlipHorizontal2 className="h-3.5 w-3.5" />Ngang</button>
                <button type="button" onClick={() => setFlipV((v) => !v)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${flipV ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`} title="Lật dọc"><FlipVertical2 className="h-3.5 w-3.5" />Dọc</button>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="flex-1 min-w-28 h-1.5 accent-sky-500"
                  aria-label="Góc xoay"
                />
                <span className="text-[10px] text-slate-400 w-8 text-right">{rotation}°</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setFormat('jpeg')} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${format === 'jpeg' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>JPEG</button>
                <button type="button" onClick={() => setFormat('png')} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${format === 'png' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>PNG</button>
                {format === 'jpeg' && (
                  <div className="flex flex-1 items-center gap-2 min-w-28">
                    <input type="range" min={0.5} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="flex-1 h-1.5 accent-sky-500" aria-label="Chất lượng JPEG" />
                    <span className="text-[10px] text-slate-400 w-10 text-right">{Math.round(quality * 100)}%</span>
                  </div>
                )}
              </div>

              {sharpnessError && <div className="mt-3 flex items-start gap-2 border border-red-400/50 bg-red-400/10 p-3 text-xs text-red-100"><AlertTriangle className="h-4 w-4 shrink-0" />{sharpnessError}</div>}
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={resetEditor} className="flex-1 border border-slate-600 py-3 text-sm font-bold text-white hover:bg-slate-800">Chụp/chọn lại</button>
                <button type="button" onClick={() => void preparePhoto()} disabled={isPreparing || !work} className="flex flex-1 items-center justify-center gap-2 bg-sky-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Check className="h-5 w-5" />{isPreparing ? 'Đang xử lý...' : 'Dùng ảnh này'}</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
