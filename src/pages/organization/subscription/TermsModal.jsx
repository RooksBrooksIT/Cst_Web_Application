import Modal from '../../../components/common/Modal'

export function TermsModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Terms of Service & Subscription Policy">
      <div className="space-y-4 text-xs text-slate-600 max-h-[60vh] overflow-y-auto pr-2 leading-relaxed">
        <section className="space-y-1.5">
          <h4 className="font-bold text-slate-900 text-sm">1. Subscription Billing & Renewals</h4>
          <p>
            eBricks subscriptions are billed in advance on a recurring cycle (Monthly, 6 Months, or Yearly). Subscriptions remain active until the designated expiry timestamp stored under your tenant configuration.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-bold text-slate-900 text-sm">2. Plan Quotas & Scale</h4>
          <p>
            Each subscription plan unlocks a specific quota of active construction projects, manager seats, supervisor accounts, and layout drawing uploads. Creating resources beyond your active quota requires upgrading to a higher plan.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-bold text-slate-900 text-sm">3. Upgrade Timing & Queuing</h4>
          <p>
            When upgrading while your current plan is active, you may select <strong>Immediate Upgrade</strong> (activating higher limits today with fresh validity) or <strong>Queued Upgrade</strong> (activating automatically upon your current plan expiry).
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-bold text-slate-900 text-sm">4. Refund & Cancellation Policy</h4>
          <p>
            Subscription fees are generally non-refundable once activated. In the event of duplicate billing or gateway errors, please contact enterprise support within 48 hours for immediate resolution.
          </p>
        </section>

        <section className="space-y-1.5">
          <h4 className="font-bold text-slate-900 text-sm">5. Data Privacy & Security</h4>
          <p>
            Your organization site data, muster roll logs, financial entries, and architectural drawings are stored within isolated multi-tenant Firestore security rules.
          </p>
        </section>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-white font-bold bg-[#0B3470] hover:bg-blue-900"
          >
            Understood & Agree
          </button>
        </div>
      </div>
    </Modal>
  )
}
