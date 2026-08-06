import React, { useState } from 'react';
import { Plus, Check, X, FileText, Upload, Sparkles, AlertCircle, Eye, Trash2 } from 'lucide-react';
import { ChecklistTemplate, InspectionStep, DocxMapping, DefectItem, PackagingInfoData, OtherInfoData } from '../../types/qc';
import { StepDraggableList } from './StepDraggableList';
import { DocxMappingModal } from './DocxMappingModal';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { validateTemplateMappings } from '../../utils/docxMapping';

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ChecklistTemplate | null;
  onSave: (template: ChecklistTemplate) => Promise<void> | void;
}

export const TemplateFormModal: React.FC<TemplateFormModalProps> = ({
  isOpen,
  onClose,
  template,
  onSave
}) => {
  if (!isOpen) return null;

  const isEdit = !!template;
  const [activeTab, setActiveTab] = useState<'BASIC' | 'STEPS' | 'DEFECTS' | 'PACKAGING' | 'OTHER'>('BASIC');

  const [title, setTitle] = useState(template?.title || '');
  const [productCode, setProductCode] = useState(template?.productCode || '');
  const [productName, setProductName] = useState(template?.productName || '');
  const [docxTemplateName, setDocxTemplateName] = useState(template?.docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx');
  const [version, setVersion] = useState(template?.version || '1.0.0');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Extended Report Header Metadata
  const [clientName, setClientName] = useState(template?.clientName || 'ATT (Attn: Ava)');
  const [supplierName, setSupplierName] = useState(template?.supplierName || 'EAGLEON (VN) COMPANY LIMITED (CÔNG TY TNHH EAGLEON (VN))');
  const [supplierLocation, setSupplierLocation] = useState(template?.supplierLocation || 'Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam');
  const [supplierContact, setSupplierContact] = useState(template?.supplierContact || 'Ms. Linh / Xu Yuxin');
  const [serviceRequired, setServiceRequired] = useState(template?.serviceRequired || 'FQC (Final Quality Control) / FRI (Final Random Inspection)');
  const [aqlStandard, setAqlStandard] = useState(template?.aqlStandard || 'ISO 2859-1 (Single sampling plans for normal inspection)');
  const [inspectionLevel, setInspectionLevel] = useState(template?.inspectionLevel || 'Full inspection (Kiểm tra 100% lô hàng)');
  const [orderQty, setOrderQty] = useState(template?.orderQty || '117 pcs');
  const [cartonQty, setCartonQty] = useState(template?.cartonQty || '24 cartons');
  const [cartonSpec, setCartonSpec] = useState(template?.cartonSpec || '310 x 195 x 125 mm');
  const [deviceSpec, setDeviceSpec] = useState(template?.deviceSpec || '164.22 × 66.59 × 21.91 mm');
  const [systemVersion, setSystemVersion] = useState(template?.systemVersion || '15');
  const [hardwareVersion, setHardwareVersion] = useState(template?.hardwareVersion || 'V1.0');
  const [buildNumber, setBuildNumber] = useState(template?.buildNumber || 'X53.0-04-15.0-10.30.00');

  // New Sections State
  const [defectsFindingData, setDefectsFindingData] = useState<DefectItem[]>(
    template?.defectsFindingData || [
      { id: 'DEF_1', description: 'Surface scratch 016724000204989', defectType: 'Minor', count: 1 },
      { id: 'DEF_2', description: 'Scratch Protected Film 016724000199288', defectType: 'Minor', count: 1 },
      { id: 'DEF_3', description: "Wrinkled IMEI's seal 016724000176104", defectType: 'Minor', count: 1 }
    ]
  );

  const [packagingInfoData, setPackagingInfoData] = useState<PackagingInfoData>(
    template?.packagingInfoData || {
      cartonSpec: template?.cartonSpec || '310 x 195 x 125 mm',
      cartonMeasuredSize: '310x195x125mm',
      cartonNw: '2758.5g',
      cartonGw: '3348.7g',
      cartonResult: 'For refer',
      deviceSpec: template?.deviceSpec || '164.22 × 66.59 × 21.91 mm',
      deviceMeasuredSize: '164.22×66.59×21.91mm',
      deviceNw: '201.7g',
      deviceGw: '281.1g',
      deviceResult: 'For refer',
      barcodeData: 'SNM000031 / 6169F',
      barcodeResult: 'PASS'
    }
  );

  const [otherNotes, setOtherNotes] = useState<string>(
    template?.otherInfoData?.notes || 'Ảnh đính kèm bổ sung công đoạn kiểm tra thực tế xưởng sản xuất'
  );

  const [steps, setSteps] = useState<InspectionStep[]>(
    template?.steps || [
      {
        stepId: 'STEP_1',
        title: 'Visual Inspection (Kiểm tra Ngoại quan 100% & Đổi máy lỗi tại chỗ)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 6,
        photoSlots: ['Mặt trước', 'Mặt sau', 'Cạnh trái', 'Cạnh phải', 'Màng bảo vệ', 'Tem IMEI'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không trầy xước bề mặt, màng dán phẳng không nhăn, tem IMEI dán chuẩn',
        mapping: {
          imageTag: '{{photo_visual}}',
          noteTag: '{{note_visual}}',
          statusTag: '{{status_visual}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  );

  // Modal State
  const [activeMappingStepIndex, setActiveMappingStepIndex] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const currentPreviewData: ChecklistTemplate = {
    id: template?.id || 'PREVIEW_TEMP',
    title: title || 'Mẫu QC Chưa Đặt Tên',
    productCode: productCode || 'PHONE_GENERIC',
    productName: productName || title,
    docxTemplateName: docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx',
    version: version || '1.0.0',
    steps: steps,
    createdAt: template?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientName,
    supplierName,
    supplierLocation,
    supplierContact,
    serviceRequired,
    aqlStandard,
    inspectionLevel,
    orderQty,
    cartonQty,
    cartonSpec,
    deviceSpec,
    systemVersion,
    hardwareVersion,
    buildNumber,
    defectsFindingData,
    packagingInfoData,
    otherInfoData: { notes: otherNotes }
  };

  const handleAddDefect = () => {
    const newDefect: DefectItem = {
      id: `DEF_${Date.now()}`,
      description: 'Nhập mô tả lỗi mới...',
      defectType: 'Minor',
      count: 1
    };
    setDefectsFindingData(prev => [...prev, newDefect]);
  };

  const handleUpdateDefect = (id: string, field: keyof DefectItem, val: any) => {
    setDefectsFindingData(prev => prev.map(d => d.id === id ? { ...d, [field]: val } : d));
  };

  const handleRemoveDefect = (id: string) => {
    setDefectsFindingData(prev => prev.filter(d => d.id !== id));
  };

  const handleSaveMapping = (stepIndex: number, mapping: DocxMapping) => {
    setSteps(prev => {
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], mapping };
      return updated;
    });
  };

  const handleFormSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!title.trim() || !productCode.trim()) return;
    setIsSaving(true);
    try {
      await onSave(currentPreviewData);
      onClose();
    } catch (err) {
      setSaveError('Không thể lưu mẫu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#090d16] w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-800">
        {/* Header */}
        <div className="bg-[#0f172a] p-5 border-b border-slate-800 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white">{isEdit ? 'Chỉnh Sửa Checklist' : 'Tạo Checklist Mới'}</h2>
            <p className="text-xs text-slate-400">Cấu hình chi tiết báo cáo kiểm định</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs Bar */}
        <div className="grid grid-cols-5 border-b border-slate-800 bg-[#0f172a] text-center w-full">
          {[
            { key: 'BASIC', label: '1. Thông Tin & Header' },
            { key: 'STEPS', label: `2. Các Bước QC (${steps.length})` },
            { key: 'DEFECTS', label: `3. Danh sách lỗi (${defectsFindingData.length})` },
            { key: 'PACKAGING', label: '4. Đóng Gói (B)' },
            { key: 'OTHER', label: '5. Thông Tin Khác (E)' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-3 px-1 text-xs font-bold border-b-2 transition-all text-center truncate ${
                activeTab === tab.key ? 'border-sky-500 text-sky-400 bg-sky-950/20' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'BASIC' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Tên Mẫu Checklist *</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nhập tên mẫu..." required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Mã Sản Phẩm *</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="VD: X530" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Tên Sản Phẩm Full</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">File Word Mẫu Export (.docx)</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={docxTemplateName} onChange={(e) => setDocxTemplateName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Khách Hàng (Client Name)</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nhà Cung Cấp (Supplier Name)</label>
                <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              </div>
            </div>
          )}

          {activeTab === 'STEPS' && (
            <StepDraggableList steps={steps} setSteps={setSteps} onConfigureMapping={(s, i) => setActiveMappingStepIndex(i)} />
          )}

          {activeTab === 'DEFECTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Danh Sách Lỗi Tìm Được (Mục A-1 AQL and Defects Finding)</h3>
                <button type="button" onClick={handleAddDefect} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Thêm Dòng Lỗi
                </button>
              </div>
              <div className="space-y-2">
                {defectsFindingData.map((d, index) => (
                  <div key={d.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col md:flex-row gap-3 items-center">
                    <span className="text-xs font-bold text-slate-500">{index + 1}.</span>
                    <input
                      className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                      value={d.description}
                      onChange={(e) => handleUpdateDefect(d.id, 'description', e.target.value)}
                      placeholder="Mô tả lỗi..."
                    />
                    <select
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                      value={d.defectType || 'Minor'}
                      onChange={(e) => handleUpdateDefect(d.id, 'defectType', e.target.value)}
                    >
                      <option value="Minor">Minor (Nhẹ)</option>
                      <option value="Major">Major (Nặng)</option>
                      <option value="Critical">Critical (Nghiêm trọng)</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white text-center"
                      value={d.count || 1}
                      onChange={(e) => handleUpdateDefect(d.id, 'count', parseInt(e.target.value) || 1)}
                    />
                    <button type="button" onClick={() => handleRemoveDefect(d.id)} className="p-1 text-slate-400 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'PACKAGING' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* B-3 Packaging */}
                <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-3) Packaging Information (Thùng Carton)</h4>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Quy Cách Chuẩn Thùng Carton (Carton Spec)</label>
                    <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={cartonSpec} onChange={(e) => setCartonSpec(e.target.value)} placeholder="VD: 310 x 195 x 125 mm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Kích Thước Đo Thực Tế (Measured Size)</label>
                    <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonMeasuredSize || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonMeasuredSize: e.target.value }))} placeholder="VD: 310 x 195 x 125 mm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Khối Lượng N.W (g)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonNw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonNw: e.target.value }))} placeholder="2758.5g" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Khối Lượng G.W (g)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonGw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonGw: e.target.value }))} placeholder="3348.7g" />
                    </div>
                  </div>
                </div>

                {/* B-4 Device Measurement */}
                <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-4) Device Measurement (Thiết Bị)</h4>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Quy Cách Chuẩn Thiết Bị (Device Spec)</label>
                    <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={deviceSpec} onChange={(e) => setDeviceSpec(e.target.value)} placeholder="VD: 164.22 × 66.59 × 21.91 mm" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Kích Thước Đo Thực Tế (Measured Size)</label>
                    <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceMeasuredSize || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceMeasuredSize: e.target.value }))} placeholder="VD: 164.22 × 66.59 × 21.91 mm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Trọng Lượng N.W (g)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceNw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceNw: e.target.value }))} placeholder="201.7g" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Trọng Lượng G.W (g)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceGw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceGw: e.target.value }))} placeholder="281.1g" />
                    </div>
                  </div>
                </div>
              </div>

              {/* B-5 Barcode Check */}
              <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-5) Barcode Check (Mã Vạch Barcode)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Số Barcode Mẫu / Mã Vạch Quét</label>
                    <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.barcodeData || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, barcodeData: e.target.value }))} placeholder="VD: SNM000031 / 6169F" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Kết Quả Kiểm Tra Barcode</label>
                    <select className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.barcodeResult || 'PASS'} onChange={(e) => setPackagingInfoData(p => ({ ...p, barcodeResult: e.target.value }))}>
                      <option value="PASS">PASS (Đạt mã vạch)</option>
                      <option value="FAIL">FAIL (Lỗi mã vạch)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'OTHER' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-300">Ghi Chú Mục E. OTHER INFORMATION</label>
              <textarea
                className="w-full h-32 p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                value={otherNotes}
                onChange={(e) => setOtherNotes(e.target.value)}
                placeholder="Nhập ghi chú hoặc mô tả bổ sung cho Mục E..."
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-[#0f172a]">
          <button type="button" onClick={() => setIsPreviewOpen(true)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-sky-400" /> Xem Trước Mẫu (Preview)
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-slate-300 hover:text-white">Hủy</button>
            <button type="button" onClick={handleFormSubmit} disabled={isSaving} className="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-bold text-white shadow-lg shadow-sky-600/30">
              {isSaving ? 'Đang Lưu...' : 'Lưu Mẫu QC'}
            </button>
          </div>
        </div>
      </div>

      <DocxMappingModal
        isOpen={activeMappingStepIndex !== null}
        onClose={() => setActiveMappingStepIndex(null)}
        step={activeMappingStepIndex !== null ? steps[activeMappingStepIndex] : null}
        stepIndex={activeMappingStepIndex ?? 0}
        docxTemplateName={docxTemplateName}
        onSaveMapping={handleSaveMapping}
      />
      <TemplatePreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} template={currentPreviewData} />
    </div>
  );
};
