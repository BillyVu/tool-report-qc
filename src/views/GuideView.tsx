import React from 'react';
import {
  ArrowLeft, CheckCircle2, ClipboardCheck, Clock, ExternalLink, FileCheck2,
  FileText, KeyRound, Link, ShieldCheck, Smartphone, UserCheck, Camera,
  Upload, Download, AlertTriangle, Settings, History, LayoutDashboard, ListChecks
} from 'lucide-react';
import { VeroBrand } from '../components/branding/VeroBrand';

const appUrl = 'https://qc.apexdev.website/';

const sections = [
  {
    id: 'tong-quan', icon: ClipboardCheck, title: 'Tổng quan hệ thống', badge: 'Dùng cho QC · QA · Admin', tone: 'emerald',
    intro: 'Vero QC quản lý kiểm tra chất lượng theo lệnh, từng bước và ảnh bằng chứng. Mỗi thao tác quan trọng đều cần có dữ liệu đủ để truy vết.',
    cards: [
      ['Công nhân / QC', 'Mở link được cấp, check-in, chụp đúng slot ảnh, chọn PASS/FAIL và nộp kết quả.'],
      ['QA / Admin', 'Tạo lệnh, kiểm tra ảnh, duyệt hoặc từ chối từng bước, sau đó xuất báo cáo Word.'],
    ],
  },
  {
    id: 'dashboard', icon: LayoutDashboard, title: 'Dashboard', badge: 'Theo dõi tổng', tone: 'teal',
    intro: 'Dùng để nắm tình hình vận hành theo khoảng thời gian đã chọn: tổng lệnh, lệnh đang làm, lệnh hoàn thành và lô có lỗi.',
    bullets: ['Tỷ lệ đạt chỉ tính các lô đã kết thúc: Đã hoàn thành / (Đã hoàn thành + Có lỗi). Lô Đang làm không làm thay đổi tỷ lệ này.', 'Dùng bộ lọc 24 giờ, 7 ngày hoặc toàn bộ trước khi đọc KPI.', 'Khi Lô hàng có lỗi bằng 0, dashboard xác nhận không có lô cần xử lý thay vì dẫn tới danh sách trống.'],
  },
  {
    id: 'lenh-kiem-tra', icon: ListChecks, title: 'Lệnh kiểm tra', badge: 'Khu vực thao tác chính', tone: 'amber',
    intro: 'Danh sách lệnh cho phép tìm theo mã lô/sản phẩm, lọc trạng thái và theo dõi tiến độ duyệt của Admin.',
    bullets: ['Chỉ báo “Admin x/y duyệt” là số bước đã được QA/Admin duyệt trên tổng số bước của lô.', 'Copy link chỉ áp dụng cho link Worker còn hiệu lực. “Link cũ” không copy nhanh được vì thiếu token đã lưu.', 'Nếu lô vẫn Đang làm nhưng link Worker hết hạn, bấm “Gia hạn link Worker” để gia hạn và copy link mới.'],
  },
  {
    id: 'kiem-duyet', icon: ShieldCheck, title: 'Kiểm duyệt bước QC', badge: 'Điểm kiểm soát chính', tone: 'rose',
    intro: 'Mở chi tiết lệnh để kiểm tra từng bước, ảnh bằng chứng, ghi chú công nhân và kết quả Vero trước khi đưa ra quyết định.',
    bullets: ['Đối chiếu số ảnh thực tế với số ảnh bắt buộc, rồi xem đúng nhãn Slot và nội dung từng ảnh.', 'Chỉ duyệt khi đủ toàn bộ ảnh bắt buộc. Nút duyệt bị khóa khi còn thiếu ảnh; API cũng từ chối yêu cầu duyệt thiếu bằng chứng.', 'Nếu từ chối, ghi rõ ảnh/góc chụp nào cần bổ sung để công nhân có thể xử lý ngay.'],
  },
  {
    id: 'checklist', icon: FileCheck2, title: 'Mẫu checklist', badge: 'Quản lý tiêu chuẩn', tone: 'teal',
    intro: 'Mẫu quyết định các bước kiểm tra, số ảnh yêu cầu, loại ảnh và mapping xuất Word của tất cả lệnh tạo sau đó.',
    bullets: ['Kiểm tra phần xem nhanh: số ảnh, ghi chú, trạng thái và trạng thái Mapping Word của từng bước.', 'Mỗi Slot phải có nhãn rõ để công nhân biết cần chụp gì và QA có thể đối chiếu ảnh đúng vị trí.', 'Dùng Preview Worker để xem luồng Desktop/Mobile trước khi lưu mẫu.'],
  },
  {
    id: 'audit-log', icon: History, title: 'Nhật ký Audit log', badge: 'Phục vụ truy vết', tone: 'emerald',
    intro: 'Audit log lưu thời gian, người thực hiện, hành động và thay đổi dữ liệu để phục vụ kiểm toán nội bộ.',
    bullets: ['Dòng gắn với lệnh hiển thị mã lô cụ thể; thao tác cấu hình chung hiển thị “Hệ thống / Không áp dụng”.', 'Với thay đổi trạng thái và ghi chú, xem Giá trị cũ/Giá trị mới để xác định chính xác nội dung bị thay đổi.', 'Tìm theo lô, người thực hiện hoặc hành động khi cần điều tra sai lệch.'],
  },
  {
    id: 'cai-dat', icon: Settings, title: 'Cài đặt hệ thống', badge: 'Chỉ dành cho Admin', tone: 'amber',
    intro: 'Cấu hình thông tin báo cáo, API key, kích thước ảnh Word, tần số đồng bộ, Vero và danh mục loại ảnh.',
    bullets: ['API key được che mặc định. Chỉ bật biểu tượng mắt khi cần kiểm tra và không lưu key trên máy dùng chung.', 'Bấm Test kết nối trước khi lưu key mới.', 'Kích thước khung ảnh và tần số đồng bộ phải là số lớn hơn 0.'],
  },
];

