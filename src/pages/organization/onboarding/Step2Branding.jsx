import { useState } from 'react'
import {
  Palette,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Building,
  Smartphone,
  Layers,
  Loader2,
  Pipette,
} from 'lucide-react'
import {
  BRAND_COLOR_PALETTE,
  createPendingOrganizationRegistration,
} from '../../../services/organizationRegistrationService'

export default function Step2Branding({
  registrationData,
  onNext,
  onBack,
}) {
  const [appName, setAppName] = useState(
    registrationData.appName || registrationData.orgName || ''
  )
  const [selectedColor, setSelectedColor] = useState(
    registrationData.themeColor || '#00A86B'
  )
  const [customColor, setCustomColor] = useState(
    registrationData.themeColor || '#00A86B'
  )
  const [showCustomInput, setShowCustomInput] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const orgName = registrationData.orgName || 'Your Organization'

  function handleSelectPredefinedColor(hex) {
    setSelectedColor(hex)
    setShowCustomInput(false)
  }

  function handleCustomColorChange(e) {
    const val = e.target.value
    setCustomColor(val)
    setSelectedColor(val)
  }

  async function handleSaveAndContinue(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const finalAppName = (appName.trim() || orgName).trim()

    try {
      // Execute Step 2 Multi-Document Batch Persistence
      const { orgId, referralCode } = await createPendingOrganizationRegistration({
        orgName,
        appName: finalAppName,
        themeColor: selectedColor,
        email: registrationData.email,
        phone: registrationData.phone,
        username: registrationData.username,
        password: registrationData.password,
        dateStr: registrationData.dateStr,
        referralCode: registrationData.referralCode,
      })

      // Advance to Step 3: Pricing
      onNext({
        ...registrationData,
        appName: finalAppName,
        themeColor: selectedColor,
        orgId,
        referralCode,
      })
    } catch (err) {
      console.error('Error saving branding:', err)
      setError(err.message || 'Failed to persist branding settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT / TOP: Customization Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-left space-y-1.5 pb-2 border-b border-slate-100">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
              Step 2 of 3 · Branding & Appearance
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Brand Your Workspace
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Personalize your display app name and corporate brand accent color across web and mobile.
            </p>
          </div>

          <form onSubmit={handleSaveAndContinue} className="space-y-6">
            {/* Card 1: App Name Customization */}
            <div className="space-y-2">
              <label htmlFor="appName" className="block text-xs font-semibold text-slate-700">
                Workspace Display Name
              </label>
              <div className="relative">
                <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="appName"
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder={`e.g. ${orgName}`}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:border-[#0B3470] focus:ring-2 focus:ring-[#0B3470]/15 outline-none transition-all shadow-2xs"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Allows white-label tenants to have a tailored internal brand name (e.g. &quot;Apex BuildCon&quot;) while keeping your registered corporate name (<span className="text-slate-600 font-semibold">{orgName}</span>).
              </p>
            </div>

            {/* Card 2: 14 Color Options Palette + Custom Color */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Brand Color Theme
                </label>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase border border-slate-200">
                  {selectedColor}
                </span>
              </div>

              {/* Color Chips Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2.5 pt-1">
                {BRAND_COLOR_PALETTE.map((color) => {
                  const isSelected = selectedColor.toLowerCase() === color.hex.toLowerCase()
                  return (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => handleSelectPredefinedColor(color.hex)}
                      title={color.name}
                      className={`group relative h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                        isSelected
                          ? 'ring-3 ring-offset-2 scale-105 shadow-md'
                          : 'hover:scale-105 hover:shadow-xs'
                      }`}
                      style={{
                        backgroundColor: color.hex,
                        ringColor: color.hex,
                      }}
                    >
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  )
                })}

                {/* Custom Color Wheel Button */}
                <button
                  type="button"
                  onClick={() => setShowCustomInput(!showCustomInput)}
                  title="Choose Custom Color"
                  className={`relative h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-xs border-2 ${
                    showCustomInput
                      ? 'border-slate-900 ring-2 ring-slate-400 scale-105'
                      : 'border-slate-300 hover:scale-105'
                  }`}
                  style={{
                    background:
                      'conic-gradient(from 180deg at 50% 50%, #DC2626, #EA580C, #F59E0B, #84CC16, #00A86B, #017FDF, #4F46E5, #9333EA, #DC2626)',
                  }}
                >
                  <div className="w-6 h-6 rounded-full bg-white/90 text-slate-800 flex items-center justify-center shadow-xs">
                    <Pipette className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>

              {/* Custom Color Input Field if toggled */}
              {showCustomInput && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3 animate-fade-in">
                  <input
                    type="color"
                    value={customColor}
                    onChange={handleCustomColorChange}
                    className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300 bg-white p-0.5"
                  />
                  <div className="space-y-0.5 flex-1">
                    <span className="text-[10px] text-slate-500 font-semibold block uppercase">Custom Hex Code</span>
                    <input
                      type="text"
                      value={selectedColor}
                      onChange={(e) => {
                        const val = e.target.value
                        setSelectedColor(val)
                        if (/^#[0-9A-F]{6}$/i.test(val)) {
                          setCustomColor(val)
                        }
                      }}
                      placeholder="#00A86B"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase focus:border-[#0B3470] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onBack}
                disabled={saving}
                className="py-3.5 px-5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Details</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3.5 px-5 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                style={{ backgroundColor: selectedColor || '#0B3470' }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                    <span>Saving brand settings...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Plan Selection</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT / BOTTOM: Live Interactive Dynamic Theme Preview */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-slate-700" style={{ color: selectedColor }} />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Live Dynamic Preview
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">Real-time Theme Sync</span>
          </div>

          {/* Mock Mobile & Web Application Header Banner */}
          <div
            className="rounded-2xl p-4 text-white transition-all duration-300 shadow-md space-y-3"
            style={{ backgroundColor: selectedColor }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center text-xs font-black">
                  {appName ? appName.charAt(0).toUpperCase() : 'E'}
                </div>
                <strong className="text-sm font-extrabold tracking-wide">{appName || orgName}</strong>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 uppercase tracking-wider">
                Enterprise
              </span>
            </div>

            <p className="text-[11px] text-white/90 leading-tight">
              Welcome back to your unified command center.
            </p>
          </div>

          {/* Mock Module Cards Preview */}
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs"
                  style={{ backgroundColor: selectedColor }}
                >
                  🏗️
                </div>
                <div>
                  <strong className="text-xs text-slate-900 block font-bold">Active Construction Sites</strong>
                  <span className="text-[10px] text-slate-400">Multi-project tracking</span>
                </div>
              </div>
              <span
                className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-md text-white"
                style={{ backgroundColor: selectedColor }}
              >
                5 Live
              </span>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-xs"
                  style={{ backgroundColor: selectedColor }}
                >
                  👷
                </div>
                <div>
                  <strong className="text-xs text-slate-900 block font-bold">Workforce Attendance</strong>
                  <span className="text-[10px] text-slate-400">Daily site logs</span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700">98% Present</span>
            </div>
          </div>

          {/* Mock Button Preview */}
          <div className="pt-2">
            <button
              type="button"
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-xs flex items-center justify-center gap-1.5"
              style={{ backgroundColor: selectedColor }}
            >
              <span>Sample Primary Action</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p>
              🎨 <strong>Theme Synchronization:</strong> This color will be dynamically applied to your organization&apos;s mobile app workspace, web dashboards, navigation headers, and PDF report accents.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

