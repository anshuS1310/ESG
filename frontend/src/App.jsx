import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Database, 
  Layers, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Upload, 
  X, 
  Check, 
  Edit3, 
  Sparkles, 
  Terminal
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function App() {
  // Navigation states (conditional tab rendering)
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, ingestion, review, benefits

  // Ledger & stats states
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({
    total_emissions_kg: 0,
    scope_distribution: { SCOPE_1: 0, SCOPE_2: 0, SCOPE_3: 0 },
    status_distribution: { PENDING: 0, FLAGGED: 0, APPROVED: 0 },
    timeline: [],
    flagged_feed: []
  });
  
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [ingesting, setIngesting] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Search & Filter States
  const [scopeFilter, setScopeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection & Review States
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    raw_quantity: '',
    raw_unit: '',
    cost_in_inr: '',
    start_date: '',
    end_date: '',
    activity_type: '',
    anomaly_reason: ''
  });

  // Fetch records and dashboard aggregates
  const fetchData = async () => {
    setLoading(true);
    try {
      const statsRes = await fetch(`${API_BASE}/api/emissions/stats/`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      } else {
        console.error('Stats API returned non-OK status:', statsRes.status);
      }
      
      const recordsRes = await fetch(`${API_BASE}/api/emissions/`);
      if (recordsRes.ok) {
        const recordsData = await recordsRes.json();
        setRecords(recordsData.records);
      } else {
        console.error('Records API returned non-OK status:', recordsRes.status);
      }
    } catch (err) {
      console.error('Failed to sync data pipelines from backend:', err);
      showToast('Error syncing data pipelines from backend.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Run bulk approval
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      const response = await fetch(`${API_BASE}/api/emissions/bulk-approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_ids: selectedIds })
      });
      if (response.ok) {
        const data = await response.json();
        showToast(data.message);
        setSelectedIds([]);
        fetchData();
        if (selectedRecord && selectedIds.includes(selectedRecord.id)) {
          setSelectedRecord(prev => ({ ...prev, status: 'APPROVED', anomaly_reason: null }));
        }
      } else {
        const err = await response.json();
        showToast(err.error || 'Bulk approval failed.', 'error');
      }
    } catch (err) {
      console.error('Bulk approval failed:', err);
      showToast('API communication error during approval.', 'error');
    }
  };

  // Ingest data sheets
  const triggerIngestion = async () => {
    setIngesting(true);
    setLogs(prev => [
      ...prev, 
      `Connecting to database and validating file streams...`
    ]);
    try {
      const response = await fetch(`${API_BASE}/api/emissions/ingest/`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setLogs(prev => [
          ...prev,
          `Data synchronization complete.`,
          `SAP Fuel Procurement: Ingested ${data.summary.sap.records} billing records (${data.summary.sap.anomalies} anomalies flagged for review).`,
          `Facility Utility Bills: Ingested ${data.summary.utility.records} consumption entries (${data.summary.utility.anomalies} data gaps estimated).`,
          `Corporate Travel logs: Ingested ${data.summary.travel.records} travel segments (${data.summary.travel.anomalies} distance coordinates resolved).`,
          `Compliance audit trail successfully sealed.`
        ]);
        showToast('All data sources successfully ingested.');
        fetchData();
      } else {
        const err = await response.json();
        setLogs(prev => [...prev, `Ingestion failed: ${err.error}`]);
        showToast(err.error, 'error');
      }
    } catch (err) {
      console.error('Ingestion failed:', err);
      setLogs(prev => [...prev, `Could not connect to the backend database service.`]);
      showToast('API communication error during ingestion.', 'error');
    } finally {
      setIngesting(false);
    }
  };

  // Auto-Fix a single record
  const handleAutoResolve = async (recordId) => {
    try {
      const response = await fetch(`${API_BASE}/api/emissions/${recordId}/auto-resolve/`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        showToast('Data gap estimated and resolved.');
        setSelectedRecord(data.record);
        fetchData();
      } else {
        const err = await response.json();
        showToast(err.error || 'Resolution engine error.', 'error');
      }
    } catch (err) {
      console.error('Auto-resolve failed:', err);
      showToast('Auto-resolve endpoint call failed.', 'error');
    }
  };

  // Update record manual override edits
  const handleManualEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;
    try {
      const response = await fetch(`${API_BASE}/api/emissions/${selectedRecord.id}/edit/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (response.ok) {
        const data = await response.json();
        showToast('Manual override registered and footprint recalculated.');
        setSelectedRecord(data.record);
        setIsEditing(false);
        fetchData();
      } else {
        const err = await response.json();
        showToast(err.error || 'Update failed.', 'error');
      }
    } catch (err) {
      console.error('Manual edit failed:', err);
      showToast('API communication error during edit.', 'error');
    }
  };

  // Update status (Approve or Flag)
  const handleStatusChange = async (recordId, status) => {
    try {
      const response = await fetch(`${API_BASE}/api/emissions/${recordId}/review/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: 'Reviewed by auditor.' })
      });
      if (response.ok) {
        const data = await response.json();
        showToast(`Record status updated to ${status}.`);
        setSelectedRecord(data.record);
        fetchData();
      } else {
        const err = await response.json();
        showToast(err.error || 'Review update failed.', 'error');
      }
    } catch (err) {
      console.error('Status change failed:', err);
      showToast('API communication error during review.', 'error');
    }
  };

  // Populate edit form values
  const startEditing = () => {
    if (!selectedRecord) return;
    setEditForm({
      raw_quantity: selectedRecord.raw_quantity,
      raw_unit: selectedRecord.raw_unit,
      cost_in_inr: selectedRecord.cost_in_inr,
      start_date: selectedRecord.start_date,
      end_date: selectedRecord.end_date,
      activity_type: selectedRecord.activity_type,
      anomaly_reason: selectedRecord.anomaly_reason || ''
    });
    setIsEditing(true);
  };

  // Toggle selection checkmarks
  const toggleSelectRecord = (id, e) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      const pendingAndFlagged = filteredRecords
        .filter(r => r.status !== 'APPROVED')
        .map(r => r.id);
      setSelectedIds(pendingAndFlagged);
    }
  };

  // Filtering records
  const filteredRecords = records.filter(r => {
    const matchScope = scopeFilter === 'ALL' || r.scope_category === scopeFilter;
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchSource = sourceFilter === 'ALL' || r.source_type === sourceFilter;
    
    const term = searchQuery.toLowerCase().trim();
    const matchSearch = !term || 
      r.activity_type.toLowerCase().includes(term) ||
      r.raw_record_id.toLowerCase().includes(term) ||
      (r.anomaly_reason && r.anomaly_reason.toLowerCase().includes(term)) ||
      r.source_type.toLowerCase().includes(term);

    return matchScope && matchStatus && matchSource && matchSearch;
  });

  const totalMT = (stats.total_emissions_kg / 1000).toFixed(2);
  const scope1MT = (stats.scope_distribution.SCOPE_1 / 1000).toFixed(2);
  const scope2MT = (stats.scope_distribution.SCOPE_2 / 1000).toFixed(2);
  const scope3MT = (stats.scope_distribution.SCOPE_3 / 1000).toFixed(2);
  
  const scope1Percent = stats.total_emissions_kg ? ((stats.scope_distribution.SCOPE_1 / stats.total_emissions_kg) * 100).toFixed(1) : 0;
  const scope2Percent = stats.total_emissions_kg ? ((stats.scope_distribution.SCOPE_2 / stats.total_emissions_kg) * 100).toFixed(1) : 0;
  const scope3Percent = stats.total_emissions_kg ? ((stats.scope_distribution.SCOPE_3 / stats.total_emissions_kg) * 100).toFixed(1) : 0;

  const maxMonthlyEmissions = stats.timeline.length ? Math.max(...stats.timeline.map(t => t.emissions_kg)) : 1000;

  return (
    <div className="app-container">
      
      {/* Top Navigation Bar: matches breatheesg.com structure */}
      <header className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
          <img src="/logo.png" alt="Breathe ESG Logo" style={{ width: '34px', height: '34px', objectFit: 'contain' }} />
          <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '1px', fontFamily: "'Montserrat', 'Inter', sans-serif" }}>BREATHE ESG</span>
        </div>

        {/* Navigation Tabs (updates activeTab state for clean single-view tab changes) */}
        <div className="nav-menu-links">
          <span onClick={() => setActiveTab('dashboard')} className={`nav-link-item ${activeTab === 'dashboard' ? 'active' : ''}`}>Dashboard</span>
          <span onClick={() => setActiveTab('ingestion')} className={`nav-link-item ${activeTab === 'ingestion' ? 'active' : ''}`}>Ingestion Port</span>
          <span onClick={() => setActiveTab('review')} className={`nav-link-item ${activeTab === 'review' ? 'active' : ''}`}>Review Centre</span>
          <span onClick={() => setActiveTab('benefits')} className={`nav-link-item ${activeTab === 'benefits' ? 'active' : ''}`}>Benefits</span>
        </div>

        <button 
          className="btn" 
          style={{ backgroundColor: 'black', color: 'white', padding: '14px 28px', borderRadius: '12px', fontSize: '15.5px', fontWeight: 800 }}
          onClick={() => setActiveTab('ingestion')}
        >
          Book a demo ➔
        </button>
      </header>

      {/* Main Content Area */}
      <main className="page-container">
        
        {/* ==================== 1. DASHBOARD / HOME LANDING VIEW ==================== */}
        {activeTab === 'dashboard' && (
          <div className="tab-content-wrapper">
            
            {/* Landing Hero Section */}
            <div style={{ display: 'flex', gap: '80px', alignItems: 'center', padding: '40px 0', minHeight: '600px' }}>
              <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '28px', textAlign: 'left' }}>
                <span className="section-tag" style={{ alignSelf: 'flex-start' }}>ESG Data Streamline</span>
                <h1 style={{ fontSize: '64px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-2px' }}>
                  ESG Reporting and Scope 3 Solutions
                </h1>
                <p style={{ fontSize: '19px', color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                  Simplify compliance, track emissions, and drive sustainability with ESG reporting services built for transparency, performance, and scale. Ingest transaction datasets and automatically evaluate carbon conversion trails.
                </p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                  <button 
                    onClick={() => setActiveTab('ingestion')}
                    className="btn btn-primary"
                    style={{ padding: '16px 36px', fontSize: '16px' }}
                  >
                    Book a demo ➔
                  </button>
                  <button 
                    onClick={() => setActiveTab('review')}
                    className="btn btn-secondary"
                    style={{ padding: '16px 36px', fontSize: '16px' }}
                  >
                    Open Review Centre
                  </button>
                </div>
              </div>
              
              {/* Right Side: Mockup showcasing live monthly Trend Bar Chart */}
              <div style={{ flex: '1' }}>
                <div className="browser-mockup">
                  <div className="browser-header-bar">
                    <div className="browser-dot red"></div>
                    <div className="browser-dot yellow"></div>
                    <div className="browser-dot green"></div>
                    <div style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, fontFamily: 'var(--mono)' }}>breatheesg.com/analytics-timeline</div>
                  </div>
                  <div className="browser-mockup-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                      <span style={{ fontWeight: 800, fontSize: '14.5px', color: 'var(--text-primary)' }}>Live Monthly Ingestion (kg CO₂e)</span>
                      <span className="status-badge status-approved" style={{ fontSize: '10.5px', padding: '4px 10px' }}>Active Stream</span>
                    </div>

                    {stats.timeline.length === 0 ? (
                      <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>No historical data ingested yet.</p>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '18px', height: '180px', width: '100%', padding: '10px 10px 0 10px', overflow: 'hidden' }}>
                        {stats.timeline.map((t, idx) => {
                          const percentHeight = maxMonthlyEmissions ? (t.emissions_kg / maxMonthlyEmissions) * 110 : 0;
                          const total = t.emissions_kg || 1;
                          const s1P = ((t.scope_1_kg || 0) / total) * 100;
                          const s2P = ((t.scope_2_kg || 0) / total) * 100;
                          const s3P = ((t.scope_3_kg || 0) / total) * 100;
                          
                          return (
                            <div key={idx} style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {Math.round(t.emissions_kg)}
                              </span>
                              
                              <div 
                                style={{ 
                                  width: '26px', 
                                  height: `${percentHeight}px`, 
                                  borderRadius: '6px 6px 0 0',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  flexDirection: 'column-reverse',
                                  transition: 'height 0.3s ease'
                                }}
                              >
                                <div style={{ height: `${s1P}%`, backgroundColor: '#3b82f6', width: '100%' }}></div>
                                <div style={{ height: `${s2P}%`, backgroundColor: '#4b5563', width: '100%' }}></div>
                                <div style={{ height: `${s3P}%`, backgroundColor: '#f97316', width: '100%' }}></div>
                              </div>
                              
                              <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                                {t.period.split('-')[1]}/{t.period.split('-')[0].slice(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Environmental Footprint registry Index */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
              <div className="section-header">
                <span className="section-tag">Carbon Indices</span>
                <h2 className="section-title">Environmental Footprint Dashboard</h2>
                <p className="section-desc">Real-time indicators aggregating overall scopes and status across parsed activity journals.</p>
              </div>

              <div className="metrics-row">
                <div className="kpi-card kpi-total">
                  <div className="kpi-title" style={{ color: 'var(--brand-green)' }}>Total Footprint</div>
                  <div className="kpi-value">{totalMT} <span className="kpi-unit">MT CO₂e</span></div>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>Aggregated across all compliance tiers</p>
                  <div className="kpi-progress-bar" style={{ backgroundColor: 'rgba(37, 167, 91, 0.1)' }}>
                    <div className="kpi-progress" style={{ width: '100%', background: 'var(--brand-green)' }}></div>
                  </div>
                </div>
                
                <div className="kpi-card kpi-scope1">
                  <div className="kpi-title">Scope 1 (Direct)</div>
                  <div className="kpi-value">{scope1MT} <span className="kpi-unit">MT</span></div>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>{scope1Percent}% of total carbon emissions</p>
                  <div className="kpi-progress-bar">
                    <div className="kpi-progress" style={{ width: `${scope1Percent}%`, backgroundColor: '#3b82f6' }}></div>
                  </div>
                </div>

                <div className="kpi-card kpi-scope2">
                  <div className="kpi-title">Scope 2 (Electricity)</div>
                  <div className="kpi-value">{scope2MT} <span className="kpi-unit">MT</span></div>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>{scope2Percent}% of total carbon emissions</p>
                  <div className="kpi-progress-bar">
                    <div className="kpi-progress" style={{ width: `${scope2Percent}%`, backgroundColor: '#4b5563' }}></div>
                  </div>
                </div>

                <div className="kpi-card kpi-scope3">
                  <div className="kpi-title">Scope 3 (Value Chain)</div>
                  <div className="kpi-value">{scope3MT} <span className="kpi-unit">MT</span></div>
                  <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>{scope3Percent}% of total carbon emissions</p>
                  <div className="kpi-progress-bar">
                    <div className="kpi-progress" style={{ width: `${scope3Percent}%`, backgroundColor: '#f97316' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Alert Feed Banner */}
            {stats.status_distribution.FLAGGED > 0 && (
              <div className="alerts-banner" style={{ margin: '12px 0' }}>
                <div className="alerts-info">
                  <AlertTriangle className="nav-icon" style={{ color: 'var(--color-flagged)', width: '24px', height: '24px' }} />
                  <div>
                    <span style={{ fontSize: '17px', fontWeight: 800 }}>Audit Ledger Warning:</span>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      There are {stats.status_distribution.FLAGGED} active data quality anomalies that must be resolved in the Review Centre to ensure audit sealing.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('review')}
                  className="btn btn-primary"
                  style={{ backgroundColor: 'var(--color-flagged)', padding: '10px 20px', fontSize: '14px' }}
                >
                  Go Resolve
                </button>
              </div>
            )}

            {/* Interactive Capabilities Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', marginTop: '24px' }}>
              <div className="section-header">
                <span className="section-tag">BENEFITS</span>
                <h2 className="section-title">Robust ESG Reporting Solutions</h2>
                <p className="section-desc">Explore the automated features designed to centralize and validate carbon metrics.</p>
              </div>

              <div className="capability-grid">
                
                {/* Capability 1: Data Ingestion Channels */}
                <div className="capability-card bg-mint">
                  <div className="capability-card-text">
                    <h3 className="capability-title">Data Ingestion Channels</h3>
                    <p className="capability-desc">
                      Import and parse raw transaction spreadsheets from SAP procurement logs, facility utility invoices, and travel files into our centralized pipeline.
                    </p>
                  </div>
                  <div className="browser-mockup">
                    <div className="browser-header-bar">
                      <div className="browser-dot red"></div>
                      <div className="browser-dot yellow"></div>
                      <div className="browser-dot green"></div>
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-tertiary)' }}>ingest-channels-preview</span>
                    </div>
                    <div className="browser-mockup-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '24px', backgroundColor: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px' }}>SAP Fuel Procurement (Scope 1)</span>
                        <span style={{ color: 'var(--brand-green)', fontWeight: 800, fontSize: '11px' }}>50 RECORDS INGESTED</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px' }}>Facility Utility Bills (Scope 2)</span>
                        <span style={{ color: 'var(--brand-green)', fontWeight: 800, fontSize: '11px' }}>56 RECORDS INGESTED</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px' }}>Concur Travel logs (Scope 3)</span>
                        <span style={{ color: 'var(--brand-green)', fontWeight: 800, fontSize: '11px' }}>20 RECORDS INGESTED</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capability 2: Scope Carbon Analytics */}
                <div className="capability-card bg-lilac">
                  <div className="capability-card-text">
                    <h3 className="capability-title">Scope Carbon Analytics</h3>
                    <p className="capability-desc">
                      Leverage standardized emission coefficients to calculate direct, indirect, and value chain outputs instantly, categorized for clear audit reporting.
                    </p>
                  </div>
                  <div className="browser-mockup">
                    <div className="browser-header-bar">
                      <div className="browser-dot red"></div>
                      <div className="browser-dot yellow"></div>
                      <div className="browser-dot green"></div>
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-tertiary)' }}>scope-distribution-donut</span>
                    </div>
                    <div className="browser-mockup-content" style={{ display: 'flex', gap: '28px', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: 'white' }}>
                      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                        <svg width="120" height="120" viewBox="0 0 160 160">
                          <circle cx="80" cy="80" r="65" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                          <circle cx="80" cy="80" r="48" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                          <circle cx="80" cy="80" r="31" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                          
                          <circle 
                            cx="80" cy="80" r="65" fill="none" stroke="#3b82f6" strokeWidth="12" 
                            strokeDasharray={2 * Math.PI * 65} strokeDashoffset={2 * Math.PI * 65 * (1 - (scope1Percent / 100))}
                            strokeLinecap="round" transform="rotate(-90 80 80)"
                          />
                          <circle 
                            cx="80" cy="80" r="48" fill="none" stroke="#4b5563" strokeWidth="12" 
                            strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48 * (1 - (scope2Percent / 100))}
                            strokeLinecap="round" transform="rotate(-90 80 80)"
                          />
                          <circle 
                            cx="80" cy="80" r="31" fill="none" stroke="#f97316" strokeWidth="12" 
                            strokeDasharray={2 * Math.PI * 31} strokeDashoffset={2 * Math.PI * 31 * (1 - (scope3Percent / 100))}
                            strokeLinecap="round" transform="rotate(-90 80 80)"
                          />
                        </svg>
                      </div>
                      <div className="chart-legend" style={{ gap: '8px' }}>
                        <div className="legend-item" style={{ fontSize: '13px' }}>
                          <div className="legend-color" style={{ backgroundColor: '#3b82f6', width: '10px', height: '10px' }}></div>
                          <span>Scope 1: {scope1Percent}%</span>
                        </div>
                        <div className="legend-item" style={{ fontSize: '13px' }}>
                          <div className="legend-color" style={{ backgroundColor: '#4b5563', width: '10px', height: '10px' }}></div>
                          <span>Scope 2: {scope2Percent}%</span>
                        </div>
                        <div className="legend-item" style={{ fontSize: '13px' }}>
                          <div className="legend-color" style={{ backgroundColor: '#f97316', width: '10px', height: '10px' }}></div>
                          <span>Scope 3: {scope3Percent}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capability 3: Data Quality Validation */}
                <div className="capability-card bg-warm">
                  <div className="capability-card-text">
                    <h3 className="capability-title">Auto-Healing & Validation</h3>
                    <p className="capability-desc">
                      Spot empty distances or missing utility kWh instantly. Auto-resolve travel miles using airport codes, and calculate utility bills via commercial tariffs.
                    </p>
                  </div>
                  <div className="browser-mockup">
                    <div className="browser-header-bar">
                      <div className="browser-dot red"></div>
                      <div className="browser-dot yellow"></div>
                      <div className="browser-dot green"></div>
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-tertiary)' }}>anomaly-healing-engine</span>
                    </div>
                    <div className="browser-mockup-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '24px', backgroundColor: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'rgba(225, 29, 72, 0.05)', border: '1px solid rgba(225, 29, 72, 0.1)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-flagged)' }}>⚠️ FLAGGED ANOMALY</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Flight DEL-LHR: Missing Distance</span>
                      </div>
                      <button 
                        onClick={() => setActiveTab('review')}
                        className="btn btn-primary"
                        style={{ padding: '10px 16px', fontSize: '13px', borderRadius: '8px', width: '100%' }}
                      >
                        ⚡ Run Validation Healers ({stats.status_distribution.FLAGGED} unresolved)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Capability 4: Audited Compliance Ledger */}
                <div className="capability-card bg-slate">
                  <div className="capability-card-text">
                    <h3 className="capability-title">Audited Compliance Ledger</h3>
                    <p className="capability-desc">
                      Track ledger changes, inspect raw JSON lineages, and log all audit steps to create a tamper-proof carbon accounting path.
                    </p>
                  </div>
                  <div className="browser-mockup">
                    <div className="browser-header-bar">
                      <div className="browser-dot red"></div>
                      <div className="browser-dot yellow"></div>
                      <div className="browser-dot green"></div>
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-tertiary)' }}>audit-ledger-trail</span>
                    </div>
                    <div className="browser-mockup-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '24px', backgroundColor: 'white', textAlign: 'left' }}>
                      <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: 800 }}>RECENT AUDIT ACTIVITIES</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ fontWeight: 800 }}>IMPORT</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>Ingested SAP & Utility logs</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ fontWeight: 800 }}>AUTO_HEAL</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>Resolved utility kwh metrics</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ fontWeight: 800 }}>APPROVE</span>
                          <span style={{ color: 'var(--brand-green)' }}>Audited & signed compliance</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ==================== 2. INGESTION PORT ==================== */}
        {activeTab === 'ingestion' && (
          <div className="tab-content-wrapper">
            
            <div className="section-header">
              <span className="section-tag">Ingest Pipeline</span>
              <h2 className="section-title">Data Ingestion Channels</h2>
              <p className="section-desc">Trigger standard imports for corporate carbon records or stream files directly.</p>
            </div>

            {/* Ingestion cards */}
            <div className="ingestion-grid">
              <div className="ingest-card ingest-sap">
                <div className="ingest-card-header">
                  <div className="ingest-icon-box">
                    <Database className="nav-icon" />
                  </div>
                  <h4>SAP Fuel & Procurement</h4>
                </div>
                <p>Parses purchasing journals (`SAP.csv`) extracting BUDAT, quantities, and matching KOSTL cost centers.</p>
                <span className="badge badge-scope-1" style={{ alignSelf: 'flex-start' }}>Scope 1 Focus</span>
              </div>

              <div className="ingest-card ingest-utility">
                <div className="ingest-card-header">
                  <div className="ingest-icon-box">
                    <Layers className="nav-icon" />
                  </div>
                  <h4>Facility Utility Bills</h4>
                </div>
                <p>Standardizes billing files (`Utility.csv`) tracking provider meters and aligning mismatched calendar periods.</p>
                <span className="badge badge-scope-2" style={{ alignSelf: 'flex-start' }}>Scope 2 Focus</span>
              </div>

              <div className="ingest-card ingest-travel">
                <div className="ingest-card-header">
                  <div className="ingest-icon-box">
                    <Upload className="nav-icon" />
                  </div>
                  <h4>Corporate Travel logs</h4>
                </div>
                <p>Ingests Concur segment files (`travel.csv`) tracking traveler miles, hotel nights, and route codes.</p>
                <span className="badge badge-scope-3" style={{ alignSelf: 'flex-start' }}>Scope 3 Focus</span>
              </div>
            </div>

            {/* Trigger panel */}
            <div className="central-card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <Sparkles className="nav-icon" style={{ width: '40px', height: '40px', color: 'var(--brand-green)' }} />
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Execute pipeline parsing logs</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>Updates database tables, flags structural anomalies, and computes carbon values.</p>
                </div>
                <button 
                  onClick={triggerIngestion}
                  className="btn btn-primary"
                  disabled={ingesting}
                  style={{ padding: '12px 32px', backgroundColor: 'var(--brand-green)', fontSize: '14px' }}
                >
                  <RefreshCw className={`nav-icon ${ingesting ? 'animate-spin' : ''}`} />
                  {ingesting ? 'Running Parsers...' : 'Trigger Pipeline Ingestion'}
                </button>
              </div>
            </div>

            {/* Console logging */}
            {logs.length > 0 && (
              <div className="panel-section" style={{ marginTop: '24px' }}>
                <div className="panel-section-title" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Pipeline Activity Ingestion Log
                </div>
                <div className="terminal-box">
                  {logs.map((log, index) => (
                    <div key={index} className="terminal-line">{log}</div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==================== 3. REVIEW CENTRE ==================== */}
        {activeTab === 'review' && (
          <div className="tab-content-wrapper">
            
            <div className="section-header">
              <span className="section-tag">Audit Control</span>
              <h2 className="section-title">Centralized Emissions Compliance Matrix</h2>
              <p className="section-desc">Validate activity quantities, correct missing fields, and approve records.</p>
            </div>

            {/* Bulk actions banner */}
            {selectedIds.length > 0 && (
              <div className="bulk-actions-wrapper">
                <div className="bulk-actions-text">
                  Selected {selectedIds.length} records for bulk audits sign-off.
                </div>
                <button 
                  onClick={handleBulkApprove}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', background: 'var(--color-approved)' }}
                >
                  <Check className="nav-icon" /> Bulk Approve
                </button>
                <button 
                  onClick={() => setSelectedIds([])}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Clear Selection
                </button>
              </div>
            )}

            <div className="central-card">
              {/* Filters */}
              <div className="card-header">
                <div className="card-title-group">
                  <Layers className="nav-icon" style={{ color: 'var(--brand-green)' }} />
                  <h3>Normalized Emissions Data Ledger</h3>
                </div>

                <div className="filter-controls">
                  <div className="search-input-wrapper">
                    <input 
                      type="text"
                      placeholder="Search records..."
                      className="search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <select 
                    className="dropdown-select"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                  >
                    <option value="ALL">All Sources</option>
                    <option value="SAP">SAP ERP</option>
                    <option value="UTILITY">Utility Bills</option>
                    <option value="TRAVEL">Corporate Travel</option>
                  </select>

                  <div className="chip-group">
                    {['ALL', 'SCOPE_1', 'SCOPE_2', 'SCOPE_3'].map(sc => (
                      <button
                        key={sc}
                        onClick={() => setScopeFilter(sc)}
                        className={`chip ${scopeFilter === sc ? 'active' : ''}`}
                      >
                        {sc === 'ALL' ? 'All Scopes' : sc.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <div className="chip-group">
                    {['ALL', 'PENDING', 'FLAGGED', 'APPROVED'].map(st => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`chip ${statusFilter === st ? 'active' : ''}`}
                      >
                        {st === 'ALL' ? 'All Status' : st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table layout */}
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.filter(r => r.status !== 'APPROVED').length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Activity Record</th>
                      <th>Scope Category</th>
                      <th>Source lineage</th>
                      <th>Loaded quantity</th>
                      <th>Cost (INR)</th>
                      <th>Emissions (kg CO₂e)</th>
                      <th>Compliance State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                          <RefreshCw className="nav-icon animate-spin" style={{ margin: '0 auto 8px', display: 'block', width: '28px', height: '28px', color: 'var(--brand-green)' }} />
                          Retrieving ledger database files...
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                          No carbon records match the filtered parameters.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map(r => (
                        <tr 
                          key={r.id} 
                          onClick={() => { setSelectedRecord(r); setIsEditing(false); }}
                          className={`${selectedRecord && selectedRecord.id === r.id ? 'selected' : ''}`}
                        >
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={selectedIds.includes(r.id)}
                              disabled={r.status === 'APPROVED'}
                              onChange={(e) => toggleSelectRecord(r.id, e)}
                            />
                          </td>
                          <td>
                            <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '16px' }}>{r.activity_type}</p>
                            <p style={{ fontSize: '13.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{r.start_date} to {r.end_date}</p>
                          </td>
                          <td>
                            <span className={`badge ${
                              r.scope_category === 'SCOPE_1' ? 'badge-scope-1' :
                              r.scope_category === 'SCOPE_2' ? 'badge-scope-2' : 'badge-scope-3'
                            }`}>
                              {r.scope_category.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <p style={{ fontWeight: 700, fontSize: '15.5px' }}>{r.source_type}</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>ID: {r.raw_record_id}</p>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '15px' }}>
                            {r.raw_quantity.toLocaleString()} <span style={{ fontSize: '13.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--sans)', fontWeight: 500 }}>{r.raw_unit}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '15px' }}>
                            ₹{r.cost_in_inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '15.5px' }}>
                            {r.co2_emissions_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td>
                            <span className={`status-badge ${
                              r.status === 'APPROVED' ? 'status-approved' :
                              r.status === 'FLAGGED' ? 'status-flagged' : 'status-pending'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ==================== 4. BENEFITS SECTION ==================== */}
        {activeTab === 'benefits' && (
          <div className="tab-content-wrapper">
            
            <div className="section-header">
              <span className="section-tag">Benefits</span>
              <h2 className="section-title">Robust ESG Reporting Solutions</h2>
              <p className="section-desc">Designed to automate calculations, streamline compliance, and simplify auditing reporting.</p>
            </div>

            <div className="benefits-grid">
              <div className="benefit-card">
                <h4>Measure</h4>
                <p>Track Scope 1, 2, and 3 GHG emissions with our sustainability management platform, designed to centralize ESG metrics and automate carbon calculations.</p>
              </div>
              
              <div className="benefit-card">
                <h4>Report</h4>
                <p>Create custom ESG reports and exportable audit logs supporting full compliance with global standards and accounting frameworks like GRI, CSRD, and BRSR.</p>
              </div>

              <div className="benefit-card">
                <h4>Secure</h4>
                <p>Enterprise-grade ESG data management platform with SOC 2, ISO27001, and GDPR compliance parameters for secure, scalable sustainability data handling.</p>
              </div>

              <div className="benefit-card">
                <h4>Flexible</h4>
                <p>Adaptable ESG reporting services help you customize metrics, frameworks, and outputs to meet evolving global sustainability and footprint disclosure requirements.</p>
              </div>

              <div className="benefit-card">
                <h4>Easy to use</h4>
                <p>Our intuitive ESG SaaS platform ensures effortless navigation, enabling sustainability leads and auditors to access insights without technical training.</p>
              </div>

              <div className="benefit-card">
                <h4>Customer first</h4>
                <p>Receive prompt, expert support backed by our advanced ESG business intelligence and carbon accounting validation tools for data-driven decision making.</p>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ==================== EXPANDABLE REVIEW SIDEBAR ==================== */}
      {selectedRecord && activeTab === 'review' && (
        <div className="detail-panel-overlay">
          <div className="panel-header">
            <div>
              <h3 style={{ fontSize: '19px', fontWeight: 800 }}>Record Detail Tracker</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>ID: {selectedRecord.raw_record_id}</p>
            </div>
            <button 
              onClick={() => setSelectedRecord(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X className="nav-icon" style={{ width: '24px', height: '24px' }} />
            </button>
          </div>

          <div className="panel-content">
            
            {/* Anomaly Callout Box */}
            {selectedRecord.status === 'FLAGGED' && (
              <div style={{ backgroundColor: 'rgba(225, 29, 72, 0.08)', border: '1px solid rgba(225, 29, 72, 0.15)', borderRadius: '12px', padding: '20px', color: 'var(--color-flagged)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, fontSize: '15px' }}>
                  <AlertTriangle className="nav-icon" style={{ width: '20px', height: '20px' }} />
                  Data Quality Anomaly Detected
                </div>
                <p style={{ fontSize: '14.5px', marginTop: '8px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedRecord.anomaly_reason}
                </p>
                
                {/* Auto fix trigger */}
                {selectedRecord.source_type !== 'SAP' && (
                  <button 
                    onClick={() => handleAutoResolve(selectedRecord.id)}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '14px', backgroundColor: 'var(--brand-green)', fontSize: '13px', padding: '10px' }}
                  >
                    <Sparkles className="nav-icon" style={{ width: '14px', height: '14px' }} />
                    Auto-Resolve Anomaly
                  </button>
                )}
              </div>
            )}

            {/* In-Line Editing Block */}
            <div className="panel-section">
              <div className="panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Record Properties Override</span>
                {selectedRecord.status !== 'APPROVED' && !isEditing && (
                  <button 
                    onClick={startEditing}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11px', height: 'auto' }}
                  >
                    <Edit3 className="nav-icon" style={{ width: '12px', height: '12px' }} /> Edit Fields
                  </button>
                )}
              </div>

              {!isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Activity Segment:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedRecord.activity_type}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Scope Tier:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedRecord.scope_category.replace('_', ' ')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Ingested Quantity:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>{selectedRecord.raw_quantity} {selectedRecord.raw_unit}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Invoice Cost:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>₹{selectedRecord.cost_in_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Carbon Footprint:</span>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--mono)' }}>{selectedRecord.co2_emissions_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg CO₂e</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Dates window:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedRecord.start_date} to {selectedRecord.end_date}</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleManualEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-group">
                    <label>Activity Description</label>
                    <input 
                      type="text" 
                      value={editForm.activity_type}
                      onChange={(e) => setEditForm({ ...editForm, activity_type: e.target.value })}
                    />
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Quantity</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        value={editForm.raw_quantity}
                        onChange={(e) => setEditForm({ ...editForm, raw_quantity: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Unit</label>
                      <input 
                        type="text" 
                        value={editForm.raw_unit}
                        onChange={(e) => setEditForm({ ...editForm, raw_unit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Cost (INR)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editForm.cost_in_inr}
                        onChange={(e) => setEditForm({ ...editForm, cost_in_inr: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Start Date</label>
                      <input 
                        type="date" 
                        value={editForm.start_date}
                        onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input 
                      type="date" 
                      value={editForm.end_date}
                      onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Anomaly Flag Reason (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="No anomaly details"
                      value={editForm.anomaly_reason}
                      onChange={(e) => setEditForm({ ...editForm, anomaly_reason: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, backgroundColor: 'var(--brand-green)' }}>Save Recalculate</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>

            {/* Ingestion Data Lineage */}
            <div className="panel-section">
              <div className="panel-section-title">Raw Ingest Lineage Payload</div>
              <div className="json-block">
                {JSON.stringify(selectedRecord.raw_data_payload, null, 2)}
              </div>
            </div>

            {/* Audit Logs Trail */}
            <div className="panel-section">
              <div className="panel-section-title">Record Compliance History</div>
              <div className="timeline-list">
                {selectedRecord.audits.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No audits logged for this record.</div>
                ) : (
                  selectedRecord.audits.map((audit, aIdx) => (
                    <div key={aIdx} className="timeline-item highlight">
                      <div className="timeline-time">{new Date(audit.timestamp).toLocaleString()}</div>
                      <div className="timeline-action">{audit.action}</div>
                      <div className="timeline-details">
                        {audit.changes?.message || (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                            {Object.entries(audit.changes || {}).map(([key, val]) => {
                              if (key === 'comment') return <span key={key}>Comment: <em>{val}</em></span>;
                              if (Array.isArray(val)) {
                                return (
                                  <span key={key} style={{ fontSize: '11px' }}>
                                    Changed <strong>{key}</strong>: <del style={{ color: 'var(--color-flagged)' }}>{val[0] !== null ? val[0] : 'None'}</del> ➔ <ins style={{ color: 'var(--color-approved)', textDecoration: 'none' }}>{val[1] !== null ? val[1] : 'None'}</ins>
                                  </span>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Footnotes reviews action block */}
          {selectedRecord.status !== 'APPROVED' && (
            <div className="panel-footer">
              <button 
                onClick={() => handleStatusChange(selectedRecord.id, 'APPROVED')}
                className="btn btn-primary"
                style={{ flexGrow: 1, backgroundColor: 'var(--color-approved)' }}
              >
                <Check className="nav-icon" /> Approve Sealing
              </button>
              <button 
                onClick={() => handleStatusChange(selectedRecord.id, 'FLAGGED')}
                className="btn btn-danger"
                style={{ flexGrow: 1 }}
              >
                <AlertTriangle className="nav-icon" /> Flag Suspicious
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Toast Notification Feedback */}
      {toast && (
        <div className="toast" style={{ borderLeft: `4px solid ${toast.type === 'error' ? 'var(--color-flagged)' : 'var(--brand-green)'}` }}>
          {toast.type === 'error' ? (
            <AlertTriangle className="nav-icon" style={{ color: 'var(--color-flagged)' }} />
          ) : (
            <CheckCircle className="nav-icon" style={{ color: 'var(--brand-green)' }} />
          )}
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{toast.message}</span>
        </div>
      )}

    </div>
  );
}