const screenshots = [
  { src: '/guide/actual-login-page.png', title: 'Đăng nhập Admin', caption: 'Mở Vero QC hoặc chọn Hướng dẫn ở màn hình đăng nhập.' },
  { src: '/guide/actual-guide-overview-desktop.png', title: 'Guide trên desktop', caption: 'Nội dung, mục lục và hướng dẫn thao tác trên màn hình lớn.' },
  { src: '/guide/actual-guide-overview-mobile.png', title: 'Guide trên điện thoại', caption: 'Bố cục tối ưu để đọc tại xưởng trên điện thoại.' },
];

const workerFlow = [
  ['Mở link Worker', Smartphone], ['Check-in người thao tác', UserCheck], ['Chụp đúng từng Slot', Camera], ['Chọn PASS/FAIL và ghi chú', CheckCircle2], ['Nộp báo cáo khi đã đủ ảnh', Upload],
];

const toneClasses: Record<string, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  teal: 'border-teal-200 bg-teal-50 text-teal-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
};

export const GuideView: React.FC = () => (
  <div className="min-h-screen bg-[#f7f6f2] text-[#28251d]">
    <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-teal-800 focus:px-4 focus:py-2 focus:text-white">Bỏ qua tới nội dung</a>
    <header className="border-b border-[#dfdcd6] bg-[radial-gradient(circle_at_top_right,rgba(1,105,111,.09),transparent_30%),radial-gradient(circle_at_top_left,rgba(150,66,25,.06),transparent_24%)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_.9fr] lg:items-end lg:px-8">
        <div>
          <div className="flex items-center gap-3"><VeroBrand compact /><span className="rounded-full bg-[#d9e8e5] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#01696f]">Vero QC · User guide</span></div>
          <h1 className="mt-5 max-w-xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Hướng dẫn vận hành kiểm tra chất lượng</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#696760] sm:text-base">Tài liệu thao tác chuẩn cho công nhân QC, QA kiểm duyệt và Admin: từ nhận lệnh, thu thập ảnh đến duyệt và truy vết dữ liệu.</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold"><a href={appUrl} className="inline-flex items-center gap-2 rounded-lg bg-[#01696f] px-4 py-2.5 text-white hover:bg-[#0c4e54]"><ExternalLink className="h-4 w-4" />Mở Vero QC</a><a href={appUrl} className="inline-flex items-center gap-2 rounded-lg border border-[#d4d1ca] bg-white px-4 py-2.5 text-[#28251d] hover:bg-[#f3f0ec]"><ArrowLeft className="h-4 w-4" />Về đăng nhập</a></div>
        </div>
        <aside className="rounded-2xl border border-black/10 bg-white/70 p-6 shadow-sm backdrop-blur"><h2 className="font-bold">Dùng guide này khi</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-[#696760]"><li><strong className="text-[#28251d]">Công nhân:</strong> cần biết ảnh nào phải chụp và khi nào được nộp.</li><li><strong className="text-[#28251d]">QA:</strong> cần duyệt đúng bằng chứng hoặc yêu cầu bổ sung.</li><li><strong className="text-[#28251d]">Admin:</strong> cần cấu hình mẫu, link và truy vết thay đổi.</li></ul></aside>
      </div>
    </header>

    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8">
      <aside className="h-fit rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm lg:sticky lg:top-4"><p className="px-2 pb-2 text-sm font-extrabold">Mục lục</p><nav className="grid gap-1">{sections.map((section, index) => <a key={section.id} href={`#${section.id}`} className="rounded-lg px-2 py-2 text-xs font-semibold text-[#696760] hover:bg-white hover:text-[#01696f]">{index + 1}. {section.title}</a>)}<a href="#quy-chuan" className="rounded-lg px-2 py-2 text-xs font-semibold text-[#696760] hover:bg-white hover:text-[#01696f]">8. Quy chuẩn vận hành</a><a href="#faq" className="rounded-lg px-2 py-2 text-xs font-semibold text-[#696760] hover:bg-white hover:text-[#01696f]">9. Câu hỏi thường gặp</a></nav></aside>

      <main id="content" className="min-w-0">
        <section className="border-b border-[#dfdcd6] py-8 first:pt-0"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-extrabold">Ảnh hướng dẫn thực tế</h2><p className="mt-2 text-sm leading-6 text-[#696760]">Ảnh chụp từ Vero QC để người mới nhận diện đúng giao diện.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">Ảnh thật trong app</span></div><div className="grid gap-4 md:grid-cols-2">{screenshots.map((shot) => <figure key={shot.src} className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"><img src={shot.src} alt={shot.title} className="w-full border-b border-black/10 bg-slate-100" /><figcaption className="p-4"><h3 className="text-sm font-bold">{shot.title}</h3><p className="mt-1 text-xs leading-5 text-[#696760]">{shot.caption}</p></figcaption></figure>)}</div></section>

        {sections.map((section, index) => { const Icon = section.icon; return <section id={section.id} key={section.id} className="scroll-mt-4 border-b border-[#dfdcd6] py-9"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-bold text-[#01696f]"><Icon className="h-4 w-4" />PHẦN {index + 1}</div><h2 className="mt-2 text-2xl font-extrabold">{section.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#696760]">{section.intro}</p></div><span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${toneClasses[section.tone]}`}>{section.badge}</span></div>{section.cards && <div className="mt-5 grid gap-4 sm:grid-cols-2">{section.cards.map(([title, body]) => <article key={title} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm"><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#696760]">{body}</p></article>)}</div>}{section.bullets && <ol className="mt-5 grid gap-3">{section.bullets.map((bullet, bulletIndex) => <li key={bullet} className="flex gap-3 rounded-xl border border-black/10 bg-white p-4 text-sm leading-6 text-[#696760]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d9e8e5] text-xs font-extrabold text-[#01696f]">{bulletIndex + 1}</span><span>{bullet}</span></li>)}</ol>}</section>; })}

        <section id="quy-chuan" className="scroll-mt-4 border-b border-[#dfdcd6] py-9"><div className="flex items-center gap-2 text-xs font-bold text-[#01696f]"><CheckCircle2 className="h-4 w-4" />PHẦN 8</div><h2 className="mt-2 text-2xl font-extrabold">Quy chuẩn vận hành</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><article className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-bold">Trạng thái & link</h3><p className="mt-2 text-sm leading-6 text-[#696760]">Đang làm là trạng thái lô. Hết hạn là trạng thái link Worker; gia hạn link không tự đổi trạng thái lô.</p></article><article className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-bold">Tiêu chuẩn ảnh</h3><p className="mt-2 text-sm leading-6 text-[#696760]">Ảnh rõ, đúng đối tượng, đúng góc và đúng Slot. Không dùng ảnh không liên quan hoặc mờ.</p></article><article className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-bold">Comment từ chối</h3><p className="mt-2 text-sm leading-6 text-[#696760]">Nêu lỗi và hành động cần làm: “Chụp lại IMEI, lấy nét số thứ 8–15”, không ghi chung chung.</p></article></div><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><AlertTriangle className="mr-2 inline h-4 w-4" />Không xuất Word hoặc duyệt bước khi chưa đủ ảnh bắt buộc.</div></section>

        <section id="faq" className="scroll-mt-4 py-9"><h2 className="text-2xl font-extrabold">Câu hỏi thường gặp</h2><div className="mt-5 grid gap-3"><details className="rounded-xl border border-black/10 bg-white p-4"><summary className="cursor-pointer font-bold">Lô đang làm nhưng link Worker hết hạn thì sao?</summary><p className="mt-3 text-sm leading-6 text-[#696760]">Admin bấm Gia hạn link Worker. Đây là thời hạn link, không mâu thuẫn với trạng thái lô đang xử lý.</p></details><details className="rounded-xl border border-black/10 bg-white p-4"><summary className="cursor-pointer font-bold">Thiếu một ảnh bắt buộc có duyệt bước được không?</summary><p className="mt-3 text-sm leading-6 text-[#696760]">Không. Hệ thống khóa nút duyệt và API từ chối duyệt cho tới khi đủ ảnh bằng chứng.</p></details><details className="rounded-xl border border-black/10 bg-white p-4"><summary className="cursor-pointer font-bold">Khi nào cần xem Audit log?</summary><p className="mt-3 text-sm leading-6 text-[#696760]">Khi cần biết ai thay đổi trạng thái, ghi chú, mẫu checklist hoặc kiểm tra chênh lệch dữ liệu của một lô.</p></details></div><div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white/70 p-6"><div><h3 className="font-bold">Sẵn sàng thao tác?</h3><p className="mt-1 text-sm text-[#696760]">Mở Vero QC để bắt đầu tạo lệnh hoặc kiểm duyệt.</p></div><a href={appUrl} className="inline-flex items-center gap-2 rounded-lg bg-[#01696f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0c4e54]"><Download className="h-4 w-4" />Mở Vero QC</a></div></section>
      </main>
    </div>
  </div>
);
