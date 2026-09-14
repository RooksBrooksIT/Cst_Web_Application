import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import logo from '../../assets/logo/logo.png'
import './Dashboard.css'

export default function Dashboard() {
    const { userData, logout } = useAuth()

    return (
        <div className="manager-shell">
            <header className="manager-topbar"><Link to="/manager/dashboard"><img src={logo} alt="eBricks" /></Link><div className="manager-topbar-actions"><span>{userData?.fullName || 'Project manager'}</span><button type="button" onClick={logout}>Log out</button></div></header>
            <main className="manager-content"><div className="manager-welcome"><div><p>MANAGER WORKSPACE</p><h1>Good morning, {userData?.fullName?.split(' ')[0] || 'there'}.</h1><span>Keep your sites moving and your team aligned.</span></div><button type="button" className="manager-primary-action">＋ New update</button></div><section className="manager-stats"><article><span>Active projects</span><strong>08</strong><small>Across your portfolio</small></article><article><span>Open tasks</span><strong>24</strong><small>6 due this week</small></article><article><span>Team members</span><strong>36</strong><small>Working across sites</small></article><article><span>Schedule health</span><strong>92%</strong><small className="manager-positive">On track this month</small></article></section><section className="manager-grid"><article className="manager-panel"><div className="manager-panel-heading"><div><p>PROJECT PULSE</p><h2>Your active sites</h2></div><span>Updated just now</span></div><div className="manager-project"><div><strong>Riverfront Residences</strong><small>Bengaluru · Superstructure</small></div><b>78%</b><i><em style={{ width: '78%' }} /></i></div><div className="manager-project"><div><strong>North Gate Commercial</strong><small>Hyderabad · Finishing</small></div><b>61%</b><i><em style={{ width: '61%' }} /></i></div><div className="manager-project"><div><strong>Oakview Villas</strong><small>Pune · Foundation</small></div><b>34%</b><i><em style={{ width: '34%' }} /></i></div></article><article className="manager-panel manager-next-panel"><div className="manager-panel-heading"><div><p>NEXT UP</p><h2>Today’s schedule</h2></div><span>14 Sep</span></div><div className="manager-schedule"><span>09:30</span><div><strong>Site safety briefing</strong><small>Riverfront Residences · Main gate</small></div></div><div className="manager-schedule"><span>12:00</span><div><strong>Material delivery review</strong><small>North Gate Commercial · Store room</small></div></div><div className="manager-schedule"><span>16:30</span><div><strong>Client progress call</strong><small>Project office · Video meeting</small></div></div></article></section></main>
        </div>
    )
}