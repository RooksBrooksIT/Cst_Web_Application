export default function FilterBar({
  tabs = [],
  activeTab = 'all',
  onTabChange,
  searchQuery = '',
  onSearchChange,
  placeholder = 'Search records...',
  rightAction,
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">⌕</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-600 transition-all"
        />
      </div>

      {/* Tabs & Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0B3470] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {rightAction}
      </div>
    </div>
  )
}
