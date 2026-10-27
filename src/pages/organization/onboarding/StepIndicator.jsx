import React from 'react'
import { Check } from 'lucide-react'

export default function StepIndicator({ currentStep = 1, brandColor = '#0B3470' }) {
  const steps = [
    { number: 1, title: 'Details', subtitle: 'Account Info' },
    { number: 2, title: 'Branding', subtitle: 'Workspace & Color' },
    { number: 3, title: 'Pricing', subtitle: 'Choose Plan' },
  ]

  return (
    <div className="w-full max-w-2xl mx-auto mb-8 px-4">
      <div className="relative flex items-center justify-between">
        {/* Background Connector Line */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 z-0 rounded-full" />

        {/* Dynamic Progress Fill */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 transition-all duration-500 rounded-full z-0"
          style={{
            backgroundColor: brandColor || '#0B3470',
            width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%',
          }}
        />

        {/* Steps */}
        {steps.map((step) => {
          const isCompleted = currentStep > step.number
          const isActive = currentStep === step.number

          return (
            <div key={step.number} className="relative z-10 flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-md ${
                  isCompleted
                    ? 'text-white'
                    : isActive
                    ? 'text-white ring-4 ring-offset-2'
                    : 'bg-white text-slate-400 border-2 border-slate-300'
                }`}
                style={{
                  backgroundColor: isCompleted || isActive ? brandColor || '#0B3470' : '#ffffff',
                  borderColor: isCompleted || isActive ? brandColor || '#0B3470' : '#cbd5e1',
                  ringColor: isActive ? `${brandColor}40` : 'transparent',
                }}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 text-white stroke-[2.5]" />
                ) : (
                  <span>{step.number}</span>
                )}
              </div>

              <div className="text-center mt-2">
                <span
                  className={`text-xs font-bold block transition-colors ${
                    isActive ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:block">
                  {step.subtitle}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

