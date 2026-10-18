'use client';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, FileText } from 'lucide-react';

export default function ExportControls({ data, filename = 'export' }: { data: any[], filename?: string }) {
  const [exporting, setExporting] = useState(false);

  const exportToExcel = () => {
    try {
      setExporting(true);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    try {
      setExporting(true);
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.getElementById('dashboard-content');
      if (element) {
        const opt = {
          margin: 0.5,
          filename: `${filename}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
        };
        html2pdf().set(opt).from(element).save();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={exportToExcel}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 active:bg-slate-100 text-xs sm:text-sm font-medium transition-colors shadow-xs"
      >
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span>Excel</span>
      </button>
      <button 
        onClick={exportToPDF}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 active:bg-slate-100 text-xs sm:text-sm font-medium transition-colors shadow-xs"
      >
        <FileText className="h-3.5 w-3.5 text-[#6B4BC8] shrink-0" />
        <span>PDF</span>
      </button>
    </div>
  );
}
