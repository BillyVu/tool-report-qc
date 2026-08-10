import React, { useEffect, useRef, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { AlertTriangle, Camera, Check, ImageUp, RefreshCw, X } from 'lucide-react';
import { CaptureFrame } from '../../types/qc';
import { calculateSharpness, cropPhotoArea, PixelCropArea, MIN_SHARPNESS_SCORE } from '../../utils/photoCapture';

type CaptureMode = 'CAMERA' | 'UPLOAD';

interface PhotoCaptureModalProps {
  key?: string;
  mode: CaptureMode;
  frame: CaptureFrame;
  aspectRatio?: number;
  selectedFile?: File;
  slotLabel: string;
  initialError?: string;
  onClose: () => void;
  onComplete: (file: File, sharpnessScore: number) => void;
}

export function PhotoCaptureModal({ mode, frame, aspectRatio, selectedFile, slotLabel, initialError, onClose, onComplete }: PhotoCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [source, setSource] = useState<File | null>(selectedFile || null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<PixelCropArea | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [isStartingCamera, setIsStartingCamera] = useState(mode === 'CAMERA' && !selectedFile);
  const [isPreparing, setIsPreparing] = useState(false);
  const [sharpnessError, setSharpnessError] = useState(initialError || '');
  const aspect = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : frame === 'SQUARE' ? 1 : 4 / 3;
  const frameLabel = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
    ? `tỉ lệ ${Math.round(aspectRatio * 100)}%`
    : frame === 'SQUARE' ? 'Vuông 1:1' : 'Chữ nhật 4:3';

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!source) return;
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

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

  const resetCrop = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
    setSharpnessError('');
  };

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
    resetCrop();
  };

  const preparePhoto = async () => {
    if (!source || !cropArea) return;
    setIsPreparing(true);
    setSharpnessError('');
    try {
      const cropped = await cropPhotoArea(source, cropArea);
      const score = await calculateSharpness(cropped);
      if (score < MIN_SHARPNESS_SCORE) {
        setSharpnessError('Ảnh bị mờ hoặc thiếu chi tiết. Hãy căn lại sản phẩm, chụp ảnh rõ nét hơn.');
        return;
      }
      onComplete(cropped, score);
    } catch (error) {
      setSharpnessError(error instanceof Error ? error.message : 'Không thể xử lý ảnh.');
    } finally {
      setIsPreparing(false);
    }
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Căn chỉnh ảnh ${slotLabel}`}>
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-950 sm:h-auto sm:max-h-[94dvh] sm:rounded-lg sm:border sm:border-slate-700">
        <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3 text-white">
          <div className="min-w-0"><p className="text-xs font-semibold text-sky-300">Khung ảnh QC {frameLabel}</p><h2 className="truncate text-sm font-bold">{slotLabel}</h2></div>
          <button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </header>
        <main className="flex min-h-0 flex-1 flex-col justify-center p-4">
          {!source && <div className="mx-auto w-full max-w-2xl">
            <div className="relative mx-auto overflow-hidden border-2 border-sky-300 bg-black shadow-[0_0_0_9999px_rgba(15,23,42,0.5)]" style={{ aspectRatio: String(aspect), maxHeight: '58dvh' }}>
              {!cameraError && <video ref={videoRef} className={`h-full w-full object-cover ${isStartingCamera ? 'hidden' : ''}`} playsInline muted />}
              {isStartingCamera && <div className="grid h-full place-items-center text-sm text-slate-300"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Đang mở camera...</div>}
              <div className="pointer-events-none absolute inset-3 border border-dashed border-white/90" />
            </div>
            <p className="mt-3 text-center text-xs text-slate-300">Đặt sản phẩm chính vào giữa khung, đủ sáng và lấy nét trước khi chụp.</p>
            {cameraError && <div className="mt-3 flex items-start gap-2 border border-amber-400/50 bg-amber-300/10 p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" />{cameraError}</div>}
            <div className="mt-4 flex gap-3">
              {!cameraError && <button type="button" onClick={() => void captureFromCamera()} disabled={isStartingCamera} className="flex flex-1 items-center justify-center gap-2 bg-sky-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Camera className="h-5 w-5" />Chụp ảnh</button>}
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-slate-600 py-3 text-sm font-bold text-white hover:bg-slate-800"><ImageUp className="h-5 w-5" />Tải ảnh<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSource(file); resetCrop(); } }} /></label>
            </div>
          </div>}
          {source && <div className="mx-auto w-full max-w-2xl">
            <div className="relative h-[min(58dvh,34rem)] overflow-hidden border-2 border-sky-300 bg-black">
              {sourceUrl && <Cropper image={sourceUrl} crop={crop} zoom={zoom} aspect={aspect} showGrid={false} restrictPosition onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_area: Area, pixels: Area) => setCropArea(pixels)} />}
            </div>
            <p className="mt-3 text-center text-xs text-slate-300">Kéo ảnh để căn giữa, dùng hai ngón tay để phóng to/thu nhỏ.</p>
            {sharpnessError && <div className="mt-3 flex items-start gap-2 border border-red-400/50 bg-red-400/10 p-3 text-xs text-red-100"><AlertTriangle className="h-4 w-4 shrink-0" />{sharpnessError}</div>}
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => { setSource(null); resetCrop(); }} className="flex-1 border border-slate-600 py-3 text-sm font-bold text-white hover:bg-slate-800">Chụp/chọn lại</button>
              <button type="button" onClick={() => void preparePhoto()} disabled={isPreparing || !cropArea} className="flex flex-1 items-center justify-center gap-2 bg-sky-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"><Check className="h-5 w-5" />{isPreparing ? 'Đang kiểm tra...' : 'Dùng ảnh này'}</button>
            </div>
          </div>}
        </main>
      </div>
    </div>
  );
}
