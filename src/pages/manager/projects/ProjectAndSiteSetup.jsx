import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Navigation,
  ShieldCheck,
  Phone,
  User,
  Layers,
  FileText,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Lock,
  Plus,
  History,
  CreditCard,
  Handshake,
} from 'lucide-react'
import {
  createProjectAndSiteAtomic,
  updateProjectAndSiteDoc,
  subscribeProjects,
  fetchSitePaymentHistory,
} from '../../../services/projectService'
import {
  CONFIG_SECTIONS,
  subscribeConfigItems,
} from '../../../services/projectConfigService'
import {
  fetchSupervisors,
} from '../../../services/supervisorService'
import { SubscriptionLimitService } from '../../../services/subscriptionLimitService'
import SubscriptionLimitModal from '../../../components/common/SubscriptionLimitModal'
import Modal from '../../../components/common/Modal'

function money(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)
}

export default function ProjectAndSiteSetup({ orgId, currentUser, onNotify }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Active Tab: 'create' | 'update'
  const initialTab = searchParams.get('tab') === 'update' ? 'update' : 'create'
  const initialSiteId = searchParams.get('siteId') || ''
  const [activeTab, setActiveTab] = useState(initialTab)

  // Subscription Limit States
  const [planLimits, setPlanLimits] = useState(null)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalData, setLimitModalData] = useState(null)

  // Guided Stepper Step for Create Mode: 1 | 2 | 3
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [fetchingGps, setFetchingGps] = useState(false)
  const [successModalData, setSuccessModalData] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Master Configuration Dictionaries from Firestore
  const [categories, setCategories] = useState([])
  const [subCategories, setSubCategories] = useState([])
  const [stages, setStages] = useState([])
  const [contracts, setContracts] = useState([])
  const [statuses, setStatuses] = useState([])
  const [configsLoaded, setConfigsLoaded] = useState(false)

  // Staff & Existing Projects
  const [supervisors, setSupervisors] = useState([])
  const [existingProjects, setExistingProjects] = useState([])

  // Subscribe to Master Dictionaries & Projects
  useEffect(() => {
    if (!orgId) return

    const unsubCat = subscribeConfigItems(orgId, CONFIG_SECTIONS.category, setCategories)
    const unsubSub = subscribeConfigItems(orgId, CONFIG_SECTIONS.subCategory, setSubCategories)
    const unsubStg = subscribeConfigItems(orgId, CONFIG_SECTIONS.stage, setStages)
    const unsubCont = subscribeConfigItems(orgId, CONFIG_SECTIONS.contract, setContracts)
    const unsubStat = subscribeConfigItems(orgId, CONFIG_SECTIONS.status, (data) => {
      setStatuses(data)
      setConfigsLoaded(true)
    })

    const unsubProjects = subscribeProjects(orgId, (data) => {
      setExistingProjects(data)
    })

    fetchSupervisors(orgId).then((res) => {
      if (Array.isArray(res)) setSupervisors(res)
    }).catch(console.error)

    return () => {
      unsubCat()
      unsubSub()
      unsubStg()
      unsubCont()
      unsubStat()
      unsubProjects()
    }
  }, [orgId])

  // Real-time Plan Limits
  useEffect(() => {
    if (!orgId) return
    SubscriptionLimitService.getActivePlanLimits(orgId)
      .then(setPlanLimits)
      .catch(console.error)
  }, [orgId])

  const handleSwitchToCreateTab = async () => {
    if (orgId) {
      try {
        const check = await SubscriptionLimitService.canCreateSite({
          orgId,
          currentPlanName: planLimits?.planName,
          currentSitesCount: existingProjects.length,
        })
        if (check.allowed === false || check.isAllowed === false) {
          setLimitModalData(check)
          setLimitModalOpen(true)
          return
        }
      } catch (err) {
        console.warn('Quota check error:', err)
      }
    }
    setActiveTab('create')
    setSearchParams({})
  }

  // =========================================================================
  // TAB 1: CREATE NEW SITE STATE
  // =========================================================================
  const [formData, setFormData] = useState({
    // Step 1: Site Details & Geolocation
    siteName: '',
    location: '',
    latitude: '',
    longitude: '',
    plannedStartDate: new Date().toISOString().split('T')[0],
    plannedEndDate: '',
    status: 'Planning',

    // Step 2: Project Scope & Financials
    projectName: '',
    ownerName: '',
    ownerPhoneNumber: '',
    projectBudget: '',
    amountPaid: '',
    projectCategory: '',
    projectSubCategory: '',
    projectContract: '',
    projectStage: '',
    actualStartDate: '',
    actualEndDate: '',
    isContractWork: false,
    contractorName: '',
    contractorBudget: '',

    // Step 3: Supervisor Assignment & Terms
    skipSupervisor: false,
    supervisorId: '',
    supervisorName: '',
    joinedDate: new Date().toISOString().split('T')[0],
    siteComments: '',
    termsAgreed: false,
  })

  // Auto-sync Project Name from Site Name if not manually overridden
  const handleSiteNameChange = (val) => {
    setFormData((prev) => {
      const isSyncNeeded = !prev.projectName || prev.projectName === prev.siteName
      return {
        ...prev,
        siteName: val,
        projectName: isSyncNeeded ? val : prev.projectName,
      }
    })
  }

  // Filter Sub-Categories by selected category
  const filteredSubCategories = useMemo(() => {
    if (!formData.projectCategory) return subCategories
    return subCategories.filter(
      (s) => !s.projectCategory || s.projectCategory === formData.projectCategory
    )
  }, [subCategories, formData.projectCategory])

  // Financial Computations for Step 2
  const budgetNum = Number(formData.projectBudget) || 0
  const paidNum = Number(formData.amountPaid) || 0

  // Real-time Validation: Initial Amount Paid / Advance must not be greater than Total Project Budget
  const isAdvanceExceedingBudget = Boolean(
    paidNum > 0 && paidNum > budgetNum
  )

  // Do not calculate a negative or invalid remaining balance when advance exceeds budget
  const balanceRemaining = isAdvanceExceedingBudget ? 0 : Math.max(0, budgetNum - paidNum)
  const receivedPercentage = budgetNum > 0 ? (isAdvanceExceedingBudget ? 100 : Math.min(100, Math.round((paidNum / budgetNum) * 100))) : 0

  // Automatically clear budget validation banner message once valid advance is entered
  useEffect(() => {
    if (!isAdvanceExceedingBudget && errorMsg === 'Initial amount cannot be greater than the project budget.') {
      setErrorMsg('')
    }
  }, [isAdvanceExceedingBudget, errorMsg])

  // Browser GPS Location Fetcher
  const handleFetchGps = () => {
    if (!navigator.geolocation) {
      onNotify?.('Geolocation is not supported by your browser', 'error')
      return
    }
    setFetchingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFetchingGps(false)
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
        onNotify?.('Current GPS coordinates acquired successfully', 'success')
      },
      (err) => {
        setFetchingGps(false)
        console.warn('GPS Error:', err.message)
        onNotify?.('Could not acquire GPS fix. You may enter coordinates manually.', 'info')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  // Date Range Validation: End date must be strictly after start date
  const isDateRangeInvalid = Boolean(
    formData.plannedStartDate &&
    formData.plannedEndDate &&
    new Date(formData.plannedEndDate).getTime() <= new Date(formData.plannedStartDate).getTime()
  )

  // Automatically clear date validation banner message once valid dates are selected
  useEffect(() => {
    if (!isDateRangeInvalid && errorMsg === 'End date must be after the start date.') {
      setErrorMsg('')
    }
  }, [isDateRangeInvalid, errorMsg])

  // Step 1 Validation
  const validateStep1 = () => {
    if (!formData.siteName.trim()) {
      setErrorMsg('Site Name is required')
      return false
    }
    if (!formData.location.trim()) {
      setErrorMsg('Location Address is required')
      return false
    }
    if (isDateRangeInvalid) {
      setErrorMsg('End date must be after the start date.')
      return false
    }
    setErrorMsg('')
    return true
  }

  // Step 2 Validation
  const validateStep2 = () => {
    if (!formData.projectName.trim()) {
      setErrorMsg('Project Name is required')
      return false
    }
    if (!formData.ownerName.trim()) {
      setErrorMsg('Owner / Client Name is required')
      return false
    }
    const cleanPhone = formData.ownerPhoneNumber.trim()
    if (!/^\d{10}$/.test(cleanPhone)) {
      setErrorMsg('Owner Phone Number must be exactly 10 digits')
      return false
    }
    if (isAdvanceExceedingBudget) {
      setErrorMsg('Initial amount cannot be greater than the project budget.')
      return false
    }
    setErrorMsg('')
    return true
  }

  // Step 3 & Final Submission
  const handleCreateSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!validateStep1() || !validateStep2()) return
    if (!formData.termsAgreed) {
      setErrorMsg('Please review and confirm compliance with project standards')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const limitCheck = await SubscriptionLimitService.canCreateSite({
        orgId,
        currentPlanName: planLimits?.planName,
        currentSitesCount: existingProjects.length,
      })
      if (limitCheck.allowed === false || limitCheck.isAllowed === false) {
        setLimitModalData(limitCheck)
        setLimitModalOpen(true)
        setSubmitting(false)
        return
      }

      const managerActor = {
        id: currentUser?.uid || 'mgr_lead',
        name: currentUser?.displayName || currentUser?.fullName || 'Operations Manager',
      }

      const result = await createProjectAndSiteAtomic(orgId, formData, managerActor)
      setSuccessModalData(result)
      onNotify?.(`Project & Site "${result.siteName}" created successfully!`, 'success')
      if (orgId) {
        SubscriptionLimitService.getActivePlanLimits(orgId).then(setPlanLimits).catch(console.error)
      }
    } catch (err) {
      console.error(err)
      if (err.code === 'SUBSCRIPTION_LIMIT_REACHED' || err.code === 'SITE_LIMIT_REACHED' || err.code === 'SUBSCRIPTION_EXPIRED' || err.details) {
        setLimitModalData(err.details || {
          reason: err.code === 'SUBSCRIPTION_EXPIRED' ? 'SUBSCRIPTION_EXPIRED' : 'SITE_LIMIT_REACHED',
          planName: planLimits?.planName || 'Current Plan',
          currentCount: existingProjects.length,
          maxLimit: planLimits?.quotas?.maxProjects || planLimits?.maxProjects,
          message: err.message,
        })
        setLimitModalOpen(true)
      } else {
        setErrorMsg(err.message || 'Failed to create project and site')
        onNotify?.(err.message || 'Failed to create project and site', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetCreateForm = () => {
    setFormData({
      siteName: '',
      location: '',
      latitude: '',
      longitude: '',
      plannedStartDate: new Date().toISOString().split('T')[0],
      plannedEndDate: '',
      status: 'Planning',
      projectName: '',
      ownerName: '',
      ownerPhoneNumber: '',
      projectBudget: '',
      amountPaid: '',
      projectCategory: '',
      projectSubCategory: '',
      projectContract: '',
      projectStage: '',
      actualStartDate: '',
      actualEndDate: '',
      isContractWork: false,
      contractorName: '',
      contractorBudget: '',
      skipSupervisor: false,
      supervisorId: '',
      supervisorName: '',
      joinedDate: new Date().toISOString().split('T')[0],
      siteComments: '',
      termsAgreed: false,
    })
    setStep(1)
    setSuccessModalData(null)
    setErrorMsg('')
  }

  // =========================================================================
  // TAB 2: UPDATE EXISTING SITE STATE (Complies 100% with Update Tab Spec)
  // =========================================================================
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId)
  const [updateFormData, setUpdateFormData] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)

  // Payment Add Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [stagedPayment, setStagedPayment] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payMode, setPayMode] = useState('Bank Transfer / RTGS')
  const [payRef, setPayRef] = useState('')
  const [payRemarks, setPayRemarks] = useState('')

  // Payment History Modal State
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Auto-select site from URL parameter if provided
  useEffect(() => {
    if (initialSiteId) {
      setSelectedSiteId(initialSiteId)
      setActiveTab('update')
    }
  }, [initialSiteId])

  // Hydrate form data when site selection changes
  useEffect(() => {
    if (!selectedSiteId || existingProjects.length === 0) {
      setUpdateFormData(null)
      setStagedPayment(null)
      return
    }

    const found = existingProjects.find(
      (p) => p.id === selectedSiteId || p.siteId === selectedSiteId || p.projectId === selectedSiteId
    )

    if (found) {
      const formatDateStr = (raw) => {
        if (!raw) return ''
        const d = raw.toDate ? raw.toDate() : new Date(raw)
        return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
      }

      setStagedPayment(null)
      setUpdateFormData({
        id: found.id || found.projectId || selectedSiteId,
        siteCode: found.siteCode || found.code || 'ST001',
        projectCode: found.projectCode || 'PR001',
        siteName: found.siteName || found.name || '',
        projectName: found.projectName || found.siteName || found.name || '',
        location: found.location || found.siteLocation || '',
        latitude: found.latitude || '',
        longitude: found.longitude || '',
        ownerName: found.ownerName || found.clientOwnerName || found.clientName || '',
        ownerPhoneNumber: found.ownerPhoneNumber || found.clientPhone || found.clientPhoneNumber || '',
        projectBudget: Number(found.projectBudget ?? found.totalBudget ?? found.budget ?? 0),
        amountPaid: Number(found.amountPaid ?? found.advancePaid ?? found.amountReceived ?? 0),
        amountSpent: Number(found.amountSpent ?? found.totalAmountSpent ?? found.spentAmount ?? 0),
        projectCategory: found.projectCategory || found.projectType || '',
        projectSubCategory: found.projectSubCategory || '',
        projectContract: found.projectContract || found.projectContractType || found.contractType || '',
        projectStage: found.projectStage || found.currentStage || 'Planning',
        status: found.currentStatus || found.status || found.projectStatus || 'Planning',
        plannedStartDate: formatDateStr(found.plannedStartDate || found.startDate),
        plannedEndDate: formatDateStr(found.plannedEndDate || found.endDate || found.targetEndDate),
        actualStartDate: formatDateStr(found.actualStartDate || found.actualStateDate),
        actualEndDate: formatDateStr(found.actualEndDate),
        isContractWork: Boolean(found.isContractWork),
        contractorName: found.contractorName || '',
        contractorBudget: found.contractorBudget || '',
        contractStartDate: formatDateStr(found.contractStartDate),
        contractEndDate: formatDateStr(found.contractEndDate),
        supervisorId: found.supervisorId || '',
        supervisorName: found.supervisorName || '',
      })
    }
  }, [selectedSiteId, existingProjects])

  // Fetch payment vouchers for History Modal
  const handleOpenPaymentHistory = async () => {
    if (!updateFormData?.id) return
    setIsPaymentHistoryModalOpen(true)
    setLoadingHistory(true)
    try {
      const records = await fetchSitePaymentHistory(orgId, updateFormData.id)
      setPaymentHistory(records)
    } catch (err) {
      console.error(err)
      onNotify?.('Failed to load payment history vouchers', 'error')
    } finally {
      setLoadingHistory(false)
    }
  }

  // Handle Recording New Payment in Modal
  const handleRecordStagedPayment = (e) => {
    e.preventDefault()
    const amt = Number(payAmount)
    if (!amt || amt <= 0) {
      onNotify?.('Please enter a valid payment amount greater than zero', 'error')
      return
    }

    const newPayObj = {
      amount: amt,
      paymentMode: payMode,
      transactionRef: payRef.trim(),
      remarks: payRemarks.trim(),
      date: payDate,
      recordedBy: currentUser?.displayName || currentUser?.fullName || 'Operations Manager',
    }

    setStagedPayment(newPayObj)
    setIsPaymentModalOpen(false)
    setPayAmount('')
    setPayRef('')
    setPayRemarks('')
    onNotify?.(`Payment voucher of ₹${amt.toLocaleString('en-IN')} staged. Click "Save & Update Site" to commit.`, 'info')
  }

  // Computed live numbers in Update Tab
  const liveTotalAmountPaid = useMemo(() => {
    if (!updateFormData) return 0
    return Number(updateFormData.amountPaid || 0) + (stagedPayment ? Number(stagedPayment.amount || 0) : 0)
  }, [updateFormData, stagedPayment])

  const liveBalanceRemaining = useMemo(() => {
    if (!updateFormData) return 0
    return liveTotalAmountPaid - Number(updateFormData.amountSpent || 0)
  }, [liveTotalAmountPaid, updateFormData])

  // Execute Atomic Batch Update
  const handleConfirmSaveUpdate = async () => {
    if (!updateFormData || !updateFormData.id) return

    setUpdating(true)
    setIsConfirmModalOpen(false)
    try {
      const managerActor = {
        id: currentUser?.uid || 'mgr_lead',
        name: currentUser?.displayName || currentUser?.fullName || 'Operations Manager',
      }

      const updatePayload = {
        selectedSiteDocId: updateFormData.id,
        selectedProjectId: updateFormData.id,
        status: updateFormData.status,
        projectStage: updateFormData.projectStage,
        actualStartDate: updateFormData.actualStartDate ? new Date(updateFormData.actualStartDate) : null,
        actualEndDate: updateFormData.actualEndDate ? new Date(updateFormData.actualEndDate) : null,
        siteName: updateFormData.siteName,
        projectName: updateFormData.projectName,
        location: updateFormData.location,
        latitude: updateFormData.latitude,
        longitude: updateFormData.longitude,
        projectCategory: updateFormData.projectCategory,
        projectSubCategory: updateFormData.projectSubCategory,
        projectContract: updateFormData.projectContract,
        plannedStartDate: updateFormData.plannedStartDate ? new Date(updateFormData.plannedStartDate) : null,
        plannedEndDate: updateFormData.plannedEndDate ? new Date(updateFormData.plannedEndDate) : null,
        projectBudget: updateFormData.projectBudget,
        currentAmountPaid: updateFormData.amountPaid,
        amountSpent: updateFormData.amountSpent,
        ownerName: updateFormData.ownerName,
        ownerPhoneNumber: updateFormData.ownerPhoneNumber,
        isContractWork: updateFormData.isContractWork,
        contractorName: updateFormData.contractorName,
        contractorBudget: updateFormData.contractorBudget,
        newPayment: stagedPayment,
      }

      await updateProjectAndSiteDoc(orgId, updatePayload, managerActor)
      onNotify?.(`Site "${updateFormData.siteCode} - ${updateFormData.siteName}" updated successfully in Firestore!`, 'success')
      setStagedPayment(null)
    } catch (err) {
      console.error(err)
      onNotify?.(err.message || 'Failed to update project and site', 'error')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-blue-100 text-blue-800">
              Operations Control
            </span>
            <span className="text-xs text-slate-400 font-mono">/ Project Lifecycle</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project & Site Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Single Source of Truth for site identification, contract financials, customer credentials, and supervisor assignments.
          </p>
        </div>

        {/* Dual Tab Switcher & Quota */}
        <div className="flex flex-wrap items-center gap-3">
          {(planLimits?.quotas || planLimits?.maxProjects) && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Site Quota:</span>
              <span className="font-bold text-slate-800">
                {existingProjects.length} / {(planLimits.quotas?.maxProjects ?? planLimits.maxProjects) >= 999999 ? '∞' : (planLimits.quotas?.maxProjects ?? planLimits.maxProjects)}
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {planLimits.planName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={handleSwitchToCreateTab}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>＋</span> Create New Site
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('update')
                setSearchParams({ tab: 'update' })
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'update'
                  ? 'bg-[#0B3470] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>✏️</span> Update Site
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CREATE NEW SITE                                                */}
      {/* ===================================================================== */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Missing Categories Warning Banner */}
          {configsLoaded && categories.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">No Project Categories Configured</span>
                  <span className="text-[11px] text-amber-700">
                    No Project Category values have been configured yet. Please configure them in Project Configuration to continue.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/manager/project-configuration')}
                className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl font-bold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Configure Categories</span>
              </button>
            </div>
          )}

          {/* Stepper Progress Indicator */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { num: 1, title: '1. Site & Geolocation', desc: 'Plot address & GPS coordinates' },
              { num: 2, title: '2. Project Scope & Budget', desc: 'Customer credentials & financials' },
              { num: 3, title: '3. Supervisor & Terms', desc: 'Supervisory assignment & sign-off' },
            ].map((s) => {
              const active = step === s.num
              const passed = step > s.num
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    if (s.num === 1) setStep(1)
                    if (s.num === 2 && validateStep1()) setStep(2)
                    if (s.num === 3 && validateStep1() && validateStep2()) setStep(3)
                  }}
                  className={`p-4 rounded-2xl border text-left transition-all relative ${
                    active
                      ? 'bg-white border-[#0B3470] shadow-sm ring-2 ring-blue-600/20'
                      : passed
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                        active
                          ? 'bg-[#0B3470] text-white'
                          : passed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {passed ? '✓' : s.num}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Step {s.num} of 3
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <h3 className="font-bold text-slate-900 text-xs">{s.title}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{s.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Container */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs">
            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <span>Step 1: Construction Site Identification & Geolocation</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the official physical site plot identifier, delivery location address, and GPS geofence pin.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Site Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.siteName}
                      onChange={(e) => handleSiteNameChange(e.target.value)}
                      placeholder="e.g. Skyline Towers Phase 1"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[11px] text-slate-400">Canonical document ID format: PR{'{seq}'}_ST{'{seq}'}_CleanSiteName</p>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Physical Location / Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g. Plot 42, Main Road, Electronic City Phase 2"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  {/* Geolocation Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">GPS Latitude</label>
                      <button
                        type="button"
                        onClick={handleFetchGps}
                        disabled={fetchingGps}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Navigation className={`w-3.5 h-3.5 ${fetchingGps ? 'animate-spin' : ''}`} />
                        <span>{fetchingGps ? 'Locating...' : 'Fetch Device GPS'}</span>
                      </button>
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="e.g. 12.971598"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">GPS Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="e.g. 77.594566"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Planned Start Date</label>
                    <input
                      type="date"
                      value={formData.plannedStartDate}
                      onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Planned End Date</label>
                    <input
                      type="date"
                      value={formData.plannedEndDate}
                      onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                      className={`w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 transition-colors ${
                        isDateRangeInvalid
                          ? 'border-2 border-rose-500 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
                          : 'border border-slate-200 focus:ring-blue-500/20'
                      }`}
                    />
                    {isDateRangeInvalid && (
                      <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>End date must be after the start date.</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700">Initial Site Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    >
                      {statuses.length > 0 ? (
                        statuses.map((s) => (
                          <option key={s.id || s.projectStatusId} value={s.projectStatus || s.name}>
                            {s.projectStatus || s.name}
                          </option>
                        ))
                      ) : (
                        ['Planning', 'Ongoing', 'In Progress', 'On Hold', 'Completed'].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isDateRangeInvalid}
                    onClick={() => {
                      if (!isDateRangeInvalid && validateStep1()) setStep(2)
                    }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 ${
                      isDateRangeInvalid
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                        : 'bg-[#0B3470] hover:bg-blue-800 text-white cursor-pointer'
                    }`}
                  >
                    <span>Next: Project Scope & Budget</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <span>Step 2: Project Scope, Classification & Financial Budgeting</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Define client ownership, configure financial advance vs total budget, and map master business classifications.
                  </p>
                </div>

                {/* Customer Portal Notice Banner */}
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900">
                    <span className="font-bold block">Automatic Customer Portal Access</span>
                    <span className="text-[11px] text-emerald-700">
                      The Owner / Client Name and 10-digit Phone Number configured below will automatically serve as the zero-registration credentials for the customer login portal.
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Project Contract Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.projectName}
                      onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                      placeholder="e.g. Skyline Towers Phase 1 Main Contract"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Owner / Client Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.ownerName}
                      onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Owner Phone Number (10 Digits) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={formData.ownerPhoneNumber}
                      onChange={(e) => setFormData({ ...formData, ownerPhoneNumber: e.target.value.replace(/\D/g, '') })}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-mono"
                    />
                  </div>

                  {/* Financial Fields */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Total Project Budget (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.projectBudget}
                      onChange={(e) => setFormData({ ...formData, projectBudget: e.target.value })}
                      placeholder="e.g. 7500000"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Initial Amount Paid / Advance (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.amountPaid}
                      onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                      placeholder="e.g. 1500000"
                      className={`w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 font-mono transition-colors ${
                        isAdvanceExceedingBudget
                          ? 'border-2 border-rose-500 focus:ring-rose-500/20 focus:border-rose-500 text-rose-900'
                          : 'border border-slate-200 focus:ring-blue-500/20'
                      }`}
                    />
                    {isAdvanceExceedingBudget && (
                      <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Initial amount cannot be greater than the project budget.</span>
                      </p>
                    )}
                  </div>

                  {/* Interactive Financial Preview Card */}
                  <div className={`md:col-span-2 p-4 rounded-xl border space-y-3 transition-colors ${
                    isAdvanceExceedingBudget ? 'bg-rose-50/40 border-rose-200' : 'bg-blue-50/50 border-blue-200'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className={`font-bold uppercase tracking-wider text-[10px] ${
                          isAdvanceExceedingBudget ? 'text-rose-700' : 'text-blue-700'
                        }`}>
                          Financial Float Summary
                        </span>
                        <div className="flex items-center gap-4 mt-1 font-bold">
                          <span>Budget: <strong className="text-slate-900">{money(budgetNum)}</strong></span>
                          <span>Advance Paid: <strong className={isAdvanceExceedingBudget ? 'text-rose-700' : 'text-blue-800'}>{money(paidNum)}</strong></span>
                          <span>Balance: <strong className={isAdvanceExceedingBudget ? 'text-rose-600' : 'text-emerald-700'}>{money(balanceRemaining)}</strong></span>
                        </div>
                      </div>
                      <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg self-start sm:self-auto ${
                        isAdvanceExceedingBudget ? 'text-rose-900 bg-rose-100' : 'text-blue-900 bg-blue-100'
                      }`}>
                        {isAdvanceExceedingBudget ? 'Budget Exceeded' : `${receivedPercentage}% Funded`}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className={`w-full h-2.5 rounded-full overflow-hidden ${
                      isAdvanceExceedingBudget ? 'bg-rose-100' : 'bg-blue-100'
                    }`}>
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          isAdvanceExceedingBudget ? 'bg-rose-500' : 'bg-[#0B3470]'
                        }`}
                        style={{ width: `${isAdvanceExceedingBudget ? 100 : receivedPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Master Dictionaries Dropdowns */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Project Category</label>
                    <select
                      value={formData.projectCategory}
                      onChange={(e) => setFormData({ ...formData, projectCategory: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Select Category --</option>
                      {categories.map((c) => (
                        <option key={c.id || c.projectCategoryId} value={c.projectCategory}>
                          {c.projectCategory}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Project Sub-Category</label>
                    <select
                      value={formData.projectSubCategory}
                      onChange={(e) => setFormData({ ...formData, projectSubCategory: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Select Sub-Category --</option>
                      {filteredSubCategories.length > 0 ? (
                        filteredSubCategories.map((s) => (
                          <option key={s.id || s.subCategoryId} value={s.projectSubCategory}>
                            {s.projectSubCategory}
                          </option>
                        ))
                      ) : (
                        ['New Construction', 'Renovation', 'Expansion', 'Interior Fitout'].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Contract Type</label>
                    <select
                      value={formData.projectContract}
                      onChange={(e) => setFormData({ ...formData, projectContract: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Select Contract --</option>
                      {contracts.length > 0 ? (
                        contracts.map((c) => (
                          <option key={c.id || c.contractId} value={c.projectContract}>
                            {c.projectContract}
                          </option>
                        ))
                      ) : (
                        ['Turnkey Fixed Price', 'Item Rate Contract', 'Lump Sum', 'Labor Contract'].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Initial Project Stage</label>
                    <select
                      value={formData.projectStage}
                      onChange={(e) => setFormData({ ...formData, projectStage: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">-- Select Starting Stage --</option>
                      {stages.length > 0 ? (
                        stages.map((st) => (
                          <option key={st.id || st.projectStageId} value={st.projectStage}>
                            {st.projectStage}
                          </option>
                        ))
                      ) : (
                        ['Planning', 'Foundation', 'Structure', 'Finishing', 'Handover'].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Subcontractor Allocation Toggle */}
                  <div className="md:col-span-2 pt-3 border-t border-slate-100">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={formData.isContractWork}
                        onChange={(e) => setFormData({ ...formData, isContractWork: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                      />
                      <span>Assign Subcontractor Work Order for this Project</span>
                    </label>

                    {formData.isContractWork && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-600">Contractor Name / Agency</label>
                          <input
                            type="text"
                            value={formData.contractorName}
                            onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                            placeholder="e.g. Apex Civil Contractors Pvt Ltd"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-slate-600">Contractor Work Budget (₹)</label>
                          <input
                            type="number"
                            value={formData.contractorBudget}
                            onChange={(e) => setFormData({ ...formData, contractorBudget: e.target.value })}
                            placeholder="e.g. 2500000"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Site Details</span>
                  </button>
                  <button
                    type="button"
                    disabled={isAdvanceExceedingBudget}
                    onClick={() => {
                      if (!isAdvanceExceedingBudget && validateStep2()) setStep(3)
                    }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 ${
                      isAdvanceExceedingBudget
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                        : 'bg-[#0B3470] hover:bg-blue-800 text-white cursor-pointer'
                    }`}
                  >
                    <span>Next: Supervisor Assignment</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <span>Step 3: Field Supervisor Assignment & Architecture Confirmation</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Assign a field engineer to log daily materials and muster rolls, and review unified project parameters.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.skipSupervisor}
                      onChange={(e) => setFormData({ ...formData, skipSupervisor: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span>Skip Supervisor Assignment (Deploy later from Supervisor Setup)</span>
                  </label>

                  {!formData.skipSupervisor && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">Select Registered Supervisor</label>
                        <select
                          value={formData.supervisorId}
                          onChange={(e) => {
                            const supId = e.target.value
                            const sObj = supervisors.find((s) => (s.id || s.supervisorId) === supId)
                            setFormData({
                              ...formData,
                              supervisorId: supId,
                              supervisorName: sObj ? (sObj.fullName || sObj.name || sObj.FullName || sObj.username) : '',
                            })
                          }}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        >
                          <option value="">-- Choose Field Supervisor --</option>
                          {supervisors.map((s) => {
                            const sId = s.id || s.supervisorId
                            const sName = s.fullName || s.name || s.FullName || s.username
                            return (
                              <option key={sId} value={sId}>
                                {sName} ({sId})
                              </option>
                            )
                          })}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">Supervisor Joined Date</label>
                        <input
                          type="date"
                          value={formData.joinedDate}
                          onChange={(e) => setFormData({ ...formData, joinedDate: e.target.value })}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700">Site Brief / Operational Notes</label>
                        <textarea
                          rows={2}
                          value={formData.siteComments}
                          onChange={(e) => setFormData({ ...formData, siteComments: e.target.value })}
                          placeholder="e.g. Ensure soil stabilization reports are certified before casting footing."
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  {/* Architecture Summary Table */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                      Unified Project Architecture Summary
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Site Name</span>
                        <strong className="text-slate-900 truncate block">{formData.siteName || 'N/A'}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Client</span>
                        <strong className="text-slate-900 truncate block">{formData.ownerName || 'N/A'}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Budget</span>
                        <strong className="text-slate-900 truncate block">{money(budgetNum)}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Supervisor</span>
                        <strong className="text-slate-900 truncate block">
                          {formData.skipSupervisor ? 'None (Skipped)' : (formData.supervisorName || 'Not selected')}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Verification Checkbox */}
                  <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                    <label className="flex items-start gap-3 cursor-pointer text-xs font-semibold text-amber-950">
                      <input
                        type="checkbox"
                        checked={formData.termsAgreed}
                        onChange={(e) => setFormData({ ...formData, termsAgreed: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-amber-300 mt-0.5 shrink-0"
                      />
                      <span>
                        I confirm that all site and project parameters have been reviewed and comply with organization project standards.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Project Scope</span>
                  </button>
                  <button
                    type="button"
                    disabled={!formData.termsAgreed || submitting || isAdvanceExceedingBudget}
                    onClick={handleCreateSubmit}
                    className="px-6 py-2.5 bg-[#0B3470] hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Creating Canonical Project...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Complete & Save Project</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: UPDATE EXISTING SITE (Complies 100% with Update Tab Spec)       */}
      {/* ===================================================================== */}
      {activeTab === 'update' && (
        <div className="space-y-6">
          {/* Bento Card: Select Site Dropdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 max-w-xl">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Construction Site to Update
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">-- Choose Existing Site ({existingProjects.length} available) --</option>
                {existingProjects.map((p) => {
                  const sId = p.id || p.siteId || p.projectId
                  const sName = p.siteName || p.projectName || p.name || 'Unnamed Site'
                  const pCode = p.siteCode || p.projectCode || ''
                  return (
                    <option key={sId} value={sId}>
                      {sName} {pCode ? `(${pCode})` : ''} — {p.currentStatus || p.status || 'Active'}
                    </option>
                  )
                })}
              </select>
            </div>

            {updateFormData && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={handleOpenPaymentHistory}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>Payment History</span>
                </button>
              </div>
            )}
          </div>

          {updateFormData ? (
            <div className="space-y-6">
              {/* Active Site Indicator Banner (Section 2.3) */}
              <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50/50 via-white to-white">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-lg text-xs font-black bg-[#0B3470] text-white tracking-wider font-mono shadow-xs">
                    {updateFormData.siteCode}
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{updateFormData.siteName}</span>
                      <span className="text-xs font-medium text-slate-400">({updateFormData.projectCode})</span>
                    </h2>
                    <p className="text-[11px] text-slate-500">• Currently modifying values for this site only</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Canonical ID:</span>
                  <code className="text-xs font-mono font-bold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded-md border border-blue-200">
                    {updateFormData.id}
                  </code>
                </div>
              </div>

              {/* Stacked Bento Cards (Section 4.1, 4.2, 4.3) */}
              <div className="space-y-6">
                {/* ========================================================= */}
                {/* BENTO CARD 1: 1. SITE DETAILS & TIMELINE                 */}
                {/* ========================================================= */}
                <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">1. Site Details & Timeline</h3>
                      <p className="text-[11px] text-slate-500">Basic site information & geographical coordinates</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    {/* 1. Site Name (Read-Only) */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Site Name</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.siteName}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* 2. Category (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Project Category</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.projectCategory || 'General Construction'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* 3. Location (Read-Only) */}
                    <div className="space-y-1 sm:col-span-3">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Location / Address</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.location}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* 4. GPS Coordinates (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>GPS Latitude</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.latitude || 'Not Geocoded'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-mono font-semibold cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>GPS Longitude</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.longitude || 'Not Geocoded'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-mono font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* 5. Planned Dates (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Planned Start & End</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${updateFormData.plannedStartDate || 'N/A'} → ${updateFormData.plannedEndDate || 'N/A'}`}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* 6. EDITABLE: Site Status */}
                    <div className="space-y-1 bg-amber-50/50 p-3 rounded-xl border border-amber-200 sm:col-span-1">
                      <label className="block text-slate-900 font-bold text-xs">
                        Site Status <span className="text-amber-700 text-[10px] font-normal">(Editable)</span>
                      </label>
                      <select
                        value={updateFormData.status}
                        onChange={(e) => setUpdateFormData({ ...updateFormData, status: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                      >
                        {statuses.length > 0 ? (
                          statuses.map((s) => (
                            <option key={s.id || s.projectStatusId} value={s.projectStatus || s.name}>
                              {s.projectStatus || s.name}
                            </option>
                          ))
                        ) : (
                          ['Planning', 'Ongoing', 'In Progress', 'On Hold', 'Completed'].map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* 7. EDITABLE: Actual Start Date */}
                    <div className="space-y-1 bg-amber-50/50 p-3 rounded-xl border border-amber-200">
                      <label className="block text-slate-900 font-bold text-xs">
                        Actual Start Date <span className="text-amber-700 text-[10px] font-normal">(Editable)</span>
                      </label>
                      <input
                        type="date"
                        value={updateFormData.actualStartDate}
                        onChange={(e) => setUpdateFormData({ ...updateFormData, actualStartDate: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* 8. EDITABLE: Actual End Date */}
                    <div className="space-y-1 bg-amber-50/50 p-3 rounded-xl border border-amber-200">
                      <label className="block text-slate-900 font-bold text-xs">
                        Actual End Date <span className="text-amber-700 text-[10px] font-normal">(Editable)</span>
                      </label>
                      <input
                        type="date"
                        value={updateFormData.actualEndDate}
                        onChange={(e) => setUpdateFormData({ ...updateFormData, actualEndDate: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* BENTO CARD 2: 2. CONTRACT WORK (SUBCONTRACTOR ALLOCATION) */}
                {/* ========================================================= */}
                <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">2. Contract Work</h3>
                        <p className="text-[11px] text-slate-500">Third-party contractor allocation</p>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        updateFormData.isContractWork
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {updateFormData.isContractWork ? 'Work Allocated' : 'No Subcontractor'}
                    </span>
                  </div>

                  {updateFormData.isContractWork ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="flex items-center justify-between text-slate-600 font-semibold">
                          <span>Contractor Name / Agency</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                        </label>
                        <input
                          type="text"
                          disabled
                          value={updateFormData.contractorName || 'N/A'}
                          className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="flex items-center justify-between text-slate-600 font-semibold">
                          <span>Contractor Budget (₹)</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                        </label>
                        <input
                          type="text"
                          disabled
                          value={money(updateFormData.contractorBudget)}
                          className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-mono font-semibold cursor-not-allowed"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No subcontractor work order assigned for this site.
                    </div>
                  )}
                </div>

                {/* ========================================================= */}
                {/* BENTO CARD 3: 3. PROJECT CONFIGURATION & FINANCIALS      */}
                {/* ========================================================= */}
                <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">3. Project Configuration & Financials</h3>
                      <p className="text-[11px] text-slate-500">Linked project metadata, stage & budget</p>
                    </div>
                  </div>

                  {/* Financial Overview Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Estimated Budget</span>
                      <strong className="text-sm font-bold text-slate-900 mt-0.5 block">{money(updateFormData.projectBudget)}</strong>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-blue-700 uppercase block">Amount Received</span>
                        <strong className="text-sm font-bold text-blue-900 mt-0.5 block">{money(liveTotalAmountPaid)}</strong>
                      </div>
                      {stagedPayment && (
                        <span className="text-[10px] font-bold text-amber-700 mt-1 block">
                          + ₹{stagedPayment.amount.toLocaleString('en-IN')} (Staged)
                        </span>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200">
                      <span className="text-[10px] font-bold text-rose-700 uppercase block">Total Spent (Ledger)</span>
                      <strong className="text-sm font-bold text-rose-900 mt-0.5 block">{money(updateFormData.amountSpent)}</strong>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">Balance Remaining</span>
                      <strong className="text-sm font-bold text-emerald-900 mt-0.5 block">{money(liveBalanceRemaining)}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    {/* Project Name (Read-Only) */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Project Contract Name</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.projectName}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* Sub-Category (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Project Sub-Category</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.projectSubCategory || 'N/A'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* EDITABLE: Project Milestone Stage */}
                    <div className="space-y-1 bg-amber-50/50 p-3 rounded-xl border border-amber-200 sm:col-span-1">
                      <label className="block text-slate-900 font-bold text-xs">
                        Project Milestone Stage <span className="text-amber-700 text-[10px] font-normal">(Editable)</span>
                      </label>
                      <select
                        value={updateFormData.projectStage}
                        onChange={(e) => setUpdateFormData({ ...updateFormData, projectStage: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                      >
                        {stages.length > 0 ? (
                          stages.map((st) => (
                            <option key={st.id || st.projectStageId} value={st.projectStage}>
                              {st.projectStage}
                            </option>
                          ))
                        ) : (
                          ['Planning', 'Foundation', 'Structure', 'Brick Works', 'Finishing', 'Handover'].map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Contract Type (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Contract Type</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Read-Only</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.projectContract || 'Turnkey'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* Add Payment Interactive Section */}
                    <div className="space-y-1 sm:col-span-1 flex flex-col justify-end">
                      <button
                        type="button"
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-[#0B3470] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Record Client Payment</span>
                      </button>
                    </div>

                    {/* Client Owner Name (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Client / Owner Name</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Portal User</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.ownerName || 'N/A'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-semibold cursor-not-allowed"
                      />
                    </div>

                    {/* Client Owner Phone (Read-Only) */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Client Phone Number</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Portal Credential</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        value={updateFormData.ownerPhoneNumber || 'N/A'}
                        className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-600 font-mono font-semibold cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Bottom Action Bar */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const found = existingProjects.find((p) => p.id === selectedSiteId)
                    if (found) setSelectedSiteId('')
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Discard Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(true)}
                  disabled={updating}
                  className="px-6 py-2.5 bg-[#0B3470] hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {updating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Firestore...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save & Update Site</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Site Selected</p>
              <p className="text-xs text-slate-400 mt-1">
                Please select a construction site from the dropdown above to load and update its values.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: ADD RECEIVED PAYMENT MODAL                                   */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Client Payment Voucher"
        subtitle={`Site: ${updateFormData?.siteName || ''} (${updateFormData?.siteCode || ''})`}
      >
        <form onSubmit={handleRecordStagedPayment} className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
            <span className="text-blue-800 font-semibold">Current Amount Received</span>
            <strong className="text-sm font-bold text-blue-900">{money(updateFormData?.amountPaid)}</strong>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              New Payment Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Payment Date</label>
              <input
                type="date"
                required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">Payment Mode</label>
              <select
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
              >
                <option value="Bank Transfer / RTGS">Bank Transfer / RTGS</option>
                <option value="UPI / Online">UPI / Online</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Transaction / Cheque Reference</label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. HDFC98234110 or Cheque #00412"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">Milestone Notes / Remarks</label>
            <input
              type="text"
              value={payRemarks}
              onChange={(e) => setPayRemarks(e.target.value)}
              placeholder="e.g. Stage payment for Foundation & Plinth cast"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
            />
          </div>

          {/* Live Preview Card */}
          {Number(payAmount) > 0 && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
              <div className="flex justify-between">
                <span>Updated Amount Received:</span>
                <strong>{money(Number(updateFormData?.amountPaid || 0) + Number(payAmount))}</strong>
              </div>
              <div className="flex justify-between text-[11px] text-emerald-800">
                <span>Updated Balance:</span>
                <strong>{money(Number(updateFormData?.amountPaid || 0) + Number(payAmount) - Number(updateFormData?.amountSpent || 0))}</strong>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs"
            >
              Record Payment Voucher
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 2: PAYMENT HISTORY MODAL                                        */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isPaymentHistoryModalOpen}
        onClose={() => setIsPaymentHistoryModalOpen(false)}
        title="Client Payment History"
        subtitle={`Historical vouchers recorded for ${updateFormData?.siteName || ''}`}
      >
        <div className="p-6 space-y-4 text-xs">
          {loadingHistory ? (
            <div className="py-8 text-center text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
              <span>Fetching payment vouchers...</span>
            </div>
          ) : paymentHistory.length === 0 ? (
            <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
              No payment vouchers recorded yet for this site.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 divide-y divide-slate-100">
              {paymentHistory.map((p) => (
                <div key={p.id || p.paymentId} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <strong className="text-slate-900 block">{p.paymentType || 'Client Payment'}</strong>
                    <span className="text-[11px] text-slate-500">
                      {p.date || 'N/A'} • {p.paymentMode || 'Direct'} {p.transactionRef ? `• Ref: ${p.transactionRef}` : ''}
                    </span>
                    {p.remarks && <p className="text-[11px] text-slate-400 italic mt-0.5">{p.remarks}</p>}
                  </div>
                  <div className="text-right">
                    <strong className="text-sm font-bold text-emerald-700 block">{money(p.amount)}</strong>
                    <span className="text-[10px] text-slate-400">By: {p.recordedBy || 'Manager'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPaymentHistoryModalOpen(false)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white"
            >
              Close History
            </button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODAL 3: CONFIRM UPDATE DIALOG (_confirmAndUpdateSite)                */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirm Update"
        subtitle="Save Modified Changes to Firestore"
      >
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-700 text-sm">
            Are you sure you want to save the modified changes to the backend for site <strong>{updateFormData?.siteName}</strong> ({updateFormData?.siteCode})?
          </p>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Updated Status:</span>
              <strong className="text-slate-900">{updateFormData?.status}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Updated Stage:</span>
              <strong className="text-slate-900">{updateFormData?.projectStage}</strong>
            </div>
            {stagedPayment && (
              <div className="flex justify-between text-blue-700 font-bold">
                <span>Staged Payment Voucher:</span>
                <span>+ {money(stagedPayment.amount)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSaveUpdate}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white shadow-xs flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Yes, Save Changes</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* SUCCESS MODAL FOR CREATE FLOW                                         */}
      {/* ===================================================================== */}
      {successModalData && (
        <Modal
          isOpen={Boolean(successModalData)}
          onClose={() => setSuccessModalData(null)}
          title="Project & Site Successfully Created"
          subtitle={`Canonical Document ID: ${successModalData.canonicalDocId}`}
        >
          <div className="p-6 space-y-5 text-xs">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
              <span className="font-bold block text-sm">✓ Atomic Registration Complete</span>
              <ul className="space-y-1 text-[11px] text-emerald-800">
                <li>• Canonical project document written to <code>/organisation/{'{orgId}'}/projects/{successModalData.canonicalDocId}</code></li>
                <li>• Expense accumulator registered in <code>totalSiteExpensesPerDay/{successModalData.siteDocId}</code></li>
                {successModalData.supervisorId && <li>• Field supervisor assigned in <code>siteSupervisorMap</code></li>}
                {successModalData.amountPaid > 0 && <li>• Initial advance voucher logged in <code>projectPayments</code></li>}
                <li>• Customer portal login active for <strong>{successModalData.ownerName}</strong> ({successModalData.ownerPhoneNumber})</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetCreateForm}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Create Another Site
              </button>
              <button
                type="button"
                onClick={() => navigate('/manager/sites')}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0B3470] hover:bg-blue-800 text-white"
              >
                View in Sites Directory →
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subscription Limit Modal */}
      <SubscriptionLimitModal
        isOpen={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        limitData={limitModalData}
      />
    </div>
  )
}
