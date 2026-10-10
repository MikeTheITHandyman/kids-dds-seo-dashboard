import { ReactNode } from 'react';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-[#6B4BC8]">Kids DDS Analytics</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="block px-4 py-2 rounded text-slate-700 hover:bg-slate-100 hover:text-[#6B4BC8]">
            Overview
          </Link>
          <Link href="/dashboard/search-visibility" className="block px-4 py-2 rounded text-slate-700 hover:bg-slate-100 hover:text-[#6B4BC8]">
            Search Engines
          </Link>
          <Link href="/dashboard/llm-visibility" className="block px-4 py-2 rounded text-slate-700 hover:bg-slate-100 hover:text-[#6B4BC8]">
            LLM Visibility
          </Link>
          <Link href="/dashboard/analytics" className="block px-4 py-2 rounded text-slate-700 hover:bg-slate-100 hover:text-[#6B4BC8]">
            Web Analytics
          </Link>
          <Link href="/dashboard/settings" className="block px-4 py-2 rounded text-slate-700 hover:bg-slate-100 hover:text-[#6B4BC8]">
            Settings & Users
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-200">
          {/* User Profile / Logout */}
          <div className="text-sm text-slate-500">Logged in via Google</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Dashboard</h2>
          <div>
             {/* additional topbar controls could go here */}
          </div>
        </header>
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
