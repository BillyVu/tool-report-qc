import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef
} from '@tanstack/react-table';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  Download, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown,
  RefreshCw,
  Share2,
  Copy,
  Zap
} from 'lucide-react';
import { InspectionJob } from '../../types/qc';
import { generateDocxReport } from '../../services/docxExportService';

interface InspectionTableProps {
  jobs: InspectionJob[];
  onSelectJob: (job: InspectionJob) => void;
  onExportSessionUrl?: (job: InspectionJob) => void;
  onQuickGenerateSessionUrl?: (job: InspectionJob) => Promise<void> | void;
  quickSessionState?: Record<string, 'generating' | 'copied' | 'error'>;
  onRefreshData?: () => void;
}

export const InspectionTable: React.FC<InspectionTableProps> = ({
  jobs,
  onSelectJob,
  onExportSessionUrl,
  onQuickGenerateSessionUrl,
  quickSessionState = {},
  onRefreshData
}) => {
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [productCodeFilter, setProductCodeFilter] = useState<string>('ALL');

  // Filter jobs by dropdown options
  const filteredData = useMemo(() => {
    return jobs.filter(job => {
      const matchStatus = statusFilter === 'ALL' || job.status === statusFilter;
      const matchProduct = productCodeFilter === 'ALL' || job.productCode === productCodeFilter;
      return matchStatus && matchProduct;
    });
  }, [jobs, statusFilter, productCodeFilter]);

  const uniqueProductCodes = useMemo(() => {
    return Array.from(new Set(jobs.map(j => j.productCode)));
  }, [jobs]);

  // TanStack Table Column Definitions
  const columns = useMemo<ColumnDef<InspectionJob>[]>(() => [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 hover:text-slate-900 font-bold"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <span>Mã Lệnh QC</span>
          <ArrowUpDown className="w-3 h-3 ml-1" />
        </button>
      ),
      cell: ({ row }) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs">
            {row.original.id}
          </span>
          <div className="text-[11px] text-slate-500 font-medium">
            Lô: <code className="text-slate-700">{row.original.batchNumber}</code>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'productName',
      header: 'Sản Phẩm',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-900 text-xs">{row.original.productName}</div>
          <div className="text-[11px] text-slate-500">Mã: {row.original.productCode}</div>
        </div>
      )
    },
    {
      accessorKey: 'workerName',
      header: 'Công Nhân & Ca',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-800 text-xs">{row.original.workerName}</div>
          <div className="text-[11px] text-slate-500">{row.original.line} • {row.original.shift.split(' ')[0]}</div>
        </div>
      )
    },
    {
      accessorKey: 'status',
      header: 'Trạng Thái QC',
      cell: ({ row }) => {
        const st = row.original.status;
        const reviewSummary = row.original.stepResults.reduce(
          (summary, step) => {
            if (step.moderationStatus === 'APPROVED') summary.approved += 1;
            else if (step.moderationStatus === 'REJECTED') summary.rejected += 1;
            else summary.pending += 1;
            return summary;
          },
          { approved: 0, rejected: 0, pending: 0 },
        );
        return (
          <div>
            {st === 'COMPLETED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                <CheckCircle2 className="w-3 h-3" />
                <span>ĐÃ XONG</span>
              </span>
            )}
            {st === 'FAILED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
                <XCircle className="w-3 h-3" />
                <span>CÓ LỖI</span>
              </span>
            )}
            {st === 'IN_PROGRESS' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                <Clock className="w-3 h-3 animate-spin" />
                <span>ĐANG LÀM</span>
              </span>
            )}
            <div title="Số bước đã được QC Admin duyệt trên tổng số bước của lô" className={`mt-1 text-[10px] font-semibold ${
              reviewSummary.rejected > 0 ? 'text-red-700' : reviewSummary.pending > 0 ? 'text-amber-700' : 'text-blue-700'
            }`}>
              Admin: {reviewSummary.approved}/{row.original.stepResults.length} duyệt
              {reviewSummary.rejected > 0 ? `, ${reviewSummary.rejected} từ chối` : ''}
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: 'createdAt',
      header: 'Thời Gian',
      cell: ({ row }) => (
        <span className="text-xs text-slate-500">
          {new Date(row.original.createdAt).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
          })}
        </span>
      )
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Thao Tác</div>,
      cell: ({ row }) => {
        const quickState = quickSessionState[row.original.id];
        const hasSession = !!row.original.sessionCreatedAt;
        const isSessionExpired = row.original.sessionExpiresAt
          ? new Date(row.original.sessionExpiresAt).getTime() <= Date.now()
          : false;
        const hasCopyableSession = hasSession && !isSessionExpired && !!row.original.sessionToken;
        const hasLegacySession = hasSession && !isSessionExpired && !row.original.sessionToken;
        const defaultLabel = isSessionExpired ? 'Gia hạn link Worker' : hasCopyableSession ? 'Copy link' : hasLegacySession ? 'Link cũ' : 'Tạo link Worker';
        return (
          <div className="flex min-w-[360px] flex-wrap items-center justify-end gap-1.5">
            {onQuickGenerateSessionUrl && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await onQuickGenerateSessionUrl(row.original);
                }}
                disabled={quickState === 'generating'}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 border disabled:opacity-60 ${
                  quickState === 'copied'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                    : quickState === 'error'
                      ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                      : hasCopyableSession
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                      : hasSession && isSessionExpired
                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                      : hasLegacySession
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                }`}
                title={isSessionExpired ? 'Lô vẫn đang làm, nhưng link Worker đã hết hạn. Bấm để gia hạn và copy link mới.' : hasCopyableSession ? 'Copy session link hiện có' : hasLegacySession ? 'Link cũ thiếu token nên không copy nhanh được. Mở quản lý link để xem trạng thái.' : 'Tạo session link lần đầu 24h và copy ngay vào clipboard'}
              >
                {quickState === 'generating' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : quickState === 'copied' || hasCopyableSession ? (
                  <Copy className="w-3.5 h-3.5" />
                ) : hasSession && isSessionExpired ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : hasLegacySession ? (
                  <Share2 className="w-3.5 h-3.5" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>
                  {quickState === 'generating'
                    ? 'Đang gen...'
                    : quickState === 'copied'
                      ? 'Đã copy'
                      : quickState === 'error'
                        ? 'Không copy'
                        : defaultLabel}
                </span>
              </button>
            )}

            {onExportSessionUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExportSessionUrl(row.original);
              }}
              className="px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors flex items-center gap-1 border border-blue-200"
              title="Quản lý Session URL độc lập cho công nhân"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Quản lý link</span>
            </button>
            )}

            <button
            onClick={() => onSelectJob(row.original)}
            className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Xem</span>
            </button>

            <button
            onClick={async (e) => {
              e.stopPropagation();
              await generateDocxReport(row.original);
            }}
            className="px-2.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors flex items-center gap-1"
            title="Xuất Báo Cáo Word (.docx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải Word</span>
            </button>
          </div>
        );
      }
    }
  ], [onSelectJob, onExportSessionUrl, onQuickGenerateSessionUrl, quickSessionState]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      globalFilter
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 8
      }
    }
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden space-y-4">
      {/* Table Filters Topbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col gap-4 bg-slate-50/50 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-1 xl:items-center">
          {/* Global Search Input */}
          <div className="relative sm:col-span-2 xl:col-span-1 xl:max-w-md xl:flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Tìm kiếm mã lô, công nhân, tên sản phẩm..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Status Dropdown Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Tất cả Trạng thái</option>
            <option value="COMPLETED">✅ Chỉ lô ĐẠT (PASS)</option>
            <option value="FAILED">❌ Chỉ lô CÓ LỖI (FAIL)</option>
            <option value="IN_PROGRESS">⏳ Chỉ lô ĐANG LÀM</option>
          </select>

          {/* Product Code Filter */}
          <select
            value={productCodeFilter}
            onChange={(e) => setProductCodeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Tất cả Dòng Sản Phẩm</option>
            {uniqueProductCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>

        {onRefreshData && (
          <button
            onClick={onRefreshData}
            className="self-end p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors xl:self-auto"
            title="Làm mới dữ liệu từ xưởng"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Table Grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left border-collapse text-xs">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="py-3 px-4">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => onSelectJob(row.original)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="py-3.5 px-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-400 italic">
                  Không tìm thấy lô hàng kiểm tra nào phù hợp điều kiện lọc
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Trang <strong>{table.getState().pagination.pageIndex + 1}</strong> / <strong>{table.getPageCount() || 1}</strong> (Tổng <strong>{filteredData.length}</strong> bản ghi)
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
