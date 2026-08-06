import { useEffect, useRef } from 'react';
import { driver, type Driver } from 'driver.js';
import type { BrowserStorageLike } from '../../services/adminAuth';

export const QUICK_TOUR_STORAGE_KEY = 'veroqc_tour_seen';

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

function getBrowserStorage(): BrowserStorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function hasQuickTourBeenSeen(storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  try {
    return storage?.getItem(QUICK_TOUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markQuickTourSeen(storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  try {
    storage?.setItem(QUICK_TOUR_STORAGE_KEY, 'true');
  } catch {
    // Tour remains usable when browser privacy settings block localStorage.
  }
}

interface QuickTourProps {
  /** Receives a stable function that replays the complete tour from step one. */
  onStartTour?: (startTour: () => void) => void;
}

export const QuickTour = ({ onStartTour }: QuickTourProps) => {
  const driverRef = useRef<Driver | null>(null);
  const hasHandledAutomaticStart = useRef(false);
  const startTourRef = useRef<(automatic?: boolean) => void>(() => undefined);

  useEffect(() => {
    const startTour = (automatic = false) => {
      if (typeof window === 'undefined' || !window.matchMedia(DESKTOP_MEDIA_QUERY).matches) return;

      driverRef.current?.destroy();

      const tour = driver({
        animate: true,
        overlayColor: '#020617',
        overlayOpacity: 0.76,
        smoothScroll: true,
        allowClose: true,
        allowScroll: false,
        allowKeyboardControl: true,
        overlayClickBehavior: 'close',
        disableActiveInteraction: true,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'quick-tour-popover',
        showButtons: ['previous', 'next', 'close'],
        showProgress: true,
        progressText: '{{current}}/7',
        nextBtnText: 'Tiếp',
        prevBtnText: 'Quay lại',
        doneBtnText: 'Hoàn tất',
        onPopoverRender: (popover) => {
          popover.closeButton.textContent = 'Bỏ qua';
          popover.closeButton.setAttribute('aria-label', 'Bỏ qua hướng dẫn nhanh');
          popover.footerButtons.append(popover.closeButton);
        },
        onCloseClick: (_element, _step, options) => {
          options.driver.destroy();
        },
        onDoneClick: (_element, _step, options) => {
          options.driver.destroy();
        },
        steps: [
          {
            popover: {
              title: 'Chào mừng',
              description: 'Cùng xem nhanh các khu vực chính để quản lý kiểm tra chất lượng hiệu quả hơn.',
            },
          },
          {
            element: '[data-tour="dashboard-nav"]',
            popover: {
              title: 'Bảng điều khiển',
              description: 'Đây là nơi theo dõi KPI real-time của toàn bộ lô hàng.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '[data-tour="dashboard-kpis"]',
            waitForElement: 1500,
            popover: {
              title: 'KPI lô hàng',
              description: 'Theo dõi nhanh số lệnh, tiến độ và lô lỗi.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '[data-tour="create-inspection"]',
            popover: {
              title: 'Tạo lệnh kiểm tra',
              description: 'Bấm vào đây để tạo lệnh kiểm tra chất lượng mới.',
              side: 'bottom',
              align: 'end',
            },
          },
          {
            element: '[data-tour="inspections-nav"]',
            popover: {
              title: 'Lệnh Kiểm tra',
              description: 'Quản lý, duyệt ảnh và xuất báo cáo Word tại đây.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '[data-tour="templates-nav"]',
            popover: {
              title: 'Mẫu Checklist',
              description: 'Cấu hình quy trình kiểm tra và mapping vào file Word.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '[data-tour="guide-link"]',
            popover: {
              title: 'Hướng dẫn đầy đủ',
              description: 'Xem lại tài liệu hướng dẫn đầy đủ bất cứ lúc nào.',
              side: 'right',
              align: 'end',
            },
          },
        ],
      });

      driverRef.current = tour;
      if (automatic) markQuickTourSeen();
      tour.drive();
    };

    startTourRef.current = startTour;
    onStartTour?.(() => startTourRef.current(false));

    if (!hasHandledAutomaticStart.current && !hasQuickTourBeenSeen() && window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      hasHandledAutomaticStart.current = true;
      const frameId = window.requestAnimationFrame(() => startTourRef.current(true));
      return () => {
        window.cancelAnimationFrame(frameId);
        driverRef.current?.destroy();
        driverRef.current = null;
      };
    }

    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [onStartTour]);

  return null;
};
