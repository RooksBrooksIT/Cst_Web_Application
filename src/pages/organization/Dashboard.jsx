import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizationDashboard } from '../../hooks/useOrganizationDashboard'
import logo from '../../assets/logo/logo.png'
import './Dashboard.css'

const stages = ['Foundation', 'Plinth', 'Superstructure', 'Finishing', 'Handover']

function value(record, fields, fallback = '') {
  return fields.map((field) => record[field]).find((item) => item !== undefined && item !== null && item !== '') ?? fallback
}

function number(record, fields) {
  const parsed = Number(value(record, fields, 0))
  return Number.isFinite(parsed) ? parsed : 0
}

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function statusOf(site) {
  return String(value(site, ['status', 'projectStatus'], 'Unknown')).replace(/_/g, ' ')
}

function ProgressBar({ percent }) {
  return <div className="organization-progress"><i><em style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></i><b>{percent}%</b></div>
}

function MetricCard({ title, value: metricValue, detail, href, tone = 'blue' }) {
  return <Link to={href} className={`organization-metric ${tone}`}><span className="metric-symbol">{tone === 'orange' ? '₹' : tone === 'green' ? '↗' : tone === 'red' ? '!' : '▦'}</span><div><p>{title}</p><strong>{metricValue}</strong><small>{detail}</small></div><span className="metric-arrow">→</span></Link>
}

function SectionHeading({ eyebrow, title, href, action = 'View all' }) {
  return <div className="organization-section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div>{href && <Link to={href}>{action} →</Link>}</div>
}

function EmptyState({ text }) {
  return <p className="organization-empty">{text}</p>
}

