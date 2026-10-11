import Link from 'next/link';
import { ShieldAlert, LogOut, ArrowLeft } from 'lucide-react';

export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
          <p className="text-sm text-slate-600">
            The Google account you signed in with is not authorized to access the <strong>Kids Dental Specialists</strong> SEO & LLM Dashboard.
          </p>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 text-left space-y-1.5">
          <p className="font-semibold text-slate-700">Need access?</p>
          <p>Please contact an administrator at Kids Dental Specialists to have your email address authorized in the system.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/api/auth/signout"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6B4BC8] hover:bg-[#5a3da8] text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <LogOut className="h-4 w-4" />
            Sign Out / Switch Account
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
