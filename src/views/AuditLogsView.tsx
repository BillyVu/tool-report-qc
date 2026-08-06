import React, { useEffect, useState } from 'react';
import { History, ShieldAlert, UserCheck, Calendar, Search, Trash2 } from 'lucide-react';
import { AuditLogEntry } from '../types/qc';
import { adminApi } from '../services/adminApi';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadError, setLoadError] = useState('');

  const reloadLogs = async () => {
    setLoadError('');
    try {
      setLogs(await adminApi.listAuditLogs());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được audit logs từ server.');
    }
  };

  useEffect(() => {
    void reloadLogs();
  }, []);

  const filteredLogs = logs.filter(l => 
    l.jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.adminName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.fieldChanged.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Nhật Ký Lịch Sử Audit Log Chỉnh Sửa Dữ Liệu
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Đảm bảo tính minh bạch ISO 9001: Lưu trữ vết tất cả thao tác chỉnh sửa ghi chú, đổi trạng thái lô hàng của QC Admin
        </p>
      </div>

      {/* Search Bar */}
      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {loadError}. Kiểm tra Admin API Key trong mục Cài đặt.
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã lô, người thực hiện, hành động..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="text-xs text-slate-500">
          Tổng số <strong>{filteredLogs.length}</strong> nhật ký thao tác
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                <th className="py-3.5 px-4">Thời Gian</th>
                <th className="py-3.5 px-4">QC Admin Thực Hiện</th>
                <th className="py-3.5 px-4">Lô Hàng</th>
                <th className="py-3.5 px-4">Hành Động & Trưởng Trường</th>
                <th className="py-3.5 px-4">Giá Trị Cũ (Old Value)</th>
                <th className="py-3.5 px-4">Giá Trị Mới (New Value)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{log.adminName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {log.jobId === 'Hệ thống' ? <span className="font-sans text-[11px] text-slate-500">Hệ thống / Không áp dụng</span> : log.jobId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{log.action}</div>
                      <div className="text-[10px] text-slate-400">Trường: {log.fieldChanged}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate italic bg-slate-50/50">
                      {log.oldValue || '— Không có dữ liệu trước'}
                    </td>
                    <td className="py-3 px-4 text-emerald-800 font-medium max-w-[200px] truncate bg-emerald-50/30">
                      {log.newValue}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    Chưa có nhật ký ghi nhận thao tác chỉnh sửa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
