import { Link, useParams } from 'react-router-dom'
import logo from '../../assets/logo/logo.png'
import './Module.css'

const moduleNames = {
  sites: 'Sites',
  finance: 'Finance',
  approvals: 'Approvals',
  'petty-cash': 'Petty Cash',
  team: 'Team',
  reports: 'Reports',
  branding: 'Branding',
  subscription: 'Subscription',
  settings: 'Settings',
}

export default function OrganizationModule() {
  const { module } = useParams()
  const name = moduleNames[module] || 'Organization module'

  return <main className="organization-module-page"><header className="module-topbar"><Link to="/organization/dashboard"><img src={logo} alt="eBricks" /></Link><span>Organization workspace</span></header><section className="organization-module-placeholder"><p>ORGANIZATION / WORKSPACE</p><h1>{name}</h1><span>This module is ready for its organization workflow.</span><Link to="/organization/dashboard">← Back to dashboard</Link></section></main>
}
