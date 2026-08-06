import { useEffect, useRef } from 'react';
import { driver, type DriveStep, type Driver } from 'driver.js';

export type TemplateQuickTourKind = 'management' | 'builder';

interface TemplateQuickTourProps {
  kind: TemplateQuickTourKind;
  onReady?: (startTour: () => void) => void;
}

const managementSteps: DriveStep[] = [
  {
    element: '[data-tour="template-page-title"]',
    popover: {
      title: 'Mẫu Checklist',
      description: 'Quản lý quy trình kiểm tra và file Word cho từng dòng sản phẩm.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-create"]',
    popover: {
      title: 'Tạo mẫu mới',
      description: 'Tạo checklist QC và cấu hình Word DOCX cho sản phẩm mới tại đây.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="template-search"]',
    popover: {
      title: 'Tìm mẫu nhanh',
      description: 'Tìm theo tên mẫu, mã sản phẩm hoặc tên file Word.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-list"]',
    popover: {
      title: 'Danh sách & cấu hình',
      description: 'Xem mapping, nhân bản hoặc chọn “Sửa & Cấu hình” để cập nhật mẫu.',
      side: 'top',
      align: 'center',
    },
  },
];

const builderSteps: DriveStep[] = [
  {
    element: '[data-tour="template-form-title"]',
    popover: {
      title: 'Tạo mẫu Checklist',
      description: 'Thiết lập thông tin mẫu, quy trình kiểm tra và báo cáo Word trong một luồng.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-form-basics"]',
    popover: {
      title: 'Thông tin & file DOCX',
      description: 'Nhập tên mẫu, mã sản phẩm và tên file Word được dùng để xuất báo cáo.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-form-presets"]',
    popover: {
      title: 'Nạp quy trình mẫu',
      description: 'Nạp mẫu X530, 6 bước chuẩn hoặc tự thêm bước kiểm tra mới.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-form-steps"]',
    popover: {
      title: 'Cấu hình từng bước',
      description: 'Sắp xếp bước, yêu cầu ảnh, tiêu chí đạt và mở cấu hình mapping Word cho từng bước.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="template-form-preview"]',
    popover: {
      title: 'Xem trước worker',
      description: 'Kiểm tra trải nghiệm công nhân trước khi lưu mẫu.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="template-form-save"]',
    popover: {
      title: 'Lưu mẫu',
      description: 'Lưu checklist và cấu hình DOCX để sử dụng khi tạo lệnh kiểm tra.',
      side: 'top',
      align: 'end',
    },
  },
];

export const TemplateQuickTour = ({ kind, onReady }: TemplateQuickTourProps) => {
  const driverRef = useRef<Driver | null>(null);
  const startTourRef = useRef<() => void>(() => undefined);
  const steps = kind === 'management' ? managementSteps : builderSteps;

  useEffect(() => {
    const startTour = () => {
      driverRef.current?.destroy();
      const tour = driver({
        steps,
        animate: true,
        overlayColor: '#020617',
        overlayOpacity: 0.76,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        allowKeyboardControl: true,
        overlayClickBehavior: 'close',
        disableActiveInteraction: true,
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: 'quick-tour-popover',
        showButtons: ['previous', 'next', 'close'],
        showProgress: true,
        progressText: `{{current}}/${steps.length}`,
        nextBtnText: 'Tiếp',
        prevBtnText: 'Quay lại',
        doneBtnText: 'Hoàn tất',
        onPopoverRender: (popover) => {
          popover.closeButton.textContent = 'Bỏ qua';
          popover.closeButton.setAttribute('aria-label', 'Bỏ qua hướng dẫn nhanh');
          popover.footerButtons.append(popover.closeButton);
        },
        onCloseClick: (_element, _step, options) => options.driver.destroy(),
        onDoneClick: (_element, _step, options) => options.driver.destroy(),
      });

      driverRef.current = tour;
      tour.drive();
    };

    startTourRef.current = startTour;
    onReady?.(() => startTourRef.current());

    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [onReady, steps]);

  return null;
};