export default function OrganizationDashboard() {
  const { orgId, userData } = useAuth()
  const { sites, managers, approvals, expenses, inventory, equipment, pettyCash, loading, error } = useOrganizationDashboard(orgId)
  const siteProgress = sites.length ? Math.round(sites.reduce((total, site) => total + number(site, ['progress', 'progressPercentage', 'completion']), 0) / sites.length) : 0
  const plannedBudget = sites.reduce((total, site) => total + number(site, ['budget', 'plannedBudget', 'projectBudget']), 0)
  const spentBudget = sites.reduce((total, site) => total + number(site, ['actual', 'actualExpenditure', 'spent', 'expenditure']), 0)
  const activeSites = sites.filter((site) => ['active', 'in progress', 'ongoing', 'live'].includes(statusOf(site).toLowerCase())).length
  const completedSites = sites.filter((site) => statusOf(site).toLowerCase() === 'completed').length
  const planningSites = sites.filter((site) => statusOf(site).toLowerCase() === 'planning').length
  const pendingApprovals = approvals.filter((item) => !['approved', 'rejected', 'completed'].includes(String(value(item, ['status'], '')).toLowerCase())).length
  const activeWorkforce = sites.reduce((total, site) => total + number(site, ['activeWorkforce', 'workersDeployed', 'workforce']), 0)
  const siteExpense = expenses.reduce((total, expense) => total + number(expense, ['amount', 'total', 'value']), 0)
  const allocatedCash = pettyCash.reduce((total, item) => total + number(item, ['allocated', 'allocation', 'amount']), 0)
  const utilizedCash = pettyCash.reduce((total, item) => total + number(item, ['utilized', 'spent', 'used']), 0)
  const pendingCash = pettyCash.filter((item) => String(value(item, ['status'], '')).toLowerCase().includes('pending')).reduce((total, item) => total + number(item, ['amount', 'pending', 'value']), 0)
  const organizationName = value(userData, ['organizationName', 'orgName', 'companyName'], 'Your organization')
  const currentDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date())

  if (loading) return <div className="organization-state">Loading organization dashboard...</div>
  if (error) return <div className="organization-state organization-state-error"><strong>Dashboard unavailable</strong><span>{error}</span></div>

  return <div className="organization-shell min-h-screen">
    <header className="organization-topbar flex-wrap"><Link className="organization-brand" to="/organization/dashboard"><img className="organization-brand-logo" src={logo} alt="eBricks" /></Link><div className="organization-search">⌕ <input placeholder="Search sites, people, requests..." aria-label="Search organization data" /></div><button className="organization-icon-button" type="button" aria-label="Notifications">♢<em>{pendingApprovals}</em></button><div className="organization-user"><span>AR</span><div><strong>{value(userData, ['fullName', 'name'], 'Organization admin')}</strong><small>Organization Admin</small></div></div></header>
    <div className="organization-body flex min-h-[calc(100vh-68px)]"><aside className="organization-sidebar shrink-0"><p className="organization-nav-label">ORGANIZATION</p>{[['Dashboard', '/organization/dashboard', '⌂'], ['Sites', '/organization/sites', '▦'], ['Finance', '/organization/finance', '₹'], ['Approvals', '/organization/approvals', '✓'], ['Petty Cash', '/organization/petty-cash', '◈'], ['Team', '/organization/team', '♙'], ['Reports', '/organization/reports', '▤'], ['Branding', '/organization/branding', '◇'], ['Subscription', '/organization/subscription', '○']].map(([label, href, icon]) => <Link className={label === 'Dashboard' ? 'selected' : ''} key={label} to={href}><i>{icon}</i>{label}{label === 'Approvals' && <b>{pendingApprovals}</b>}</Link>)}<Link className="organization-settings" to="/organization/settings"><i>⚙</i>Settings</Link></aside>
      <main className="organization-main min-w-0 flex-1 overflow-x-hidden"><div className="organization-content w-full"><div className="organization-header gap-4"><div><p className="organization-kicker">{organizationName} <span>·</span> {currentDate}</p><h1>Organization Dashboard</h1><p>Company-wide construction operations at a glance.</p></div><select aria-label="Site filter"><option>All Sites</option>{sites.map((site) => <option key={site.id}>{value(site, ['name', 'siteName', 'projectName'], site.id)}</option>)}</select></div>
        <div className="organization-status flex flex-wrap"><span className="status-live" /> All systems operational <span>·</span> Live data from {sites.length} sites</div>
        <section className="organization-metrics grid min-w-0"><MetricCard title="Total sites" value={sites.length} detail={`${activeSites} active · ${planningSites} planning · ${completedSites} completed`} href="/organization/sites" /><MetricCard title="Overall progress" value={`${siteProgress}%`} detail="Across all construction sites" href="/organization/sites" tone="green" /><MetricCard title="Active workforce" value={activeWorkforce} detail={`${managers.length} managers assigned`} href="/organization/team" tone="orange" /><MetricCard title="Pending approvals" value={pendingApprovals} detail="Needs organization attention" href="/organization/approvals" tone="red" /><MetricCard title="Monthly expenses" value={money(siteExpense)} detail="From recorded expenses" href="/organization/finance" tone="orange" /><MetricCard title="Budget utilization" value={plannedBudget ? `${Math.round((spentBudget / plannedBudget) * 100)}%` : '0%'} detail={`${money(spentBudget)} of ${money(plannedBudget)} spent`} href="/organization/finance" tone="green" /></section>
        <section className="organization-grid grid min-w-0"><article className="organization-panel organization-progress-panel min-w-0"><SectionHeading eyebrow="PROJECT PORTFOLIO" title="Construction project progress" href="/organization/sites" /><div className="organization-table-wrap max-w-full overflow-x-auto"><table><thead><tr><th>Site</th><th>Manager</th><th>Stage</th><th>Progress</th><th>Budget</th><th>Status</th></tr></thead><tbody>{sites.slice(0, 6).map((site) => <tr key={site.id}><td><strong>{value(site, ['name', 'siteName', 'projectName'], site.id)}</strong><small>{value(site, ['location', 'address'], 'Location not set')}</small></td><td>{value(site, ['managerName', 'manager', 'assignedManager'], 'Unassigned')}</td><td>{value(site, ['stage', 'currentStage'], 'Not set')}</td><td><ProgressBar percent={number(site, ['progress', 'progressPercentage', 'completion'])} /></td><td>{money(number(site, ['budget', 'plannedBudget', 'projectBudget']))}</td><td><span className={`organization-status-pill ${statusOf(site).toLowerCase().replace(/ /g, '-')}`}>{statusOf(site)}</span></td></tr>)}</tbody></table>{!sites.length && <EmptyState text="No construction sites have been added yet." />}</div></article>
          <article className="organization-panel organization-stage-panel"><SectionHeading eyebrow="WORKFLOW" title="Construction stages" /><div className="organization-stage-list">{stages.map((stage) => { const stageSites = sites.filter((site) => String(value(site, ['stage', 'currentStage'], '')).toLowerCase() === stage.toLowerCase()); const progress = stageSites.length ? Math.round(stageSites.reduce((total, site) => total + number(site, ['progress', 'progressPercentage', 'completion']), 0) / stageSites.length) : 0; return <div key={stage}><span>{stage}</span><ProgressBar percent={progress} /></div> })}</div></article></section>
        <section className="organization-grid"><article className="organization-panel organization-finance-panel"><SectionHeading eyebrow="FINANCIAL OVERVIEW" title="Budget vs actual" href="/organization/finance" /><div className="finance-total"><div><small>Planned budget</small><strong>{money(plannedBudget)}</strong></div><div><small>Actual expenditure</small><strong>{money(spentBudget)}</strong></div><div><small>Remaining</small><strong>{money(Math.max(0, plannedBudget - spentBudget))}</strong></div></div><div className="budget-bars"><div><span>Planned</span><i><em style={{ width: '100%' }} /></i></div><div><span>Actual</span><i><em style={{ width: `${plannedBudget ? Math.min(100, (spentBudget / plannedBudget) * 100) : 0}%` }} /></i></div></div></article><article className="organization-panel"><SectionHeading eyebrow="ACTION REQUIRED" title="Approval center summary" href="/organization/approvals" /><div className="approval-summary">{['Material', 'Payment', 'Contractor', 'Budget', 'Other'].map((type) => <Link to="/organization/approvals" key={type}><span>{type} requests</span><strong>{approvals.filter((item) => String(value(item, ['category', 'type'], 'Other')).toLowerCase().includes(type.toLowerCase())).length}</strong></Link>)}</div></article></section>
        <section className="organization-grid"><article className="organization-panel"><SectionHeading eyebrow="SITE OPERATIONS" title="Inventory & equipment" /><div className="resource-summary"><div><span>Inventory records</span><strong>{inventory.length}</strong><small>Tracked materials</small></div><div><span>Equipment units</span><strong>{equipment.length}</strong><small>Across all sites</small></div><div><span>Low stock items</span><strong>{inventory.filter((item) => String(value(item, ['status'], '')).toLowerCase().includes('low')).length}</strong><small>Requires review</small></div></div></article><article className="organization-panel"><SectionHeading eyebrow="CASH CONTROL" title="Petty cash overview" href="/organization/petty-cash" /><div className="cash-summary"><div><small>Allocated</small><strong>{money(allocatedCash)}</strong></div><div><small>Utilized</small><strong>{money(utilizedCash)}</strong></div><div><small>Available</small><strong>{money(Math.max(0, allocatedCash - utilizedCash))}</strong></div><div><small>Pending</small><strong>{money(pendingCash)}</strong></div></div>{!pettyCash.length && <EmptyState text="No petty cash records available." />}</article></section>
        <section className="organization-panel activity-panel"><SectionHeading eyebrow="REALTIME FEED" title="Recent construction activity" /><EmptyState text="No recent activity has been recorded." /></section>
        <div className="organization-quick-actions"><strong>Quick actions</strong><Link to="/organization/sites">＋ Create site</Link><Link to="/organization/team">＋ Add manager</Link><Link to="/organization/approvals">✓ View approvals</Link><Link to="/organization/finance">₹ View finance</Link><Link to="/organization/reports">▤ Generate report</Link></div>
      </div></main></div>
  </div>
}
