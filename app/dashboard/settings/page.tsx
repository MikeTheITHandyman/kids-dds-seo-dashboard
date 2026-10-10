export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings & Users</h1>
        <p className="text-slate-500">Manage dashboard access and roles</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">Authorized Users</h2>
          <button className="px-4 py-2 bg-[#6B4BC8] text-white rounded-lg hover:bg-opacity-90 transition-colors text-sm font-medium">
            Add User
          </button>
        </div>
        
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-sm font-semibold text-slate-600">Email</th>
              <th className="p-4 text-sm font-semibold text-slate-600">Role</th>
              <th className="p-4 text-sm font-semibold text-slate-600">Status</th>
              <th className="p-4 text-sm font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="p-4 text-sm text-slate-800">admin@kidsdds.com</td>
              <td className="p-4 text-sm text-slate-800">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">ADMIN</span>
              </td>
              <td className="p-4 text-sm text-slate-800">Active</td>
              <td className="p-4 text-sm text-slate-800 text-right">
                <button className="text-slate-400 hover:text-[#6B4BC8]">Edit</button>
              </td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="p-4 text-sm text-slate-800">analyst@kidsdds.com</td>
              <td className="p-4 text-sm text-slate-800">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">ANALYST</span>
              </td>
              <td className="p-4 text-sm text-slate-800">Active</td>
              <td className="p-4 text-sm text-slate-800 text-right">
                <button className="text-slate-400 hover:text-[#6B4BC8]">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
