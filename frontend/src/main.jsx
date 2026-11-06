import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, AtSign, Bell, Building2, CalendarCheck, Camera, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock3, HandCoins, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageSquareText, ShieldCheck, UserPlus, UserRound, UsersRound, Wallet, X } from 'lucide-react';
import { activateBankMember, activateBankStaff, activateUser, addBankBranch, checkInForAttendance, checkOutForAttendance, confirmPasswordReset, createBank, createBankAccount, createBankAdmin, createBankMember, createBankStaff, createLoan, createPayrollBatch, deactivateBankMember, deactivateBankStaff, decideLoan, deleteUser, depositToBankAccount, getAssignedBank, getAttendancePhoto, getAvailableBanks, getBankAccountTransactions, getBankAccounts, getBankAttendance, getBankMembers, getBankStaff, getBanks, getFinanceBanks, getGuestFeedback, getLoans, getMyAttendance, getMyBankAccounts, getPayrollBatches, getPayrollEmployees, getProfile, getRwandaCells, getRwandaDistricts, getRwandaProvinces, getRwandaSectors, getRwandaVillages, getUsers, login, markGuestFeedbackReviewed, markLoanDefaulted, payLoanFromAccount, payLoanWithVirtualSimulator, recordLoanRepayment, requestPasswordReset, resendOtp, searchTransferRecipients, submitGuestFeedback, transferBetweenAccounts, updateBankAccountStatus, updateProfile, updateUser, verifyOtp } from './api';
import './styles.css';

const initialForm = { email: '', password: '' };
const BANKS_PER_PAGE = 8;
const ACTIVITY_STORAGE_KEY = 'loarn_system_activity';
const BANK_STAFF_ROLES = [
  { value: 'branch_manager', label: 'Sub-branch Manager' },
  { value: 'general_manager', label: 'General Manager / CEO' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'accounts_manager', label: 'Accounts Manager' }
];

function loadActivityItems() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.error('Unable to read system activity history:', error);
    return [];
  }
}

function defaultDashboardSection(profile) {
  if (profile.role !== 'employee') return 'overview';
  switch (profile.staffRole || 'branch_manager') {
    case 'bank_admin': return 'overview';
    case 'general_manager': return 'overview';
    case 'hr_manager': return 'hr-dashboard';
    case 'finance_manager': return 'payroll';
    case 'accounts_manager': return 'ledger';
    default: return 'members';
  }
}

function App() {
  const [view, setView] = useState('login');
  const [form, setForm] = useState(initialForm);
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('loarn_token'));
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 8, total: 0, totalPages: 1 });
  const [userQuery, setUserQuery] = useState({ page: 1, limit: 8, sortBy: 'createdAt', sortOrder: 'desc', search: '', role: '' });
  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [activityItems, setActivityItems] = useState(loadActivityItems);
  const [loading, setLoading] = useState(false);
  const [loanApplications, setLoanApplications] = useState([]);
  const [systemAnnualInterestRate, setSystemAnnualInterestRate] = useState(12);

  const isAdmin = profile?.role === 'admin';
  const recordActivity = (message) => {
    if (!message) return;
    setActivityItems((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, createdAt: new Date().toISOString(), read: false },
      ...current
    ].slice(0, 50));
  };

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activityItems));
    } catch (error) {
      console.error('Unable to save system activity history:', error);
    }
  }, [activityItems]);

  useEffect(() => {
    if (!token) return;
    const loadProfile = () => getProfile(token)
      .then(({ user }) => {
        setProfile(user);
        const roleKey = user.role === 'employee' ? `employee:${user.staffRole || 'branch_manager'}` : user.role;
        const savedRole = sessionStorage.getItem('loarn_dashboard_role');
        const savedSection = savedRole === roleKey ? sessionStorage.getItem('loarn_dashboard_section') : null;
        setSection(savedSection || defaultDashboardSection(user));
        window.location.hash = `dashboard/${user.role}`;
      })
      .catch(() => handleLogout());

    loadProfile();
    const refreshTimer = window.setInterval(loadProfile, 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [token]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    const loadUsers = () => getUsers(token, userQuery)
      .then(({ users: loadedUsers, pagination: loadedPagination }) => {
        setUsers(loadedUsers);
        setPagination(loadedPagination);
      })
      .catch(showError);

    loadUsers();
    const refreshTimer = window.setInterval(loadUsers, 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [token, isAdmin, userQuery]);

  useEffect(() => {
    if (!token || !profile) return;
    const loadBanks = profile.role === 'admin' ? getBanks(token) : profile.role === 'employee' ? getAssignedBank(token) : getAvailableBanks(token);
    loadBanks.then(({ banks: loadedBanks }) => setBanks(loadedBanks)).catch(showError);
  }, [token, profile]);

  useEffect(() => {
    if (!profile) return;
    const roleKey = profile.role === 'employee' ? `employee:${profile.staffRole || 'branch_manager'}` : profile.role;
    sessionStorage.setItem('loarn_dashboard_role', roleKey);
    sessionStorage.setItem('loarn_dashboard_section', section);
  }, [profile?.role, profile?.staffRole, section]);

  useEffect(() => {
    if (!token || !profile) return;
    getLoans(token).then(({ loans, systemAnnualInterestRate: rate }) => {
      setLoanApplications(loans);
      if (Number.isFinite(rate)) setSystemAnnualInterestRate(rate);
    }).catch(showError);
  }, [token, profile?.role, profile?.staffRole]);

  const showError = (error) => setNotice({ type: 'error', text: error.message });
  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setNotice({ type: '', text: '' });
    try {
      const result = await login({ email: form.email, password: form.password });
      localStorage.setItem('loarn_token', result.token);
      setToken(result.token);
      setNotice({ type: '', text: '' });
      recordActivity('Signed in successfully.');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(otp);
      setView('login');
      setNotice({ type: 'success', text: 'Email verified. You can sign in now.' });
      recordActivity('Email address verified.');
      setOtp('');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const { user } = await updateProfile(token, { name: form.name, email: form.email, ...(form.password ? { password: form.password } : {}) });
      setProfile(user);
      setForm({ name: user.name, email: user.email, password: '' });
      setNotice({ type: 'success', text: 'Profile changes saved.' });
      recordActivity('Profile details updated.');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateUser(userId) {
    try {
      await activateUser(token, userId);
      setUserQuery({ ...userQuery });
      setNotice({ type: 'success', text: 'User account activated.' });
      recordActivity('A user account was activated.');
    } catch (error) {
      showError(error);
    }
  }

  async function handleRoleUpdate(userId, updates) {
    try {
      await updateUser(token, userId, updates);
      setUserQuery((query) => ({ ...query }));
      setNotice({ type: 'success', text: 'User role updated.' });
      recordActivity('A user role or bank assignment was updated.');
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  function handleUserCreated() {
    setUserQuery((query) => ({ ...query, page: 1 }));
  }

  async function handleBankCreated() {
    const { banks: loadedBanks } = await getBanks(token);
    setBanks(loadedBanks);
    return loadedBanks;
  }

  async function handleAvailableBanksRefresh() {
    try {
      const { banks: loadedBanks } = await getAvailableBanks(token);
      setBanks(loadedBanks);
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  async function refreshLoans() {
    const { loans, systemAnnualInterestRate: rate } = await getLoans(token);
    setLoanApplications(loans);
    if (Number.isFinite(rate)) setSystemAnnualInterestRate(rate);
  }

  async function handleLoanApplication(application) {
    try {
      await createLoan(token, application);
      await refreshLoans();
      setNotice({ type: 'success', text: 'Your loan request was sent to the selected branch for review.' });
      recordActivity('A new loan application was submitted.');
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  async function handleLoanDecision(applicationId, status) {
    try {
      await decideLoan(token, applicationId, {
        status,
        ...(status === 'approved' ? { annualInterestRate: systemAnnualInterestRate } : {})
      });
      await refreshLoans();
      setNotice({ type: 'success', text: `Loan application ${status}.` });
      recordActivity(`A loan application was ${status}.`);
    } catch (error) {
      showError(error);
    }
  }

  async function handleLoanRepayment(loanId, payment) {
    try {
      const result = await recordLoanRepayment(token, loanId, payment);
      await refreshLoans();
      setNotice({ type: 'success', text: `Customer repayment recorded. Receipt ${result.receiptNumber}.` });
      recordActivity('A loan repayment was recorded.');
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  async function handleVirtualLoanPayment(loanId, payment) {
    let result;
    try {
      result = await payLoanWithVirtualSimulator(token, loanId, payment);
      setNotice({ type: 'success', text: `${result.payment.receiptNumber} was issued. This is a virtual simulation only; no real funds moved.` });
      recordActivity('A virtual loan repayment was simulated.');
    } catch (error) {
      showError(error);
      return { status: 'error', message: error.message };
    }
    try {
      await refreshLoans();
    } catch (error) {
      showError(error);
    }
    return result.payment;
  }

  async function handleAccountLoanPayment(loanId, payment) {
    let result;
    try {
      result = await payLoanFromAccount(token, loanId, payment);
      setNotice({ type: 'success', text: `${result.payment.receiptNumber} was issued. Your bank account was debited.` });
      recordActivity('A loan repayment was debited from a customer bank account.');
    } catch (error) {
      showError(error);
      return { status: 'error', message: error.message };
    }
    try {
      await refreshLoans();
    } catch (error) {
      showError(error);
    }
    return result.payment;
  }

  async function handleLoanDefault(loanId) {
    try {
      await markLoanDefaulted(token, loanId);
      await refreshLoans();
      setNotice({ type: 'success', text: 'Loan marked as defaulted.' });
      recordActivity('A loan was marked as defaulted.');
    } catch (error) {
      showError(error);
    }
  }

  function handleLogout() {
    localStorage.removeItem('loarn_token');
    setToken(null);
    setProfile(null);
    setUsers([]);
    setBanks([]);
    setLoanApplications([]);
    sessionStorage.removeItem('loarn_dashboard_role');
    sessionStorage.removeItem('loarn_dashboard_section');
    setSection('overview');
    setView('login');
    setForm(initialForm);
    setOtp('');
    window.location.hash = '';
  }

  if (token && profile) {
    return <Dashboard profile={profile} users={users} banks={banks} token={token} pagination={pagination} userQuery={userQuery} setUserQuery={setUserQuery} onActivateUser={handleActivateUser} onRoleUpdate={handleRoleUpdate} onUserCreated={handleUserCreated} onBankCreated={handleBankCreated} onRefreshBanks={handleAvailableBanksRefresh} section={section} setSection={setSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} form={form} loading={loading} notice={notice} setNotice={setNotice} activityItems={activityItems} setActivityItems={setActivityItems} onActivity={recordActivity} setForm={setForm} onSave={handleProfileSave} onLogout={handleLogout} loanApplications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} onLoanApplication={handleLoanApplication} onLoanDecision={handleLoanDecision} onLoanRepayment={handleLoanRepayment} onVirtualLoanPayment={handleVirtualLoanPayment} onAccountLoanPayment={handleAccountLoanPayment} onLoanDefault={handleLoanDefault} />;
  }

  if (view === 'guest') {
    return <GuestDashboard onBack={() => { setView('login'); setNotice({ type: '', text: '' }); }} />;
  }

  return (
    <main className="auth-shell">
      <div className="stars" />
      <div className="mountains mountain-back" />
      <div className="mountains mountain-front" />
      <section className="auth-layout">
        <div className="brand-copy">
          <div className="brand-mark"><img className="brand-logo" src="/e-banking-payment.svg" alt="E-banking payment" /><span>LOAN</span></div>
          <h1>Financial tools<br />built for <em>growth.</em></h1>
          <p>Manage your accounts, track loan applications, and make secure payments in one place.</p>
          <div className="trust-line"><ShieldCheck size={17} /> Secure account access</div>
        </div>
        <section className="auth-card">
          {view === 'otp'
            ? <OtpForm otp={otp} setOtp={setOtp} email={form.email} loading={loading} notice={notice} onSubmit={handleVerify} onResend={async () => { setLoading(true); try { await resendOtp(form.email); setNotice({ type: 'success', text: 'A new verification code has been sent.' }); } catch (error) { showError(error); } finally { setLoading(false); } }} onBack={() => setView('login')} />
            : view === 'reset'
              ? <PasswordResetForm initialEmail={form.email} onRequest={async (email) => {
                setLoading(true);
                try {
                  const result = await requestPasswordReset(email);
                  setNotice({ type: 'success', text: result.message });
                  return true;
                } catch (error) {
                  showError(error);
                  return false;
                } finally {
                  setLoading(false);
                }
              }} onConfirm={async (email, resetOtp, newPassword) => {
                setLoading(true);
                try {
                  const result = await confirmPasswordReset({ email, otp: resetOtp, newPassword });
                  setView('login');
                  setNotice({ type: 'success', text: result.message });
                  return true;
                } catch (error) {
                  showError(error);
                  return false;
                } finally {
                  setLoading(false);
                }
              }} loading={loading} notice={notice} onBack={() => { setNotice({ type: '', text: '' }); setView('login'); }} />
              : <AuthForm form={form} loading={loading} notice={notice} onChange={updateField} onSubmit={handleSubmit} onVerify={() => setView('otp')} onForgot={() => { setNotice({ type: '', text: '' }); setView('reset'); }} onGuest={() => { setNotice({ type: '', text: '' }); setView('guest'); }} />}
        </section>
      </section>
    </main>
  );
}

function AuthForm({ form, loading, notice, onChange, onSubmit, onVerify, onForgot, onGuest }) {
  return <>
    <div className="card-heading"><span className="eyebrow">ACCOUNT PORTAL</span><h2>Welcome back</h2><p>Sign in to continue your journey.</p></div>
    <form onSubmit={onSubmit} className="form-stack">
      <Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email} onChange={onChange} />
      <Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="Password (8+ characters)" value={form.password} onChange={onChange} minLength={8} />
      {notice.text && <Notice notice={notice} />}
      <button className="primary-button" disabled={loading}>{loading ? 'Working...' : 'Sign in'} <ArrowRight size={17} /></button>
    </form>
    <div className="card-footer">Need a member account? Contact your Bank Admin.</div>
    <button className="quiet-button" type="button" onClick={onForgot}>Forgot password?</button>
    <button className="quiet-button" type="button" onClick={onGuest}>Continue as Guest · View demo & send feedback</button>
  </>;
}

function PasswordResetForm({ initialEmail, onRequest, onConfirm, loading, notice, onBack }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [requested, setRequested] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    if (await onRequest(email)) setRequested(true);
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (await onConfirm(email, otp, password)) {
      setOtp('');
      setPassword('');
    }
  }

  return <>
    <div className="card-heading"><span className="eyebrow">ACCOUNT RECOVERY</span><h2>Reset your password</h2><p>We will send a one-time code to your verified email address.</p></div>
    {!requested ? <form onSubmit={requestCode} className="form-stack">
      <Field icon={<AtSign size={17} />} name="reset-email" type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} />
      {notice.text && <Notice notice={notice} />}
      <button className="primary-button" disabled={loading}>{loading ? 'Sending...' : 'Send reset code'} <ArrowRight size={17} /></button>
    </form> : <form onSubmit={resetPassword} className="form-stack">
      <p className="form-disclaimer">If the verified account exists, a reset code will be sent to {email}.</p>
      <label>Email reset code<input className="bank-text-input" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required /></label>
      <label>New password<input className="bank-text-input" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {notice.text && <Notice notice={notice} />}
      <button className="primary-button" disabled={loading}>{loading ? 'Resetting...' : 'Reset password'} <ArrowRight size={17} /></button>
    </form>}
    <button className="quiet-button" type="button" disabled={loading} onClick={onBack}>Back to sign in</button>
  </>;
}

function OtpForm({ otp, setOtp, email, loading, notice, onSubmit, onResend, onBack }) {
  return <>
    <div className="otp-icon"><Check size={22} /></div><div className="card-heading"><span className="eyebrow">EMAIL VERIFICATION</span><h2>Enter your code</h2><p>Use the 6-digit code sent to your email.</p></div>
    <form onSubmit={onSubmit} className="form-stack"><input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>{loading ? 'Verifying...' : 'Verify email'} <ArrowRight size={17} /></button></form><button className="quiet-button" disabled={loading || !email} onClick={onResend}>Resend code</button><button className="quiet-button" onClick={onBack}>Back to sign in</button>
  </>;
}

function GuestDashboard({ onBack }) {
  const [form, setForm] = useState({ category: 'general', rating: '5', message: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [previewSection, setPreviewSection] = useState('overview');
  const months = recentMonths().map((month, index) => ({ label: month.label, value: [24, 31, 28, 36, 42, 48][index] }));
  const loanTypes = [
    { label: 'Personal', value: 42 },
    { label: 'Salary', value: 57 },
    { label: 'Business', value: 34 },
    { label: 'Home', value: 19 },
    { label: 'Education', value: 14 }
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      await submitGuestFeedback({ ...form, rating: Number(form.rating) });
      setForm({ category: 'general', rating: '5', message: '' });
      setNotice({ type: 'success', text: 'Thank you. Your feedback was submitted anonymously.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="guest-dashboard-shell">
    <header className="guest-dashboard-header"><div><div className="brand-mark"><img className="brand-logo" src="/e-banking-payment.svg" alt="" /><span>LOAN</span></div><div><span className="eyebrow">PUBLIC DEMO · SAMPLE DATA</span><h1>Bank Loan Management</h1><p>This preview uses fictional data only. It does not show real customer or bank records.</p></div></div><button className="quiet-button" type="button" onClick={onBack}>Back to sign in</button></header>
    <section className="guest-dashboard-content">
      <section className="panel guest-read-only-panel"><PanelHeading eyebrow="EXPLORE THE SYSTEM" title="Read-only feature preview" icon={<LayoutDashboard size={22} />} /><p>Browse fictional examples of the system’s main workspaces. Guest mode cannot access or change real records, submit payments, or manage accounts.</p><nav className="guest-feature-tabs" aria-label="Demo feature pages">{[['overview', 'Overview'], ['loans', 'Loans'], ['accounts', 'Accounts'], ['payments', 'Payments'], ['people', 'HR & attendance'], ['payroll', 'Finance & payroll'], ['reports', 'Reports'], ['administration', 'Administration']].map(([key, label]) => <button key={key} type="button" className={previewSection === key ? 'active' : ''} aria-pressed={previewSection === key} onClick={() => setPreviewSection(key)}>{label}</button>)}</nav><GuestReadOnlyFeatures section={previewSection} /></section>
      <ReportCards items={[
        { label: 'Sample loan requests', value: '1,248', detail: 'Fictional demo metric' },
        { label: 'Sample disbursements', value: 'RWF 840M', detail: 'Fictional demo metric' },
        { label: 'Sample active borrowers', value: '892', detail: 'Fictional demo metric' },
        { label: 'Sample approval rate', value: '68%', detail: 'Fictional demo metric' }
      ]} />
      <div className="financial-chart-grid">
        <ReportLineChart title="Demo loan applications" subtitle="Illustrative monthly trend · sample figures" values={months} />
        <ReportBarChart title="Demo applications by loan category" subtitle="Illustrative counts · sample figures" values={loanTypes} />
      </div>
      <section className="panel guest-feedback-panel"><PanelHeading eyebrow="HELP US IMPROVE" title="Share feedback" icon={<MessageSquareText size={22} />} /><p>Your feedback is stored without your name or email. Please do not include sensitive account or identity details.</p><form className="bank-form" onSubmit={handleSubmit}>
        <label htmlFor="guest-feedback-category">What is your feedback about?</label><select className="bank-text-input" id="guest-feedback-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="general">General</option><option value="dashboard">Dashboard</option><option value="loan-process">Loan process</option><option value="payments">Payments</option><option value="accessibility">Accessibility</option></select>
        <label htmlFor="guest-feedback-rating">Rating</label><select className="bank-text-input" id="guest-feedback-rating" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })}><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Fair</option><option value="2">2 — Needs improvement</option><option value="1">1 — Poor</option></select>
        <label htmlFor="guest-feedback-message">Your feedback</label><textarea className="bank-text-input guest-feedback-message" id="guest-feedback-message" minLength={10} maxLength={2000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us what worked or what should improve…" required />
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={submitting}>{submitting ? 'Sending feedback…' : 'Submit feedback'}</button>
      </form><small>Feedback is limited to five submissions per network address every 15 minutes.</small></section>
    </section>
  </main>;
}

function GuestReadOnlyFeatures({ section }) {
  const examples = {
    overview: {
      title: 'Role-based dashboards',
      description: 'Customers, Bank Admins, sub-branch managers, HR, finance, and system administrators see different scoped workspaces.',
      headers: ['Workspace', 'Example view', 'Access'],
      rows: [['Customer', 'Loan status and owned accounts', 'Own records'], ['Bank Admin', 'Bank-wide staff and loan reports', 'Assigned bank'], ['HR Manager', 'Staff directory and attendance', 'Assigned bank']]
    },
    loans: {
      title: 'Loan lifecycle',
      description: 'Applications move through review, approval or decline, disbursement, repayment, and closure.',
      headers: ['Fictional applicant', 'Loan type', 'Status'],
      rows: [['Demo Applicant A', 'Salary loan · RWF 600,000', 'Under review'], ['Demo Applicant B', 'Education loan · RWF 1,200,000', 'Approved'], ['Demo Applicant C', 'Business loan · RWF 2,000,000', 'Repaid']]
    },
    accounts: {
      title: 'Bank accounts and members',
      description: 'Customers view their accounts and activity; bank staff review scoped accounts, members, and sub-branches.',
      headers: ['Fictional record', 'Workspace', 'Access example'],
      rows: [['•••• •••• 1001', 'Customer account', 'Owner only'], ['Demo Member A', 'Sub-branch member list', 'Assigned staff'], ['Demo Sub-branch', 'Branch directory', 'Assigned bank']]
    },
    payments: {
      title: 'Deposits, transfers, and loan repayments',
      description: 'Customers can review payment history and pay approved loans. Guest mode never executes or simulates a payment.',
      headers: ['Fictional payment', 'Channel', 'Example status'],
      rows: [['Demo deposit', 'Mobile money', 'Confirmed example'], ['Demo transfer', 'Bank account', 'Completed example'], ['Demo loan payment', 'Own account', 'Receipt example']]
    },
    people: {
      title: 'HR and attendance',
      description: 'HR reviews staff status and bank-scoped attendance. Employees may capture a selfie with consent; photos are stored in authenticated Cloudinary storage.',
      headers: ['Fictional employee', 'Role', 'Attendance'],
      rows: [['Demo Employee A', 'Sub-branch Manager', 'Present · 08:04'], ['Demo Employee B', 'HR Manager', 'Present · 08:11'], ['Demo Employee C', 'Finance Manager', 'Not recorded']]
    },
    payroll: {
      title: 'Finance and payroll',
      description: 'Finance staff review bank-scoped employee rosters, payroll batches, and processing summaries.',
      headers: ['Fictional batch', 'Employees', 'Example status'],
      rows: [['DEMO-PAY-001', '24', 'Processed'], ['DEMO-PAY-002', '18', 'Awaiting review'], ['DEMO-PAY-003', '12', 'Draft']]
    },
    reports: {
      title: 'Reports and pagination',
      description: 'Dashboards summarize loan performance, account activity, employee headcount, attendance, and operational reports.',
      headers: ['Fictional report', 'Example metric', 'Scope'],
      rows: [['Loan portfolio', 'RWF 840M disbursed', 'Assigned bank'], ['Attendance', '82% checked in today', 'Assigned bank'], ['Loan performance', '68% approval rate', 'Demo figures']]
    },
    administration: {
      title: 'Administration and access controls',
      description: 'System Admins provision Bank Admins; Bank Admins manage staff and branches. Guest mode provides no administrative actions.',
      headers: ['Fictional control', 'Owner', 'Guest access'],
      rows: [['Create Bank Admin', 'System Admin', 'View only'], ['Assign Sub-branch Manager', 'Bank Admin', 'View only'], ['Activate staff account', 'Bank Admin', 'View only']]
    }
  };
  const page = examples[section] || examples.overview;
  return <div className="guest-feature-preview"><h3>{page.title}</h3><p>{page.description}</p><div className="user-table-wrap"><table className="user-table"><thead><tr>{page.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{page.rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><small>Fictional demonstration data · no actions available</small></div>;
}

function Field({ icon, ...props }) { return <label className="field"><span>{icon}</span><input {...props} required /></label>; }
function Notice({ notice }) {
  return <div className={`notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-live={notice.type === 'error' ? 'assertive' : 'polite'}>
    <span>{notice.text}</span>
  </div>;
}

function Dashboard({ profile, users, banks, token, pagination, userQuery, setUserQuery, onActivateUser, onRoleUpdate, onUserCreated, onBankCreated, onRefreshBanks, section, setSection, sidebarOpen, setSidebarOpen, form, loading, notice, setNotice, activityItems, setActivityItems, onActivity, setForm, onSave, onLogout, loanApplications, systemAnnualInterestRate, onLoanApplication, onLoanDecision, onLoanRepayment, onVirtualLoanPayment, onAccountLoanPayment, onLoanDefault }) {
  const firstName = profile.name?.split(' ')[0] || 'there';
  const manager = profile.role === 'employee';
  const staffRole = profile.staffRole || 'branch_manager';
  const staffRoleLabel = BANK_STAFF_ROLES.find((role) => role.value === staffRole)?.label
    || (staffRole === 'bank_admin' ? 'Bank Admin' : staffRole === 'branch_manager' ? 'Sub-branch Manager' : profile.role);
  useEffect(() => {
    if (profile.role === 'user' && section !== 'overview' && section !== 'profile') {
      document.getElementById(`customer-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [profile.role, section]);
  const bankView = profile.role === 'user' || manager || (profile.role === 'admin' && ['deposits', 'applications', 'banks'].includes(section));
  return <main className={`dashboard-shell ${bankView ? 'bank-shell' : ''}`}>
    <Sidebar profile={profile} staffRole={staffRole} section={section} setSection={setSection} open={sidebarOpen} setOpen={setSidebarOpen} onLogout={onLogout} /><div className="dashboard-main"><header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} title="Open navigation"><Menu size={20} /></button><div className="topbar-actions"><div className="topbar-user"><span>{profile.email}</span><button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div><NotificationCenter items={activityItems} setItems={setActivityItems} /></div></header>{notice.type === 'error' && notice.text && <div className="system-error" role="alert">{notice.text}</div>}
    <section className={`dashboard-content ${bankView ? 'bank-dashboard' : ''}`}><div className="welcome-row"><div><span className="eyebrow">{manager ? staffRoleLabel.toUpperCase() : profile.role.toUpperCase()} WORKSPACE</span><h1>Welcome, <em>{firstName}</em> <span className="wave">✦</span></h1></div><div className="role-pill"><ShieldCheck size={15} /> {manager ? staffRoleLabel : profile.role}</div></div>
      {profile.role === 'admin' && ['overview', 'users'].includes(section) && <AdminCreateBankAdmin banks={banks} onCreated={onUserCreated} onActivity={onActivity} />}
      {profile.role === 'admin' && !['deposits', 'applications', 'banks', 'feedback'].includes(section) && <AdminDashboard users={users} pagination={pagination} query={userQuery} setQuery={setUserQuery} onActivateUser={onActivateUser} onRoleUpdate={onRoleUpdate} onUserCreated={onUserCreated} section={section} />}
      {profile.role === 'admin' && section === 'users' && <AdminEmployeeAccess users={users} banks={banks} currentUserId={profile._id} onRoleUpdate={onRoleUpdate} />}
      {profile.role === 'admin' && section === 'deposits' && <AdminDepositDashboard token={token} banks={banks} onActivity={onActivity} />}
      {profile.role === 'admin' && section === 'applications' && <ManagerDashboard applications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} section={section} notice={notice} onDecision={onLoanDecision} onRepayment={onLoanRepayment} onDefault={onLoanDefault} />}
      {profile.role === 'admin' && section === 'banks' && <AdminBankDashboard banks={banks} loanApplications={loanApplications} token={token} onCreated={onBankCreated} onActivity={onActivity} />}
      {profile.role === 'admin' && section === 'feedback' && <GuestFeedbackDashboard token={token} />}
      {manager && ['bank_admin', 'branch_manager'].includes(staffRole) && section === 'members' && <BankMembersDashboard token={token} banks={banks} staffRole={staffRole} onActivity={onActivity} />}
      {manager && staffRole === 'bank_admin' && section === 'staff' && <BankStaffAdminDashboard token={token} banks={banks} onActivity={onActivity} />}
      {manager && staffRole === 'bank_admin' && section === 'overview' && <BankAdminReportDashboard banks={banks} token={token} loanApplications={loanApplications} />}
      {manager && staffRole === 'hr_manager' && section === 'hr-dashboard' && <HRDashboard token={token} />}
      {manager && section === 'attendance' && <EmployeeAttendanceDashboard token={token} profile={profile} />}
      {manager && section === 'my-loans' && <EmployeeLoanDashboard profile={profile} applications={loanApplications} token={token} onVirtualLoanPayment={onVirtualLoanPayment} onAccountLoanPayment={onAccountLoanPayment} />}
      {manager && staffRole === 'finance_manager' && section === 'directory' && <BankStaffDirectoryDashboard token={token} />}
      {manager && staffRole === 'general_manager' && section === 'overview' && <GeneralManagerDashboard banks={banks} token={token} loanApplications={loanApplications} />}
      {manager && staffRole === 'finance_manager' && section === 'payroll' && <FinancePayrollDashboard banks={banks} token={token} onActivity={onActivity} />}
      {manager && ['bank_admin', 'branch_manager', 'accounts_manager'].includes(staffRole) && section === 'ledger' && <BankStaffDashboard banks={banks} token={token} profile={profile} canManageAccounts={staffRole === 'accounts_manager'} onActivity={onActivity} />}
      {manager && ['bank_admin', 'branch_manager'].includes(staffRole) && section === 'applications' && <ManagerDashboard applications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} section={section} notice={notice} onDecision={onLoanDecision} onRepayment={onLoanRepayment} onDefault={onLoanDefault} />}
      {manager && staffRole === 'general_manager' && section === 'applications' && <ManagerDashboard applications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} section={section} notice={{ type: '', text: '' }} readOnly onDecision={onLoanDecision} onRepayment={onLoanRepayment} onDefault={onLoanDefault} />}
        {profile.role === 'user' && section !== 'profile' && <UserDashboard profile={profile} banks={banks} token={token} systemAnnualInterestRate={systemAnnualInterestRate} onRefreshBanks={onRefreshBanks} applications={loanApplications.filter((application) => application.applicant === profile._id || application.applicant?._id === profile._id)} notice={notice} setNotice={setNotice} onLoanApplication={onLoanApplication} onVirtualLoanPayment={onVirtualLoanPayment} onAccountLoanPayment={onAccountLoanPayment} onActivity={onActivity} />}
      {section === 'profile' && <ProfileDashboard profile={profile} form={form} loading={loading} notice={notice} setForm={setForm} onSave={onSave} />}
    </section></div>
  </main>;
}

function NotificationCenter({ items, setItems }) {
  const [open, setOpen] = useState(false);
  const unreadCount = items.filter((item) => !item.read).length;

  function viewAll() {
    setOpen((currentlyOpen) => !currentlyOpen);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  }

  return <div className="notification-center">
    <button className="notification-trigger" type="button" aria-expanded={open} onClick={viewAll}>
      <Bell size={20} aria-hidden="true" />
      <span>View all</span>
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="System activity">
      <header><strong>System activity</strong><button type="button" onClick={() => setOpen(false)}>Close</button></header>
      {items.length ? <ul>{items.map((item) => <li key={item.id}><span className={`activity-dot ${item.read ? '' : 'unread'}`} /><div><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div></li>)}</ul> : <p className="notification-empty">No activity has been recorded yet.</p>}
    </section>}
  </div>;
}

function AdminCreateBankAdmin({ banks, onCreated, onActivity }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', bankId: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      await createBankAdmin(localStorage.getItem('loarn_token'), form);
      setForm({ name: '', email: '', password: '', bankId: '' });
      setNotice({ type: 'success', text: 'Bank Admin account created. A verification code was sent to the user.' });
      onActivity('A Bank Admin account was registered.');
      onCreated();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="panel create-user-panel"><PanelHeading eyebrow="ADMIN DIRECTORY" title="Register Bank Admin" icon={<UserPlus size={22} />} /><form className="create-user-form" onSubmit={handleSubmit}><label className="create-user-field">Full name<input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="create-user-field">Email address<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="create-user-field">Temporary password<input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label className="create-user-field">Bank<select value={form.bankId} onChange={(event) => setForm({ ...form, bankId: event.target.value })} required><option value="">Select a bank</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}{bank.accountNumber ? ` · ${bank.accountNumber}` : ''}</option>)}</select></label><button className="create-user-submit" type="submit" disabled={submitting || !banks.length || !form.bankId}><UserPlus size={16} /> {submitting ? 'Registering...' : 'Register Bank Admin'}</button></form>{notice.text && <div className="create-user-notice"><Notice notice={notice} /></div>}<p className="create-user-help">Bank Admins are assigned to the entire bank. They create and assign Sub-branch Managers.</p></section>;
}

function AdminEmployeeAccess({ users, banks, currentUserId, onRoleUpdate }) {
  const eligibleUsers = users.filter((user) => user.isVerified);
  return <section className="panel employee-access-panel"><PanelHeading eyebrow="STAFF ACCESS" title="User roles and bank assignments" icon={<UsersRound size={22} />} /><p>Create or assign Bank Admins to a whole bank; Bank Admins create and assign Sub-branch Managers and other employees to individual branches.</p>{eligibleUsers.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>User</th><th>Role</th><th>Bank and sub-branch</th><th>Assignment</th></tr></thead><tbody>{eligibleUsers.map((user) => <EmployeeAccessRow key={user._id} user={user} banks={banks} currentUserId={currentUserId} onRoleUpdate={onRoleUpdate} />)}</tbody></table></div> : <p className="empty-state">No verified user accounts are available.</p>}</section>;
}

function EmployeeAccessRow({ user, banks, currentUserId, onRoleUpdate }) {
  const [role, setRole] = useState(user.role);
  const [staffRole, setStaffRole] = useState(user.staffRole || 'branch_manager');
  const [bankId, setBankId] = useState(user.bankId || '');
  const [branchId, setBranchId] = useState(user.branchId || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedBank = banks.find((bank) => bank._id === bankId);

  useEffect(() => {
    setRole(user.role);
    setStaffRole(user.staffRole || 'branch_manager');
    setBankId(user.bankId || '');
    setBranchId(user.branchId || '');
  }, [user]);

  async function saveRole(nextRole) {
    setSaving(true);
    setMessage('');
    const updates = nextRole === 'employee'
      ? { role: nextRole }
      : { role: nextRole, bankId: null, branchId: null };
    const saved = await onRoleUpdate(user._id, updates);
    if (saved) {
      setRole(nextRole);
      if (nextRole === 'employee') setStaffRole('bank_admin');
      if (nextRole === 'user') {
        setBankId('');
        setBranchId('');
      }
      setMessage('Saved');
    } else {
      setMessage('Could not save');
    }
    setSaving(false);
  }

  async function saveAssignment(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const assignmentBranchId = staffRole === 'bank_admin' ? null : branchId;
    const saved = await onRoleUpdate(user._id, { role: 'employee', staffRole, bankId, branchId: assignmentBranchId });
    setMessage(saved ? 'Assignment saved' : 'Could not save');
    setSaving(false);
  }

  return <tr><td><strong>{user.name}</strong><br /><small>{user.email}</small></td><td><select value={role} onChange={(event) => saveRole(event.target.value)} disabled={saving || user._id === currentUserId} aria-label={`Access role for ${user.name}`}><option value="user">Bank member</option><option value="employee">Bank employee</option><option value="admin">Administrator</option></select>{role === 'employee' && <select value={staffRole} onChange={(event) => { setStaffRole(event.target.value); if (event.target.value === 'bank_admin') setBranchId(''); }} disabled={saving} aria-label={`Staff role for ${user.name}`}><option value="bank_admin">Bank Admin</option>{BANK_STAFF_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</td><td>{role === 'employee' ? <div className="employee-assignment-form"><select value={bankId} onChange={(event) => { setBankId(event.target.value); setBranchId(''); }} required disabled={saving}><option value="">Select bank</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select>{staffRole !== 'bank_admin' && <select value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={saving || !selectedBank?.branches.length}><option value="">Select sub-branch</option>{selectedBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select>}{staffRole === 'bank_admin' && <span>All sub-branches</span>}</div> : 'Not assigned'}</td><td>{role === 'employee' ? <button className="manage-button" type="button" onClick={saveAssignment} disabled={saving || !bankId || (staffRole !== 'bank_admin' && !branchId)}>{saving ? 'Saving...' : 'Assign'}</button> : role === 'admin' ? 'Administrator access' : 'Bank member access'}{message && <small className="employee-access-message">{message}</small>}</td></tr>;
}

function Sidebar({ profile, staffRole, section, setSection, open, setOpen, onLogout }) {
  const go = (next) => { setSection(next); setOpen(false); };
  const navigation = profile.role === 'employee'
    ? [{ section: 'attendance', label: 'My attendance', icon: CalendarCheck }, { section: 'my-loans', label: 'My loans', icon: HandCoins }]
    : [{ section: 'overview', label: 'Dashboard', icon: LayoutDashboard }];
  if (profile.role === 'user') navigation.push(
    { section: 'deposit', label: 'Make a deposit', icon: ArrowDownToLine },
    { section: 'loan-application', label: 'Apply for a loan', icon: HandCoins },
    { section: 'activity', label: 'Account activity', icon: Wallet },
    { section: 'applications', label: 'Loan requests', icon: Clock3 }
  );
  if (profile.role === 'employee' && staffRole === 'bank_admin') navigation.push(
    { section: 'overview', label: 'Bank report', icon: LayoutDashboard },
    { section: 'members', label: 'Customer members', icon: UsersRound },
    { section: 'staff', label: 'Staff and sub-branch managers', icon: UsersRound },
    { section: 'ledger', label: 'Bank account ledger', icon: Building2 },
    { section: 'applications', label: 'Loan applications', icon: HandCoins }
  );
  if (profile.role === 'employee' && staffRole === 'branch_manager') navigation.push(
    { section: 'members', label: 'Bank members', icon: UsersRound },
    { section: 'ledger', label: 'Sub-branch account ledger', icon: Building2 },
    { section: 'applications', label: 'Loan applications', icon: HandCoins }
  );
  if (profile.role === 'employee' && staffRole === 'general_manager') navigation.push(
    { section: 'overview', label: 'Bank overview', icon: LayoutDashboard },
    { section: 'applications', label: 'Loan reports', icon: HandCoins }
  );
  if (profile.role === 'employee' && staffRole === 'hr_manager') navigation.push(
    { section: 'hr-dashboard', label: 'HR dashboard', icon: UsersRound }
  );
  if (profile.role === 'employee' && staffRole === 'finance_manager') navigation.push(
    { section: 'directory', label: 'Bank-wide directory', icon: UsersRound },
    { section: 'payroll', label: 'Finance payroll', icon: Wallet }
  );
  if (profile.role === 'employee' && staffRole === 'accounts_manager') navigation.push(
    { section: 'ledger', label: 'Bank account ledger', icon: Building2 }
  );
  if (profile.role === 'admin') navigation.push(
    { section: 'deposits', label: 'Bank account ledger & deposits', icon: ArrowDownToLine },
    { section: 'applications', label: 'Loan applications', icon: HandCoins },
    { section: 'banks', label: 'Bank branches', icon: Building2 }
  );
  navigation.push({ section: 'profile', label: 'My profile', icon: UserRound });
  if (profile.role === 'admin') navigation.push(
    { section: 'users', label: 'User directory', icon: UsersRound },
    { section: 'feedback', label: 'Guest feedback', icon: MessageSquareText }
  );

  return <aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark"><img className="brand-logo" src="/e-banking-payment.svg" alt="" /><span>LOAN</span></div><button className="icon-button close-sidebar" onClick={() => setOpen(false)} title="Close navigation"><X size={18} /></button></div><div className="sidebar-label">MENU</div>{navigation.map(({ section: target, label, icon: Icon }) => <button key={target} className={`nav-item ${section === target ? 'active' : ''}`} onClick={() => go(target)}><Icon size={17} /> {label}</button>)}<div className="sidebar-spacer" /><button className="nav-item logout-item" onClick={onLogout}><LogOut size={17} /> Sign out</button></aside>;
}

function ManagementModal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={dialogRef} className="management-modal" aria-label={title} onClose={onClose} onCancel={onClose} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}>
    <header className="management-modal-header"><h2>{title}</h2><button className="icon-button" type="button" title="Close dialog" onClick={onClose}><X size={18} /></button></header>
    <div className="management-modal-content">{children}</div>
  </dialog>;
}

function AdminBankDashboard({ banks, loanApplications, token, onCreated, onActivity }) {
  const [form, setForm] = useState(emptyBankForm());
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [bankStaff, setBankStaff] = useState([]);
  const [bankStaffLoading, setBankStaffLoading] = useState(false);
  const [bankStaffError, setBankStaffError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [bankPage, setBankPage] = useState(1);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const searchableBanks = banks.filter((bank) => {
    const query = bankSearch.trim().toLowerCase();
    if (!query) return true;
    const branchSearch = bank.branches.some((branch) => [
      branch.branchName,
      branch.branchCode,
      branch.branchManager,
      branch.location.province,
      branch.location.district,
      branch.location.sector,
      branch.location.cell,
      branch.location.village
    ].some((value) => String(value || '').toLowerCase().includes(query)));
    return [
      bank.bankName,
      bank.accountNumber,
      bank.leadership.generalManager,
      bank.leadership.hrManager,
      bank.leadership.financeManager.name,
      bank.leadership.financeManager.email,
      bank.leadership.accountsManager,
      branchSearch ? 'branch-match' : ''
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  useEffect(() => {
    if (selectedBankId && !searchableBanks.some((bank) => bank._id === selectedBankId)) {
      setSelectedBankId('');
      setSelectedBranchId('');
    }
  }, [banks, selectedBankId, selectedBranchId, bankSearch]);

  const activeBank = searchableBanks.find((bank) => bank._id === selectedBankId) || null;
  const activeBranch = activeBank?.branches.find((branch) => branch._id === selectedBranchId) || activeBank?.branches[0] || null;
  const bankPageCount = Math.max(1, Math.ceil(searchableBanks.length / BANKS_PER_PAGE));
  const visibleBanks = searchableBanks.slice((bankPage - 1) * BANKS_PER_PAGE, bankPage * BANKS_PER_PAGE);

  useEffect(() => {
    if (!activeBank) {
      setBankStaff([]);
      setBankStaffError('');
      return undefined;
    }

    let current = true;
    setBankStaffLoading(true);
    setBankStaffError('');
    const loadStaff = async () => {
      const params = { bankId: activeBank._id, role: 'employee', limit: 100, sortBy: 'name', sortOrder: 'asc' };
      const firstPage = await getUsers(token, { ...params, page: 1 });
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, firstPage.pagination.totalPages - 1) }, (_, index) =>
          getUsers(token, { ...params, page: index + 2 }))
      );
      return [firstPage, ...remainingPages].flatMap((page) => page.users);
    };

    loadStaff()
      .then((staff) => { if (current) setBankStaff(staff); })
      .catch((error) => { if (current) setBankStaffError(error.message); })
      .finally(() => { if (current) setBankStaffLoading(false); });

    return () => { current = false; };
  }, [activeBank?._id, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const { bank: createdBank } = await createBank(token, form);
      const refreshedBanks = await onCreated();
      const savedBank = refreshedBanks?.find((bank) => bank._id === createdBank?._id)
        || refreshedBanks?.find((bank) => bank.bankName === form.bankName.trim())
        || createdBank;
      const accountNumber = /^\d{12}$/.test(String(savedBank?.accountNumber || '')) ? savedBank.accountNumber : null;
      if (!accountNumber) {
        setBankModalOpen(false);
        setNotice({ type: 'error', text: 'Bank was created, but the API did not return a valid 12-digit system account number. Check the bank list or run the bank identifier repair script.' });
        return;
      }
      setForm(emptyBankForm());
      setBankModalOpen(false);
      setNotice({ type: 'success', text: `Bank ${savedBank.bankName || form.bankName} registered. System account number: ${accountNumber}.` });
      onActivity(`Bank ${savedBank.bankName || form.bankName} was registered.`);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <div className="bank-management-actions">
      <button className="bank-button" type="button" onClick={() => { setNotice({ type: '', text: '' }); setBankModalOpen(true); }}><Building2 size={17} /> Create bank</button>
      <AddBranchForm banks={banks} token={token} onCreated={onCreated} onActivity={onActivity} />
    </div>
    {notice.text && <div className="bank-notice"><Notice notice={notice} /></div>}
    <ManagementModal open={bankModalOpen} onClose={() => setBankModalOpen(false)} title="Create a bank">
      <form className="bank-create-form" onSubmit={handleSubmit}>
        <label>Bank name<input value={form.bankName} onChange={(event) => setForm({ ...form, bankName: event.target.value })} required /></label>
        <div className="bank-form-section-title">Bank leadership</div>
        <label>General Manager / CEO<input value={form.leadership.generalManager} onChange={(event) => setForm({ ...form, leadership: { ...form.leadership, generalManager: event.target.value } })} required /></label>
        <label>Human Resources Manager<input value={form.leadership.hrManager} onChange={(event) => setForm({ ...form, leadership: { ...form.leadership, hrManager: event.target.value } })} required /></label>
        <label>Finance Manager<input value={form.leadership.financeManager.name} onChange={(event) => setForm({ ...form, leadership: { ...form.leadership, financeManager: { ...form.leadership.financeManager, name: event.target.value } } })} required /></label>
        <label>Finance Manager login email<input type="email" value={form.leadership.financeManager.email} onChange={(event) => setForm({ ...form, leadership: { ...form.leadership, financeManager: { ...form.leadership.financeManager, email: event.target.value } } })} required /></label>
        <label>Accounts Manager<input value={form.leadership.accountsManager} onChange={(event) => setForm({ ...form, leadership: { ...form.leadership, accountsManager: event.target.value } })} required /></label>
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={submitting}><Building2 size={17} /> {submitting ? 'Creating...' : 'Create bank'}</button>
      </form>
    </ManagementModal>
    <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK DIRECTORY</span><h2>Search banks and sub-branches</h2></div><Building2 size={22} /></div>
      <div className="bank-directory-search">
        <input value={bankSearch} onChange={(event) => { setBankSearch(event.target.value); setBankPage(1); }} placeholder="Search bank, account, branch, staff or location" />
      </div>
      {!banks.length ? <p className="empty-state">No banks have been created.</p> : (() => {
        if (!searchableBanks.length) return <p className="empty-state">No bank matches your search.</p>;
        return <>
          {!activeBank && <div className="bank-directory">
            {visibleBanks.map((bank) => <article className="bank-directory-item" key={bank._id}>
              <header>
                <div>
                  <span className="eyebrow">BANK</span>
                  <h3>{bank.bankName}</h3>
                </div>
                <button className="bank-button" type="button" onClick={() => {
                  setSelectedBankId(bank._id);
                  setSelectedBranchId(bank.branches[0]?._id || '');
                }}>Explore bank <ChevronRight size={15} /></button>
              </header>
              <div className="bank-account-summary">
                <div><small>Bank account number</small><strong>{bank.accountNumber}</strong></div>
                <div><small>Sub-branches</small><strong>{bank.branches.length}</strong></div>
              </div>
            </article>)}
          </div>}
          {!activeBank && bankPageCount > 1 && <div className="bank-pagination"><button className="icon-button" type="button" title="Previous bank page" disabled={bankPage <= 1} onClick={() => setBankPage((page) => page - 1)}><ChevronLeft size={16} /></button><span>Page {bankPage} of {bankPageCount} · {searchableBanks.length} banks</span><button className="icon-button" type="button" title="Next bank page" disabled={bankPage >= bankPageCount} onClick={() => setBankPage((page) => page + 1)}><ChevronRight size={16} /></button></div>}
          {activeBank && <div className="bank-directory-item bank-directory-focus">
            <button className="bank-back-button" type="button" onClick={() => { setSelectedBankId(''); setSelectedBranchId(''); }}><ChevronLeft size={16} /> All banks</button>
            <header>
              <div>
                <span className="eyebrow">BANK PROFILE</span>
                <h3>{activeBank.bankName}</h3>
              </div>
              <span>{activeBank.branches.length} {activeBank.branches.length === 1 ? 'sub-branch' : 'sub-branches'}</span>
            </header>
            <BankFinancialSummary title="Bank financials" summary={summarizeLoanFinances(loanApplications, activeBank._id)} />
            <div className="bank-account-summary">
              <div><small>Bank account number</small><strong>{activeBank.accountNumber}</strong></div>
              <div><small>Finance manager</small><strong>{activeBank.leadership.financeManager.name}</strong></div>
              <div><small>Manager email</small><strong>{activeBank.leadership.financeManager.email}</strong></div>
            </div>
            <div className="bank-leadership-heading">Leadership and departments</div>
            <div className="bank-leadership">{leadershipFields.map((field) => <div key={field.key}><small>{field.label}</small><strong>{field.key === 'financeManager' ? `${activeBank.leadership.financeManager.name} · ${activeBank.leadership.financeManager.email}` : activeBank.leadership[field.key]}</strong></div>)}</div>
            <div className="bank-leadership-heading">Assigned bank staff <span className="bank-staff-count">{bankStaff.length}</span></div>
            {bankStaffLoading ? <p className="empty-state" role="status">Loading assigned staff...</p>
              : bankStaffError ? <p className="bank-staff-error" role="alert">{bankStaffError}</p>
                : bankStaff.length ? <div className="user-table-wrap"><table className="user-table bank-staff-table"><thead><tr><th>Staff member</th><th>Sub-branch</th><th>Account status</th></tr></thead><PaginatedRows rows={bankStaff} colSpan={3} renderRow={(staff) => {
                  const staffBranch = activeBank.branches.find((branch) => String(branch._id) === String(staff.branchId));
                  return <tr key={staff._id}><td><strong>{staff.name}</strong><br /><small>{staff.email}</small></td><td>{staffBranch?.branchName || 'Not assigned'}{staffBranch?.branchCode && <><br /><small>{staffBranch.branchCode}</small></>}</td><td><span className={`status ${staff.isVerified ? 'verified' : ''}`}>{staff.isVerified ? 'Verified' : 'Pending verification'}</span></td></tr>;
                }} /></table></div>
                  : <p className="empty-state">No employees are assigned to this bank yet.</p>}
            <div className="bank-branch-layout">
              <div className="bank-branch-list">
                {activeBank.branches.length ? activeBank.branches.map((branch) => {
                  const branchFinance = summarizeLoanFinances(loanApplications, activeBank._id, branch._id);
                  return <button type="button" key={branch._id} className={`bank-branch-item ${activeBranch?._id === branch._id ? 'active' : ''}`} onClick={() => setSelectedBranchId(branch._id)}><strong>{branch.branchName}</strong><span>{branch.branchCode}</span><small>{currency(branchFinance.interestIncome)} interest · {currency(branchFinance.loss)} loss · {currency(branchFinance.profit)} profit</small></button>;
                }) : <p className="empty-state">No sub-branches have been added.</p>}
              </div>
              {activeBranch && <div className="bank-branch-detail">
                <div className="bank-leadership-heading">Selected sub-branch</div>
                <BankFinancialSummary title="Sub-branch financials" summary={summarizeLoanFinances(loanApplications, activeBank._id, activeBranch._id)} />
                <div className="branch-detail-grid">
                  <div><small>Sub-branch</small><strong>{activeBranch.branchName}</strong></div>
                  <div><small>Code</small><strong>{activeBranch.branchCode}</strong></div>
                  <div><small>Branch manager</small><strong>{activeBranch.branchManager}</strong></div>
                  <div><small>Province</small><strong>{activeBranch.location.province}</strong></div>
                  <div><small>District</small><strong>{activeBranch.location.district}</strong></div>
                  <div><small>Sector</small><strong>{activeBranch.location.sector}</strong></div>
                  <div><small>Cell</small><strong>{activeBranch.location.cell}</strong></div>
                  <div><small>Village</small><strong>{activeBranch.location.village}</strong></div>
                </div>
              </div>}
            </div>
          </div>}
        </>;
      })()}
    </section>
  </>;
}

const locationFields = [
  { key: 'province', label: 'Province' },
  { key: 'district', label: 'District' },
  { key: 'sector', label: 'Sector' },
  { key: 'cell', label: 'Cell' },
  { key: 'village', label: 'Village' }
];

const leadershipFields = [
  { key: 'generalManager', label: 'General Manager / CEO' },
  { key: 'hrManager', label: 'HR Manager' },
  { key: 'financeManager', label: 'Finance Manager' },
  { key: 'accountsManager', label: 'Accounts & Transactions' }
];

function summarizeLoanFinances(loans, bankId, branchId) {
  const bankLoans = loans.filter((loan) => String(loan.bank?._id || loan.bank) === String(bankId)
    && (!branchId || String(loan.branchId?._id || loan.branchId) === String(branchId)));
  const summary = bankLoans.reduce((totals, loan) => ({
    interestIncome: totals.interestIncome + (loan.interestIncome || 0),
    principalRecovered: totals.principalRecovered + (loan.principalRecovered || 0),
    outstandingPrincipal: totals.outstandingPrincipal + (loan.outstandingPrincipal || 0),
    loss: totals.loss + (loan.loss || 0)
  }), { interestIncome: 0, principalRecovered: 0, outstandingPrincipal: 0, loss: 0 });
  return { ...summary, profit: summary.interestIncome - summary.loss, loanCount: bankLoans.length };
}

function BankFinancialSummary({ title, summary }) {
  return <div className="bank-financial-summary" aria-label={title}>
    <div><small>Interest income</small><strong>{currency(summary.interestIncome)}</strong></div>
    <div><small>Principal recovered</small><strong>{currency(summary.principalRecovered)}</strong></div>
    <div><small>Outstanding principal</small><strong>{currency(summary.outstandingPrincipal)}</strong></div>
    <div><small>Principal loss</small><strong>{currency(summary.loss)}</strong></div>
    <div><small>Net profit</small><strong className={summary.profit < 0 ? 'financial-negative' : 'financial-positive'}>{currency(summary.profit)}</strong></div>
  </div>;
}

function emptyBankForm() {
  return {
    bankName: '',
    leadership: { generalManager: '', hrManager: '', financeManager: { name: '', email: '' }, accountsManager: '' }
  };
}

function AddBranchForm({ banks, token, onCreated, onActivity }) {
  const [bankId, setBankId] = useState('');
  const [form, setForm] = useState({ branchName: '', branchCode: '', branchManager: '', location: { province: '', district: '', sector: '', cell: '', village: '' } });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [addressOptions, setAddressOptions] = useState({ province: [], district: [], sector: [], cell: [], village: [] });
  const [addressLoading, setAddressLoading] = useState(false);
  const addressRequestId = useRef(0);
  useEffect(() => {
    if (!banks.some((bank) => bank._id === bankId)) setBankId(banks[0]?._id || '');
  }, [banks, bankId]);

  useEffect(() => {
    if (!bankId || !banks.length) return;
    const selectedBank = banks.find((bank) => bank._id === bankId);
    if (!selectedBank) return;
    const usedCodes = new Set((selectedBank.branches || []).map((branch) => branch.branchCode).filter(Boolean));
    const suffix = String(selectedBank.accountNumber || '000000').slice(-6);
    let sequence = (selectedBank.branches?.length || 0) + 1;
    let generatedCode = `BR-${suffix}-${String(sequence).padStart(3, '0')}`;
    while (usedCodes.has(generatedCode)) {
      sequence += 1;
      generatedCode = `BR-${suffix}-${String(sequence).padStart(3, '0')}`;
    }
    setForm((current) => ({ ...current, branchCode: generatedCode }));
  }, [bankId, banks]);

  useEffect(() => {
    let active = true;
    setAddressLoading(true);
    getRwandaProvinces()
      .then((provinces) => { if (active) setAddressOptions((options) => ({ ...options, province: provinces })); })
      .catch((error) => { if (active) setNotice({ type: 'error', text: error.message }); })
      .finally(() => { if (active) setAddressLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleLocationChange(field, value) {
    const fields = locationFields.map(({ key }) => key);
    const fieldIndex = fields.indexOf(field);
    const nextLocation = { ...form.location, [field]: value };
    fields.slice(fieldIndex + 1).forEach((childField) => { nextLocation[childField] = ''; });
    setForm((current) => ({ ...current, location: nextLocation }));
    setAddressOptions((current) => {
      const nextOptions = { ...current };
      fields.slice(fieldIndex + 1).forEach((childField) => { nextOptions[childField] = []; });
      return nextOptions;
    });

    if (!value || fieldIndex >= fields.length - 1) return;
    const loaders = {
      province: () => getRwandaDistricts(value),
      district: () => getRwandaSectors(value),
      sector: () => getRwandaCells(nextLocation.district, value),
      cell: () => getRwandaVillages(nextLocation.district, nextLocation.sector, value)
    };
    const requestId = ++addressRequestId.current;
    const nextField = fields[fieldIndex + 1];
    setAddressLoading(true);
    setNotice({ type: '', text: '' });
    try {
      const values = await loaders[field]();
      if (requestId === addressRequestId.current) setAddressOptions((current) => ({ ...current, [nextField]: values }));
    } catch (error) {
      if (requestId === addressRequestId.current) setNotice({ type: 'error', text: error.message });
    } finally {
      if (requestId === addressRequestId.current) setAddressLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      await addBankBranch(token, bankId, form);
      setForm({ branchName: '', branchCode: '', branchManager: '', location: { province: '', district: '', sector: '', cell: '', village: '' } });
      await onCreated();
      setModalOpen(false);
      setNotice({ type: 'success', text: 'Sub-branch added.' });
      onActivity(`A sub-branch was added to ${banks.find((bank) => bank._id === bankId)?.bankName || 'a bank'}.`);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <button className="bank-button" type="button" disabled={!banks.length} onClick={() => { setNotice({ type: '', text: '' }); setModalOpen(true); }}><Building2 size={17} /> Add sub-branch</button>
    {!modalOpen && notice.text && <div className="bank-notice"><Notice notice={notice} /></div>}
    <ManagementModal open={modalOpen} onClose={() => setModalOpen(false)} title="Add a sub-branch">
      <form className="bank-create-form" onSubmit={handleSubmit}>
        <label>Bank<select value={bankId} onChange={(event) => setBankId(event.target.value)} required disabled={!banks.length}><option value="">{banks.length ? 'Select a bank' : 'Create a bank first'}</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select></label>
        <label>Sub-branch name<input value={form.branchName} onChange={(event) => setForm({ ...form, branchName: event.target.value })} required disabled={!banks.length} /></label>
        <label>Branch code<input value={form.branchCode} readOnly disabled={!banks.length} /></label>
        <label>Branch Manager<input value={form.branchManager} onChange={(event) => setForm({ ...form, branchManager: event.target.value })} required disabled={!banks.length} /></label>
        <div className="bank-form-section-title">Rwanda location</div>
        {locationFields.map((field, index) => <label key={field.key}>{field.label}<select value={form.location[field.key]} onChange={(event) => handleLocationChange(field.key, event.target.value)} required disabled={!banks.length || addressLoading || (index > 0 && !form.location[locationFields[index - 1].key])}><option value="">{addressLoading ? 'Loading...' : `Select ${field.label.toLowerCase()}`}</option>{addressOptions[field.key].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={submitting || !banks.length}>{submitting ? 'Adding...' : 'Add sub-branch'}</button>
      </form>
    </ManagementModal>
  </>;
}

function FinancePayrollDashboard({ banks, token, onActivity }) {
  const [bankId, setBankId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [amount, setAmount] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [batches, setBatches] = useState([]);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selectedBank = banks.find((bank) => bank._id === bankId);

  useEffect(() => {
    if (!banks.some((bank) => bank._id === bankId)) setBankId(banks[0]?._id || '');
  }, [banks, bankId]);

  useEffect(() => {
    if (!selectedBank) {
      setEmployees([]);
      setBatches([]);
      setBranchId('');
      return;
    }
    const selectedBranch = selectedBank.branches.find((branch) => branch._id === branchId) || selectedBank.branches[0];
    if (!selectedBranch) {
      setEmployees([]);
      setBatches([]);
      setBranchId('');
      return;
    }
    if (selectedBranch._id !== branchId) setBranchId(selectedBranch._id);
    setLoading(true);
    Promise.all([getPayrollEmployees(token, selectedBank._id, selectedBranch._id), getPayrollBatches(token, selectedBank._id)])
      .then(([employeeResult, batchResult]) => {
        setEmployees(employeeResult.employees);
        setBatches(batchResult.batches);
      })
      .catch((error) => setNotice({ type: 'error', text: error.message }))
      .finally(() => setLoading(false));
  }, [selectedBank?._id, branchId, token]);

  function toggleEmployee(employeeId) {
    setSelectedEmployees((current) => current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const { batch } = await createPayrollBatch(token, { bankId, branchId, amount: Number(amount), employeeIds: selectedEmployees });
      setNotice({ type: 'success', text: `Batch queued for ${batch.employees.length} employees at ${currency(batch.amount)} each.` });
      onActivity(`A payroll batch was queued for ${batch.employees.length} employees.`);
      setAmount('');
      setSelectedEmployees([]);
      const { batches: refreshedBatches } = await getPayrollBatches(token, bankId);
      setBatches(refreshedBatches);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const batchTotal = Number(amount || 0) * selectedEmployees.length;
  const queuedPayrollTotal = batches.reduce((total, batch) => total + Number(batch.totalAmount || 0), 0);
  const payrollEmployees = batches.reduce((total, batch) => total + (batch.employees?.length || 0), 0);
  return <>
    <ReportCards items={[{ label: 'Assigned bank', value: selectedBank?.bankName || 'Not assigned', detail: 'Finance authorization by bank' }, { label: 'Queued batches', value: batches.length, detail: `${payrollEmployees} employee payments` }, { label: 'Queued payroll', value: currency(queuedPayrollTotal), detail: 'Total across listed batches' }, { label: 'Current batch', value: currency(batchTotal), detail: `${selectedEmployees.length} employees selected` }]} />
    {!banks.length ? <section className="bank-panel"><p className="empty-state">No bank is assigned to this Finance Manager account.</p></section> : <>
      <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">FINANCE · PAYROLL</span><h2>Prepare equal-amount payment</h2></div><Wallet size={22} /></div><form className="payroll-form" onSubmit={handleSubmit}>
        <label>Bank<select value={bankId} onChange={(event) => setBankId(event.target.value)} required>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select></label>
        <label>Sub-branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={!selectedBank?.branches.length}><option value="">Select a sub-branch</option>{selectedBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName} · {branch.branchCode}</option>)}</select></label>
        <label>Amount per employee (RWF)<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <div className="employee-picker"><div className="employee-picker-heading"><strong>Verified employees</strong><span>{loading ? 'Loading…' : `${employees.length} available`}</span></div>{employees.length ? <PaginatedList items={employees} renderItem={(employee) => <label className="payroll-employee" key={employee._id}><input type="checkbox" checked={selectedEmployees.includes(employee._id)} onChange={() => toggleEmployee(employee._id)} /><span><strong>{employee.name}</strong><small>{employee.email}</small></span></label>} /> : <p className="empty-state">No verified employee accounts are available.</p>}</div>
        <div className="payroll-summary"><span>{selectedEmployees.length} employees × {currency(Number(amount || 0))}</span><strong>{currency(batchTotal)}</strong></div>
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={submitting || loading || !branchId || !selectedEmployees.length}>{submitting ? 'Queueing batch…' : 'Queue payroll batch'}</button>
        <p className="form-disclaimer">All selected employees receive the same amount in one queued batch. This records a payment instruction; a payment provider is required to move funds.</p>
      </form></section>
      <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">PAYROLL QUEUE</span><h2>Recent batches</h2></div><Clock3 size={22} /></div>{batches.length ? <div className="payroll-batches"><PaginatedList items={batches} renderItem={(batch) => <article className="payroll-batch" key={batch._id}><div><strong>{batch.branchName} · {new Date(batch.createdAt).toLocaleString()}</strong><small>{batch.employees.length} employees · {currency(batch.amount)} each</small></div><strong>{currency(batch.totalAmount)}</strong><span className="loan-status pending">{batch.status}</span></article>} /></div> : <p className="empty-state">No payroll batches have been queued.</p>}</section>
    </>}
  </>;
}

function AdminDepositDashboard({ token, banks, onActivity }) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const selectedBank = banks.find((bank) => bank._id === selectedBankId);
  useEffect(() => {
    setLoading(true);
    setError('');
    getBankAccounts(token, {
      ...(selectedBankId ? { bankId: selectedBankId } : {}),
      ...(selectedBranchId ? { branchId: selectedBranchId } : {})
    })
      .then(({ accounts: loadedAccounts }) => setAccounts(loadedAccounts))
      .catch((loadError) => {
        setAccounts([]);
        setError(loadError.message);
      })
      .finally(() => setLoading(false));
  }, [token, selectedBankId, selectedBranchId]);
  const deposits = accounts.flatMap((account) => (account.transactions || [])
    .filter((transaction) => transaction.type === 'deposit')
    .map((transaction) => ({ ...transaction, accountId: account._id, accountNumber: account.accountNumber, ownerName: account.userId?.name || 'Account holder', ownerEmail: account.userId?.email || '' })));
  deposits.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const total = deposits.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  return <>
    <div className="bank-stats"><article className="balance-stat"><span>Total deposits</span><strong>{currency(total)}</strong><small>Across customer accounts</small></article><article><span>Deposit transactions</span><strong>{deposits.length}</strong><small>Recorded deposits</small></article><article><span>Accounts with deposits</span><strong>{new Set(deposits.map((transaction) => transaction.accountId)).size}</strong><small>Customer accounts</small></article></div>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>Deposit history</h2></div><ArrowDownToLine size={23} /></div><div className="directory-toolbar bank-ledger-filters"><select aria-label="Filter by bank" value={selectedBankId} onChange={(event) => { setSelectedBankId(event.target.value); setSelectedBranchId(''); }}><option value="">All banks</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select><select aria-label="Filter by sub-branch" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} disabled={!selectedBankId}><option value="">{selectedBankId ? 'All sub-branches' : 'Select a bank first'}</option>{selectedBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}{branch.branchCode ? ` · ${branch.branchCode}` : ''}</option>)}</select></div>{error && <p className="empty-state">{error}</p>}{loading ? <p className="empty-state">Loading deposit history...</p> : deposits.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Customer</th><th>Email / account</th><th>Date</th><th>Amount</th></tr></thead><PaginatedRows rows={deposits} colSpan={4} renderRow={(transaction) => <tr key={transaction._id}><td>{transaction.ownerName}</td><td>{transaction.ownerEmail || transaction.accountNumber}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td><td><strong>{currency(transaction.amount)}</strong></td></tr>} /></table></div> : !error && <p className="empty-state">No deposits have been recorded yet.</p>}</section>
    <BankAccountManagementTable accounts={accounts} setAccounts={setAccounts} token={token} banks={banks} canManageAccounts onActivity={onActivity} />
  </>;
}

function PaginationControls({ page, pageCount, total, start, end, onPageChange }) {
  return <div className="bank-pagination" aria-label="Table pagination"><span>{total ? `Showing ${start}-${end} of ${total}` : 'No records'} · Page {page} of {pageCount}</span><button className="icon-button" type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button><button className="icon-button" type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button></div>;
}

function PaginatedRows({ rows, colSpan, renderRow, pageSize = 10 }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const startIndex = (page - 1) * pageSize;
  const start = rows.length ? startIndex + 1 : 0;
  const visibleRows = rows.slice(startIndex, startIndex + pageSize);
  return <tbody>{visibleRows.map(renderRow)}<tr className="table-pagination-row"><td colSpan={colSpan}><PaginationControls page={page} pageCount={pageCount} total={rows.length} start={start} end={Math.min(start + pageSize - 1, rows.length)} onPageChange={setPage} /></td></tr></tbody>;
}

function PaginatedList({ items, renderItem, pageSize = 10 }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const startIndex = (page - 1) * pageSize;
  const start = items.length ? startIndex + 1 : 0;
  const visibleItems = items.slice(startIndex, startIndex + pageSize);
  return <>{visibleItems.map(renderItem)}<PaginationControls page={page} pageCount={pageCount} total={items.length} start={start} end={Math.min(start + pageSize - 1, items.length)} onPageChange={setPage} /></>;
}

function ReportCards({ items }) {
  return <div className="bank-stats report-cards">{items.map(({ label, value, detail }, index) => <article className={index === 0 ? 'balance-stat' : ''} key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>;
}

function BankAdminReportDashboard({ banks, token, loanApplications }) {
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bank = banks[0];

  useEffect(() => {
    let active = true;
    if (!token || !bank?._id) {
      setLoading(false);
      return () => { active = false; };
    }
    Promise.all([
      getBankAccounts(token, { bankId: bank._id }),
      getBankMembers(token),
      getBankStaff(token)
    ]).then(([accountResult, memberResult, staffResult]) => {
      if (!active) return;
      setAccounts(accountResult.accounts || []);
      setMembers(memberResult.members || []);
      setStaff(staffResult.staff || []);
      setError('');
    }).catch((loadError) => {
      if (active) setError(loadError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [bank?._id, token]);

  const totalBalances = accounts.reduce((total, account) => total + Number(account.balance || 0), 0);
  const outstandingLoans = loanApplications.filter((loan) => loan.status === 'approved')
    .reduce((total, loan) => total + Number(loan.outstandingPrincipal ?? loan.amount ?? 0), 0);
  const approvedMembers = members.filter((member) => member.isApproved && member.isActive !== false).length;
  const activeStaff = staff.filter((employee) => employee.isVerified && employee.isActive !== false).length;
  const months = recentMonths();
  const monthlyLoans = groupByMonth(loanApplications, months, (loan) => Number(loan.amount || 0));
  const monthlyMembers = groupByMonth(members, months, () => 1);
  const loanStatuses = ['pending', 'approved', 'declined', 'defaulted'].map((status) => ({
    label: status[0].toUpperCase() + status.slice(1),
    value: loanApplications.filter((loan) => loan.status === status).length
  }));
  const branches = (bank?.branches || []).map((branch) => ({
    label: branch.branchName,
    value: accounts.filter((account) => String(account.branchId?._id || account.branchId) === String(branch._id))
      .reduce((total, account) => total + Number(account.balance || 0), 0)
  }));

  return <section className="financial-dashboard">
    <header className="financial-dashboard-heading"><div><span className="eyebrow">BANK-WIDE REPORTING</span><h2>Financial Management Dashboard</h2><p>{bank?.bankName || 'Your bank'} · reports across all sub-branches</p></div><span className="report-refresh">{loading ? 'Refreshing reports…' : `Updated ${new Date().toLocaleString()}`}</span></header>
    <ReportCards items={[
      { label: 'Customer account balances', value: loading ? '—' : currency(totalBalances), detail: `${accounts.length} accounts across the bank` },
      { label: 'Customer members', value: loading ? '—' : members.length, detail: `${approvedMembers} active` },
      { label: 'Bank employees', value: loading ? '—' : staff.length, detail: `${activeStaff} active` },
      { label: 'Loan applications', value: loanApplications.length, detail: `${loanApplications.filter((loan) => loan.status === 'pending').length} awaiting review` },
      { label: 'Approved loan value', value: currency(outstandingLoans), detail: 'Approved principal / outstanding' }
    ]} />
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="financial-chart-grid">
      <ReportLineChart title="Loan application value" subtitle="Last 6 months" values={monthlyLoans} money />
      <ReportBarChart title="Account balances by sub-branch" subtitle="Current customer account balances" values={branches} money />
      <ReportBarChart title="Member registrations" subtitle="New members · last 6 months" values={monthlyMembers} />
      <ReportBarChart title="Loan applications by status" subtitle="Current bank-wide application pipeline" values={loanStatuses} />
    </div>
  </section>;
}

function recentMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_value, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleString(undefined, { month: 'short' }) };
  });
}

function groupByMonth(items, months, getValue) {
  return months.map((month) => ({
    label: month.label,
    value: items.filter((item) => {
      const date = new Date(item.createdAt);
      return `${date.getFullYear()}-${date.getMonth()}` === month.key;
    }).reduce((total, item) => total + getValue(item), 0)
  }));
}

function ReportLineChart({ title, subtitle, values, money = false }) {
  const max = Math.max(...values.map((item) => item.value), 1);
  const points = values.map((item, index) => ({
    ...item,
    x: values.length === 1 ? 50 : 8 + (index * 84) / (values.length - 1),
    y: 82 - (item.value / max) * 62
  }));
  return <article className="report-chart"><h3>{title}</h3><p>{subtitle}</p><svg viewBox="0 0 100 100" role="img" aria-label={title}>
    {[20, 40, 60, 80].map((y) => <line key={y} x1="5" x2="95" y1={y} y2={y} className="chart-grid-line" />)}
    <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} className="chart-line" />
    {points.map(({ x, y, label, value }) => <g key={label}><circle cx={x} cy={y} r="1.7" className="chart-point" /><text x={x} y="96" textAnchor="middle" className="chart-axis-label">{label}</text><title>{label}: {money ? currency(value) : value}</title></g>)}
  </svg><div className="chart-legend"><span />{money ? 'Requested amount' : 'Applications'}</div></article>;
}

function ReportBarChart({ title, subtitle, values, money = false }) {
  const max = Math.max(...values.map((item) => item.value), 1);
  return <article className="report-chart"><h3>{title}</h3><p>{subtitle}</p><div className="chart-bars">{values.length ? values.map(({ label, value }) => <div className="chart-bar-column" key={label} title={`${label}: ${money ? currency(value) : value}`}><strong>{money ? currency(value) : value}</strong><div className="chart-bar-track"><span style={{ height: `${Math.max(value ? (value / max) * 100 : 0, value ? 4 : 0)}%` }} /></div><small>{label}</small></div>) : <p className="empty-state">No report data available.</p>}</div></article>;
}

function BankMembersDashboard({ token, banks, staffRole, onActivity }) {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', branchId: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [approvalNotice, setApprovalNotice] = useState({ type: '', text: '' });
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState('');
  const isBankAdmin = staffRole === 'bank_admin';

  useEffect(() => {
    if (isBankAdmin && !form.branchId && banks[0]?.branches?.length === 1) {
      setForm((current) => ({ ...current, branchId: String(banks[0].branches[0]._id) }));
    }
  }, [banks, form.branchId, isBankAdmin]);

  useEffect(() => {
    let active = true;
    getBankMembers(token)
      .then(({ members: loadedMembers }) => { if (active) setMembers(loadedMembers); })
      .catch((error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const { message } = await createBankMember(token, form);
      setNotice({ type: 'success', text: message || 'Member registered. A verification code was sent by email.' });
      onActivity('A bank member was registered and is awaiting approval.');
      setForm({ name: '', email: '', password: '', branchId: isBankAdmin ? '' : form.branchId });
      try {
        const { members: loadedMembers } = await getBankMembers(token);
        setMembers(loadedMembers);
        setLoadError('');
      } catch (error) {
        setLoadError(error.message);
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function approveMember(memberId) {
    setUpdatingMemberId(memberId);
    setApprovalNotice({ type: '', text: '' });
    try {
      const { member } = await activateBankMember(token, memberId);
      if (!member?.isVerified || !member?.isApproved || member?.isActive === false) throw new Error('The server did not confirm member activation. Refresh the member list and try again.');
      setMembers((current) => current.map((item) => item._id === memberId ? { ...item, ...member, isVerified: true } : item));
      setApprovalNotice({ type: 'success', text: 'Bank member approved and activated successfully.' });
      onActivity('A bank member was approved and activated.');
    } catch (error) {
      setApprovalNotice({ type: 'error', text: error.message });
    } finally {
      setUpdatingMemberId('');
    }
  }

  async function deactivateMember(memberId) {
    setUpdatingMemberId(memberId);
    setApprovalNotice({ type: '', text: '' });
    try {
      const { member } = await deactivateBankMember(token, memberId);
      if (member?.isActive !== false) throw new Error('The server did not confirm member deactivation. Refresh the member list and try again.');
      setMembers((current) => current.map((item) => item._id === memberId ? { ...item, ...member } : item));
      setApprovalNotice({ type: 'success', text: 'Bank member deactivated successfully.' });
      onActivity('A bank member was deactivated.');
    } catch (error) {
      setApprovalNotice({ type: 'error', text: error.message });
    } finally {
      setUpdatingMemberId('');
    }
  }

  const activeMembers = members.filter((member) => member.isActive !== false && member.isApproved).length;
  const inactiveMembers = members.filter((member) => member.isActive === false).length;
  const pendingVerification = members.filter((member) => !member.isVerified).length;
  const pendingApproval = members.filter((member) => member.isVerified && !member.isApproved && member.isActive !== false).length;

  return <>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK ADMINISTRATION</span><h2>Register a bank member</h2></div><UserPlus size={22} /></div><p className="form-disclaimer">{isBankAdmin ? 'Choose the sub-branch for this member. They must verify their email before signing in, or you can approve and activate them below.' : 'Members registered here are assigned to your sub-branch. They must verify their email before signing in, or you can approve and activate them below.'}</p><form className="bank-form member-registration-form" onSubmit={handleSubmit}><label htmlFor="member-name">Full name</label><input className="bank-text-input" id="member-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required /><label htmlFor="member-email">Email address</label><input className="bank-text-input" id="member-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /><label htmlFor="member-password">Temporary password</label><input className="bank-text-input" id="member-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" minLength={8} required />{isBankAdmin && <><label htmlFor="member-branch">Sub-branch</label><select className="bank-text-input" id="member-branch" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} required><option value="">Select a sub-branch</option>{banks.flatMap((bank) => bank.branches || []).map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}{branch.branchCode ? ` · ${branch.branchCode}` : ''}</option>)}</select></>}{notice.text && <Notice notice={notice} />}<button className="bank-button" type="submit" disabled={submitting || (isBankAdmin && !form.branchId)}>{submitting ? 'Registering member...' : 'Register member'}</button></form></section>
    {!loading && <ReportCards items={[{ label: 'Customer members', value: members.length, detail: 'Across all sub-branches' }, { label: 'Active', value: activeMembers, detail: 'Approved and enabled' }, { label: 'Inactive', value: inactiveMembers, detail: 'Access disabled' }, { label: 'Verification / approval pending', value: pendingVerification + pendingApproval, detail: `${pendingVerification} verification · ${pendingApproval} approval` }]} />}
    <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK-WIDE MEMBER DIRECTORY</span><h2>Customer members</h2></div><UsersRound size={22} /></div>{approvalNotice.text && <div className="bank-notice"><Notice notice={approvalNotice} /></div>}{loadError && <p className="notice error" role="alert">{loadError}</p>}{loading ? <p className="empty-state">Loading bank members...</p> : members.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Member</th><th>Email</th><th>Sub-branch</th><th>Account status</th><th>Registered</th><th>Member access</th></tr></thead><PaginatedRows rows={members} colSpan={6} renderRow={(member) => { const active = member.isActive !== false; return <tr key={member._id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td>{member.branch?.branchName || 'Not assigned'}{member.branch?.branchCode && <><br /><small>{member.branch.branchCode}</small></>}</td><td><span className={`status ${active && member.isApproved ? 'verified' : ''}`}>{!active ? 'Deactivated' : member.isApproved ? 'Active' : member.isVerified ? 'Email verified · awaiting approval' : 'Pending email verification'}</span></td><td>{new Date(member.createdAt).toLocaleDateString()}</td><td>{!active ? <button className="activate-button" type="button" disabled={updatingMemberId === member._id} onClick={() => approveMember(member._id)}>{updatingMemberId === member._id ? 'Activating...' : 'Activate member'}</button> : <>{!member.isApproved && <button className="activate-button" type="button" disabled={updatingMemberId === member._id} onClick={() => approveMember(member._id)}>{updatingMemberId === member._id ? 'Approving...' : 'Approve & activate'}</button>}<button className="deactivate-button" type="button" disabled={updatingMemberId === member._id} onClick={() => deactivateMember(member._id)}>{updatingMemberId === member._id ? 'Updating...' : 'Deactivate'}</button></>}</td></tr>; }} /></table></div> : !loadError && <p className="empty-state">No members have been registered for your bank yet.</p>}</section>
  </>;
}

function BankStaffAdminDashboard({ token, banks, onActivity }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', staffRole: '', branchId: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [statusNotice, setStatusNotice] = useState({ type: '', text: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStaffId, setUpdatingStaffId] = useState('');

  async function refreshStaff() {
    const { staff: loadedStaff } = await getBankStaff(token);
    setStaff(loadedStaff);
    setError('');
  }

  const activeStaff = staff.filter((employee) => employee.isVerified && employee.isActive !== false).length;
  const inactiveStaff = staff.filter((employee) => employee.isActive === false).length;
  const pendingStaff = staff.filter((employee) => !employee.isVerified && employee.isActive !== false).length;
  const roleCounts = BANK_STAFF_ROLES.map((role) => ({
    label: role.label,
    count: staff.filter((employee) => employee.staffRole === role.value).length
  }));

  async function updateStaffStatus(employee, activate) {
    setUpdatingStaffId(employee._id);
    setStatusNotice({ type: '', text: '' });
    try {
      const { staff: updatedStaff } = activate
        ? await activateBankStaff(token, employee._id)
        : await deactivateBankStaff(token, employee._id);
      if (!updatedStaff || updatedStaff.isActive === !activate || (activate && !updatedStaff.isVerified)) {
        throw new Error(`The server did not confirm employee ${activate ? 'activation' : 'deactivation'}. Refresh the list and try again.`);
      }
      setStaff((current) => current.map((item) => item._id === employee._id ? { ...item, ...updatedStaff } : item));
      setStatusNotice({ type: 'success', text: `${employee.name} was ${activate ? 'activated' : 'deactivated'}.` });
      onActivity(`A bank employee was ${activate ? 'activated' : 'deactivated'}.`);
    } catch (statusError) {
      setStatusNotice({ type: 'error', text: statusError.message });
    } finally {
      setUpdatingStaffId('');
    }
  }

  useEffect(() => {
    let active = true;
    getBankStaff(token)
      .then(({ staff: loadedStaff }) => { if (active) setStaff(loadedStaff); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const { message } = await createBankStaff(token, form);
      setNotice({ type: 'success', text: message || 'Bank staff account created. Verification email sent.' });
      onActivity('A bank staff account was registered.');
      setForm({ name: '', email: '', password: '', staffRole: '', branchId: '' });
      try {
        await refreshStaff();
      } catch (refreshError) {
        setError(refreshError.message);
      }
    } catch (submitError) {
      setNotice({ type: 'error', text: submitError.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK TEAM</span><h2>Register bank staff</h2></div><UserPlus size={22} /></div><p className="form-disclaimer">Assign each employee to a sub-branch. Bank Admin accounts are created by the System Admin.</p><form className="bank-form" onSubmit={handleSubmit}><label htmlFor="staff-name">Full name</label><input className="bank-text-input" id="staff-name" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><label htmlFor="staff-email">Email address</label><input className="bank-text-input" id="staff-email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /><label htmlFor="staff-password">Temporary password</label><input className="bank-text-input" id="staff-password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><label htmlFor="staff-role">Bank role</label><select className="bank-text-input" id="staff-role" value={form.staffRole} onChange={(event) => setForm({ ...form, staffRole: event.target.value })} required><option value="">Select a role</option>{BANK_STAFF_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select><label htmlFor="staff-branch">Sub-branch</label><select className="bank-text-input" id="staff-branch" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} required><option value="">Select a sub-branch</option>{banks.flatMap((bank) => bank.branches || []).map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}{branch.branchCode ? ` · ${branch.branchCode}` : ''}</option>)}</select>{notice.text && <Notice notice={notice} />}<button className="bank-button" type="submit" disabled={submitting || !form.branchId}>{submitting ? 'Registering staff...' : 'Register staff'}</button></form></section>
    {!loading && <ReportCards items={[{ label: 'Bank employees', value: staff.length, detail: 'Across all sub-branches' }, { label: 'Active', value: activeStaff, detail: 'Verified and enabled' }, { label: 'Verification pending', value: pendingStaff, detail: `${inactiveStaff} deactivated` }, ...roleCounts.map(({ label, count }) => ({ label, value: count, detail: 'Employees in role' }))]} />}
    <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK-WIDE TEAM</span><h2>Staff and roles</h2></div><UsersRound size={22} /></div>{statusNotice.text && <div className="bank-notice"><Notice notice={statusNotice} /></div>}{error && <p className="notice error" role="alert">{error}</p>}{loading ? <p className="empty-state">Loading bank staff...</p> : staff.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Staff member</th><th>Role</th><th>Sub-branch</th><th>Status</th><th>Access</th></tr></thead><PaginatedRows rows={staff} colSpan={5} renderRow={(employee) => { const active = employee.isActive !== false; return <tr key={employee._id}><td><strong>{employee.name}</strong><br /><small>{employee.email}</small></td><td>{staffRoleName(employee.staffRole)}</td><td>{employee.branch?.branchName || 'Not assigned'}{employee.branch?.branchCode && <><br /><small>{employee.branch.branchCode}</small></>}</td><td><span className={`status ${employee.isVerified && active ? 'verified' : ''}`}>{!active ? 'Deactivated' : employee.isVerified ? 'Active' : 'Verification pending'}</span></td><td><button className={active ? 'deactivate-button' : 'activate-button'} type="button" disabled={updatingStaffId === employee._id} onClick={() => updateStaffStatus(employee, !active)}>{updatingStaffId === employee._id ? 'Updating...' : active ? 'Deactivate' : 'Activate'}</button></td></tr>; }} /></table></div> : !error && <p className="empty-state">No staff are assigned to this bank.</p>}</section>
  </>;
}

function HRDashboard({ token }) {
  const [staff, setStaff] = useState([]);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [loadingPhotoId, setLoadingPhotoId] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getBankStaff(token), getBankMembers(token), getBankAttendance(token)])
      .then(([staffResult, memberResult, attendanceResult]) => {
        if (!active) return;
        setStaff(staffResult.staff || []);
        setMembers(memberResult.members || []);
        setAttendance(attendanceResult.attendance || []);
        setError('');
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  async function showAttendancePhoto(record, type) {
    setPhotoError('');
    const loadingKey = `${record._id}:${type}`;
    setLoadingPhotoId(loadingKey);
    try {
      const photo = await getAttendancePhoto(token, record._id, type);
      setPhotoTitle(`${record.employee?.name || 'Employee'} · ${type === 'check-out' ? 'Check-out' : 'Check-in'} selfie`);
      setPhotoUrl(URL.createObjectURL(photo));
    } catch (loadError) {
      setPhotoError(loadError.message);
    } finally {
      setLoadingPhotoId((current) => current === loadingKey ? '' : current);
    }
  }

  const activeStaff = staff.filter((employee) => employee.isVerified && employee.isActive !== false);
  const pendingStaff = staff.filter((employee) => !employee.isVerified && employee.isActive !== false);
  const deactivatedStaff = staff.filter((employee) => employee.isActive === false);
  const activeMembers = members.filter((member) => member.isApproved && member.isActive !== false);
  const roleBreakdown = ['bank_admin', 'branch_manager', 'general_manager', 'hr_manager', 'finance_manager', 'accounts_manager']
    .map((role) => ({
      label: staffRoleName(role),
      value: staff.filter((employee) => (employee.staffRole || 'branch_manager') === role).length
    })).filter((item) => item.value > 0);
  const branchBreakdown = [...new Set(staff.map((employee) => employee.branch?.branchName || 'Unassigned'))]
    .map((branchName) => ({
      label: branchName,
      value: staff.filter((employee) => (employee.branch?.branchName || 'Unassigned') === branchName).length
    }));
  const visibleStaff = staff.filter((employee) => {
    const matchesSearch = `${employee.name} ${employee.email}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesRole = !roleFilter || (employee.staffRole || 'branch_manager') === roleFilter;
    const matchesBranch = !branchFilter || String(employee.branch?._id || '') === branchFilter;
    const status = employee.isActive === false ? 'deactivated' : employee.isVerified ? 'active' : 'pending';
    const matchesStatus = !statusFilter || status === statusFilter;
    return matchesSearch && matchesRole && matchesBranch && matchesStatus;
  });
  const branches = [...new Map(staff.filter((employee) => employee.branch?._id)
    .map((employee) => [String(employee.branch._id), employee.branch])).values()];
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const todayAttendance = attendance.filter((record) => record.dayKey === todayKey).length;
  const attendanceDailyBreakdown = [...new Set(attendance.map((record) => record.dayKey))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 7)
    .reverse()
    .map((dayKey) => ({ label: dayKey.slice(5), value: attendance.filter((record) => record.dayKey === dayKey).length }));
  const attendanceByEmployee = [...attendance.reduce((groups, record) => {
    const employeeId = String(record.employee?._id || record.employee?.email || record._id);
    if (!groups.has(employeeId)) {
      groups.set(employeeId, { id: employeeId, employee: record.employee, records: [] });
    }
    groups.get(employeeId).records.push(record);
    return groups;
  }, new Map()).values()];

  return <>
    {!loading && <ReportCards items={[
      { label: 'Total employees', value: staff.length, detail: 'Across all bank sub-branches' },
      { label: 'Active employees', value: activeStaff.length, detail: 'Verified and enabled' },
      { label: 'Verification pending', value: pendingStaff.length, detail: 'Awaiting activation' },
      { label: 'Deactivated', value: deactivatedStaff.length, detail: 'Access disabled' },
      { label: 'Active customer members', value: activeMembers.length, detail: 'Bank-wide workforce directory context' },
      { label: 'Checked in today', value: todayAttendance, detail: 'Employee selfie check-ins · Kigali time' }
    ]} />}
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="financial-chart-grid hr-report-charts">
      <ReportBarChart title="Employees by role" subtitle="Bank-wide role distribution" values={roleBreakdown} />
      <ReportBarChart title="Employees by sub-branch" subtitle="Assigned staff headcount" values={branchBreakdown} />
      <ReportLineChart title="Recent attendance" subtitle="Daily check-ins · last seven recorded dates" values={attendanceDailyBreakdown} />
    </div>
    <section className="bank-panel transaction-panel">
      <div className="bank-panel-heading"><div><span className="eyebrow">ATTENDANCE</span><h2>Daily employee attendance</h2></div><CalendarCheck size={22} /></div>
      <p className="form-disclaimer">Attendance photos are stored in authenticated Cloudinary storage and visible only to HR Managers assigned to this bank. Photos are evidence only; the system does not use facial recognition.</p>
      {photoError && <p className="notice error" role="alert">{photoError}</p>}
      {attendance.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Employee</th><th>Sub-branch</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Attendance evidence</th></tr></thead><PaginatedRows rows={attendanceByEmployee} colSpan={6} renderRow={(group) => group.records.map((record, index) => <tr key={record._id}>{index === 0 && <td className="attendance-employee-cell" rowSpan={group.records.length}><strong>{group.employee?.name || 'Employee'}</strong><br /><small>{group.employee?.email || ''}</small></td>}<td>{record.branchName || 'Unassigned'}</td><td>{record.dayKey}</td><td>{new Date(record.checkInAt).toLocaleTimeString()}</td><td>{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString() : 'Not checked out'}</td><td><div className="attendance-evidence-actions"><button className="manage-button" type="button" disabled={loadingPhotoId === `${record._id}:check-in`} onClick={() => showAttendancePhoto(record, 'check-in')}>{loadingPhotoId === `${record._id}:check-in` ? 'Loading...' : 'Check-in photo'}</button>{record.hasCheckOutPhoto && <button className="manage-button" type="button" disabled={loadingPhotoId === `${record._id}:check-out`} onClick={() => showAttendancePhoto(record, 'check-out')}>{loadingPhotoId === `${record._id}:check-out` ? 'Loading...' : 'Check-out photo'}</button>}</div></td></tr>)} /></table></div> : !loading && <p className="empty-state">No employee attendance in the past 30 days.</p>}
    </section>
    {photoUrl && <div className="modal-backdrop" role="presentation" onClick={() => setPhotoUrl('')}><section className="modal-card" role="dialog" aria-modal="true" aria-label="Attendance selfie" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">HR-ONLY ATTENDANCE EVIDENCE</span><h2>{photoTitle}</h2></div><button className="icon-button" type="button" aria-label="Close selfie" onClick={() => setPhotoUrl('')}><X size={18} /></button></div><img className="attendance-photo-preview" src={photoUrl} alt={photoTitle} /></section></div>}
    <section className="bank-panel transaction-panel">
      <div className="bank-panel-heading"><div><span className="eyebrow">PEOPLE OPERATIONS</span><h2>Employee directory</h2></div><UsersRound size={22} /></div>
      <p className="form-disclaimer">HR view-only workspace: review staff role, sub-branch assignment, account access status, and account creation date. Bank Admins manage employee access and assignments.</p>
      <div className="directory-toolbar hr-directory-filters">
        <input aria-label="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" />
        <select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{['bank_admin', 'branch_manager', 'general_manager', 'hr_manager', 'finance_manager', 'accounts_manager'].map((role) => <option key={role} value={role}>{staffRoleName(role)}</option>)}</select>
        <select aria-label="Filter by sub-branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All sub-branches</option>{branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select>
        <select aria-label="Filter by account status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="pending">Verification pending</option><option value="deactivated">Deactivated</option></select>
      </div>
      {loading ? <p className="empty-state">Loading HR dashboard…</p> : visibleStaff.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Employee</th><th>Role</th><th>Sub-branch</th><th>Account status</th><th>Account created</th></tr></thead><PaginatedRows rows={visibleStaff} colSpan={5} renderRow={(employee) => <tr key={employee._id}><td><strong>{employee.name}</strong><br /><small>{employee.email}</small></td><td>{staffRoleName(employee.staffRole)}</td><td>{employee.branch?.branchName || 'Not assigned'}{employee.branch?.branchCode && <><br /><small>{employee.branch.branchCode}</small></>}</td><td><span className={`status ${employee.isVerified && employee.isActive !== false ? 'verified' : ''}`}>{employee.isActive === false ? 'Deactivated' : employee.isVerified ? 'Active' : 'Verification pending'}</span></td><td>{new Date(employee.createdAt).toLocaleDateString()}</td></tr>} /></table></div> : !error && <p className="empty-state">No employees match the selected filters.</p>}
    </section>
  </>;
}

function EmployeeAttendanceDashboard({ token, profile }) {
  const [attendance, setAttendance] = useState([]);
  const [consent, setConsent] = useState(false);
  const [checkOutConsent, setCheckOutConsent] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturePurpose, setCapturePurpose] = useState('check-in');
  const [photo, setPhoto] = useState('');
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [canCheckOut, setCanCheckOut] = useState(() => isKigaliCheckOutTime());
  const [notice, setNotice] = useState({ type: '', text: '' });
  const videoRef = useRef(null);
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const todayAttendance = attendance.find((record) => record.dayKey === todayKey);
  const checkedInToday = Boolean(todayAttendance);

  useEffect(() => {
    let active = true;
    getMyAttendance(token)
      .then(({ attendance: records }) => { if (active) setAttendance(records || []); })
      .catch((error) => { if (active) setNotice({ type: 'error', text: error.message }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const timer = window.setInterval(() => setCanCheckOut(isKigaliCheckOutTime()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  async function startCamera(purpose = 'check-in') {
    setNotice({ type: '', text: '' });
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice({ type: 'error', text: 'Camera access is not available in this browser. Use a secure HTTPS connection or ask HR for help.' });
      return;
    }
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setStream(cameraStream);
      setCapturePurpose(purpose);
      setCameraOpen(true);
      setPhoto('');
    } catch (error) {
      setNotice({ type: 'error', text: error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access to take attendance.' : 'Unable to start the camera. Check that it is connected and not in use.' });
    }
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setNotice({ type: 'error', text: 'The camera is not ready yet. Wait for the preview and try again.' });
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setNotice({ type: 'error', text: 'Unable to capture an image in this browser.' });
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedPhoto = canvas.toDataURL('image/jpeg', 0.65);
    if (capturedPhoto.length > 900 * 1024) {
      setNotice({ type: 'error', text: 'The selfie is too large to upload. Capture it again in better lighting.' });
      return;
    }
    setPhoto(capturedPhoto);
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
    setNotice({ type: '', text: '' });
  }

  async function submitCheckIn(event) {
    event.preventDefault();
    if (!consent || !photo) {
      setNotice({ type: 'error', text: 'Give consent and capture a selfie before recording attendance.' });
      return;
    }
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      const result = await checkInForAttendance(token, { photoConsent: true, photo });
      setAttendance((records) => [result.attendance, ...records]);
      setPhoto('');
      setConsent(false);
      setNotice({ type: '', text: '' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCheckOut(event) {
    event.preventDefault();
    if (!checkOutConsent || !photo || capturePurpose !== 'check-out') {
      setNotice({ type: 'error', text: 'Give consent and capture a selfie before recording your check-out.' });
      return;
    }
    setCheckingOut(true);
    setNotice({ type: '', text: '' });
    try {
      const result = await checkOutForAttendance(token, { photoConsent: true, photo });
      setAttendance((records) => records.map((record) => (
        record._id === result.attendance._id ? result.attendance : record
      )));
      setPhoto('');
      setCheckOutConsent(false);
      setNotice({ type: 'success', text: 'Check-out recorded. Your selfie is securely stored as attendance evidence for HR.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setCheckingOut(false);
    }
  }

  return <>
    <ReportCards items={[
      { label: 'Today', value: checkedInToday ? 'Checked in' : 'Not checked in', detail: 'Rwanda local date' },
      { label: 'Recorded days', value: attendance.length, detail: 'Most recent 90 records' }
    ]} />
    <section className="bank-panel transaction-panel">
      <div className="bank-panel-heading"><div><span className="eyebrow">EMPLOYEE ATTENDANCE · {profile.name}</span><h2>Daily attendance</h2></div><Camera size={22} /></div>
      <p className="form-disclaimer">Your selfie is stored in authenticated Cloudinary storage and can be viewed only by HR Managers at your bank. It is used as attendance evidence only; no facial recognition or identity matching is performed. If you do not consent to photo storage, contact your HR Manager for the bank’s alternative attendance process.</p>
      {checkedInToday ? <p className="notice success" role="status">Check-in recorded for today.</p> : <form className="bank-form" onSubmit={submitCheckIn}>
        <label className="check-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /> I consent to capturing and securely storing this selfie as attendance evidence, accessible to my bank’s HR Manager.</label>
        {cameraOpen && capturePurpose === 'check-in' && <div className="attendance-camera"><video ref={videoRef} autoPlay playsInline aria-label="Live check-in selfie camera preview" /><button className="bank-button" type="button" onClick={captureSelfie}>Capture selfie</button></div>}
        {!cameraOpen && !photo && <button className="bank-button" type="button" disabled={!consent || submitting} onClick={() => startCamera('check-in')}><Camera size={17} /> Start camera</button>}
        {photo && capturePurpose === 'check-in' && <div className="attendance-camera"><img className="attendance-photo-preview" src={photo} alt="Check-in selfie preview before attendance submission" /><button className="manage-button" type="button" onClick={() => { setPhoto(''); startCamera('check-in'); }}>Retake selfie</button></div>}
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={!consent || !photo || submitting}>{submitting ? 'Recording attendance...' : 'Record attendance'}</button>
      </form>}
      {todayAttendance && !todayAttendance.checkOutAt && !canCheckOut && <p className="notice attendance-checkout-time" role="status">Your check-out selfie will be available from 5:00 PM Rwanda time. Your daily check-in and check-out are recorded together under the same date.</p>}
      {todayAttendance && !todayAttendance.checkOutAt && canCheckOut && <form className="bank-form attendance-checkout-form" onSubmit={submitCheckOut}>
        <p className="form-disclaimer">Checked in at {new Date(todayAttendance.checkInAt).toLocaleTimeString()}. A fresh selfie is required to record check-out.</p>
        <label className="check-row"><input type="checkbox" checked={checkOutConsent} onChange={(event) => setCheckOutConsent(event.target.checked)} required /> I consent to capturing and securely storing a separate check-out selfie as attendance evidence for my bank’s HR Manager.</label>
        {cameraOpen && capturePurpose === 'check-out' && <div className="attendance-camera"><video ref={videoRef} autoPlay playsInline aria-label="Live check-out selfie camera preview" /><button className="bank-button" type="button" onClick={captureSelfie}>Capture check-out selfie</button></div>}
        {!cameraOpen && (!photo || capturePurpose !== 'check-out') && <button className="bank-button" type="button" disabled={!checkOutConsent || checkingOut} onClick={() => startCamera('check-out')}><Camera size={17} /> Start check-out camera</button>}
        {photo && capturePurpose === 'check-out' && <div className="attendance-camera"><img className="attendance-photo-preview" src={photo} alt="Check-out selfie preview before attendance submission" /><button className="manage-button" type="button" onClick={() => { setPhoto(''); startCamera('check-out'); }}>Retake check-out selfie</button></div>}
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={!checkOutConsent || !photo || capturePurpose !== 'check-out' || checkingOut}>{checkingOut ? 'Recording check-out...' : 'Record check-out with selfie'}</button>
      </form>}
      {todayAttendance?.checkOutAt && <p className="form-disclaimer" role="status">Checked out at {new Date(todayAttendance.checkOutAt).toLocaleTimeString()}.</p>}
      {notice.text && todayAttendance?.checkOutAt && <Notice notice={notice} />}
    </section>
    <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">HISTORY · {profile.name}</span><h2>Attendance by Rwanda-local date</h2></div><CalendarCheck size={22} /></div>{loading ? <p className="empty-state">Loading attendance history...</p> : attendance.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead><PaginatedRows rows={attendance} colSpan={4} renderRow={(record) => <tr key={record._id}><td>{record.dayKey}</td><td>{new Date(record.checkInAt).toLocaleTimeString()}</td><td>{record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString() : 'Not checked out'}</td><td><span className="status verified">Present</span></td></tr>} /></table></div> : <p className="empty-state">No attendance has been recorded yet.</p>}</section>
  </>;
}

function EmployeeLoanDashboard({ profile, applications, token, onVirtualLoanPayment, onAccountLoanPayment }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const employeeLoans = applications.filter((application) => (
    String(application.applicant?._id || application.applicant) === String(profile._id)
  ));

  useEffect(() => {
    let active = true;
    getMyBankAccounts(token)
      .then(({ accounts: loadedAccounts }) => { if (active) setAccounts(loadedAccounts || []); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const eligibleLoanAccounts = (application) => accounts.filter((account) => (
    account.status === 'active'
    && String(account.bankId?._id || account.bankId) === String(application.bank?._id || application.bank)
    && String(account.branchId?._id || account.branchId) === String(application.branchId?._id || application.branchId)
  ));

  return <>
    <section className="bank-panel transaction-panel">
      <div className="bank-panel-heading"><div><span className="eyebrow">EMPLOYEE LOANS</span><h2>My loans</h2></div><HandCoins size={22} /></div>
      <p className="form-disclaimer">You can repay only loans issued to you. Bank-account repayments debit an active account you own at the loan’s bank and sub-branch.</p>
      {error && <Notice notice={{ type: 'error', text: error }} />}
      {loading ? <p className="empty-state">Loading your loans...</p> : employeeLoans.length ? <div className="loan-list">{employeeLoans.map((application) => <article className="customer-loan-row" key={application._id}>
        <div className="customer-loan-summary"><strong><LoanMoney amount={application.amount} /> · {application.bankName}</strong><small>{application.purpose} · {application.branchName} · {application.termMonths} months</small>{application.annualInterestRate !== undefined && <small>{application.annualInterestRate}% annual interest · {currency(application.monthlyPayment)} estimated monthly payment</small>}<small>Outstanding principal: {currency(application.outstandingPrincipal)} · {currency(application.interestIncome)} interest paid</small></div>
        <span className={`loan-status ${application.status}`}>{application.status}</span>
        {application.status === 'approved' && <CustomerLoanRepayment application={application} accounts={eligibleLoanAccounts(application)} onAccountPay={onAccountLoanPayment} onVirtualPay={onVirtualLoanPayment} onAccountsRefresh={async () => { const { accounts: refreshedAccounts } = await getMyBankAccounts(token); setAccounts(refreshedAccounts || []); }} />}
        {application.repayments?.length > 0 && <div className="customer-payment-receipts">{application.repayments.slice(-3).reverse().map((item, index) => <div key={`${application._id}-receipt-${index}`}><strong>{currency(item.amount)} · {new Date(item.paidAt).toLocaleDateString()}</strong><small>{item.receiptNumber ? `Receipt ${item.receiptNumber} · ` : ''}{item.paymentMode === 'virtual_simulation' ? 'Virtual simulation' : item.paymentMode === 'account_transfer' ? 'Paid from bank account' : 'Received by bank staff'}{item.paymentChannel ? ` · ${item.paymentChannel.replaceAll('_', ' ')}` : ''}</small></div>)}</div>}
      </article>)}</div> : <p className="empty-state">No loans are linked to your employee account.</p>}
    </section>
  </>;
}

function BankStaffDirectoryDashboard({ token }) {
  const [staff, setStaff] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getBankStaff(token), getBankMembers(token)])
      .then(([staffResult, memberResult]) => {
        if (!active) return;
        setStaff(staffResult.staff);
        setMembers(memberResult.members);
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const activeStaff = staff.filter((employee) => employee.isVerified && employee.isActive !== false).length;
  const activeMembers = members.filter((member) => member.isApproved && member.isActive !== false).length;
  return <><ReportCards items={[{ label: 'Employees', value: staff.length, detail: `${activeStaff} active across bank` }, { label: 'Customer members', value: members.length, detail: `${activeMembers} active across bank` }, { label: 'Total people', value: staff.length + members.length, detail: 'All bank sub-branches' }]} /><section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK-WIDE DIRECTORY</span><h2>Employees and customer members</h2></div><UsersRound size={22} /></div><p className="form-disclaimer">View-only directory for all sub-branches in your assigned bank.</p>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <p className="empty-state">Loading bank-wide directory...</p> : <><h3>Bank employees</h3>{staff.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Employee</th><th>Role</th><th>Sub-branch</th><th>Status</th></tr></thead><PaginatedRows rows={staff} colSpan={4} renderRow={(employee) => <tr key={employee._id}><td><strong>{employee.name}</strong><br /><small>{employee.email}</small></td><td>{staffRoleName(employee.staffRole)}</td><td>{employee.branch?.branchName || 'Not assigned'}{employee.branch?.branchCode && <><br /><small>{employee.branch.branchCode}</small></>}</td><td>{employee.isActive === false ? 'Deactivated' : employee.isVerified ? 'Active' : 'Verification pending'}</td></tr>} /></table></div> : <p className="empty-state">No bank employees found.</p>}<h3>Customer members</h3>{members.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Member</th><th>Email</th><th>Sub-branch</th><th>Status</th><th>Registered</th></tr></thead><PaginatedRows rows={members} colSpan={5} renderRow={(member) => <tr key={member._id}><td><strong>{member.name}</strong></td><td>{member.email}</td><td>{member.branch?.branchName || 'Not assigned'}{member.branch?.branchCode && <><br /><small>{member.branch.branchCode}</small></>}</td><td>{member.isActive === false ? 'Deactivated' : member.isApproved ? 'Active' : member.isVerified ? 'Email verified · awaiting approval' : 'Pending email verification'}</td><td>{new Date(member.createdAt).toLocaleDateString()}</td></tr>} /></table></div> : <p className="empty-state">No customer members found.</p>}</>}</section></>;
}

function GeneralManagerDashboard({ banks, token, loanApplications }) {
  const [accounts, setAccounts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getBankAccounts(token), getBankStaff(token), getBankMembers(token)])
      .then(([accountResult, staffResult, memberResult]) => {
        if (!active) return;
        setAccounts(accountResult.accounts);
        setStaff(staffResult.staff);
        setMembers(memberResult.members);
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const totalBalances = accounts.reduce((total, account) => total + Number(account.balance || 0), 0);
  const pendingLoans = loanApplications.filter((loan) => loan.status === 'pending').length;
  return <><div className="bank-stats"><article className="balance-stat"><span>Assigned bank</span><strong>{banks[0]?.bankName || 'Not assigned'}</strong><small>Sub-branch overview · read only</small></article><article><span>Bank accounts</span><strong>{loading ? '—' : accounts.length}</strong><small>{currency(totalBalances)} total balance</small></article><article><span>Bank members</span><strong>{loading ? '—' : members.length}</strong><small>{members.filter((member) => member.isApproved).length} active</small></article><article><span>Pending loan requests</span><strong>{pendingLoans}</strong><small>{staff.length} staff in this sub-branch</small></article></div>{error && <p className="notice error" role="alert">{error}</p>}<section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">EXECUTIVE VIEW</span><h2>Recent loan activity</h2></div><HandCoins size={22} /></div>{loanApplications.length ? <div className="loan-list">{loanApplications.slice(0, 8).map((loan) => <article className="loan-row" key={loan._id}><div><strong>{loan.applicantName} · {currency(loan.amount)}</strong><small>{loan.bankName} · {loan.branchName} · {loan.purpose}</small></div><span className={`loan-status ${loan.status}`}>{loan.status}</span></article>)}</div> : <p className="empty-state">No loan activity is available for this sub-branch.</p>}</section></>;
}

function staffRoleName(role) {
  return role === 'bank_admin' ? 'Bank Admin' : BANK_STAFF_ROLES.find((item) => item.value === role)?.label || 'Sub-branch Manager';
}

function BankAccountManagementTable({ accounts, setAccounts, token, banks, canManageAccounts = false, onActivity }) {
  const [busyAccountId, setBusyAccountId] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const activeAccounts = accounts.filter((account) => account.status === 'active');
  const totalBalance = accounts.reduce((total, account) => total + Number(account.balance || 0), 0);

  async function toggleStatus(account) {
    const status = account.status === 'active' ? 'inactive' : 'active';
    setBusyAccountId(account._id);
    setNotice({ type: '', text: '' });
    try {
      const { account: updatedAccount } = await updateBankAccountStatus(token, account._id, status);
      setAccounts((current) => current.map((item) => item._id === account._id ? { ...item, ...updatedAccount } : item));
      setNotice({ type: 'success', text: `Bank account ${updatedAccount.accountNumber || account.accountNumber} ${status === 'active' ? 'activated' : 'deactivated'}.` });
      onActivity(`Bank account ${updatedAccount.accountNumber || account.accountNumber} was ${status === 'active' ? 'activated' : 'deactivated'}.`);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setBusyAccountId('');
    }
  }

  return <><ReportCards items={[{ label: 'Accounts', value: accounts.length, detail: `${activeAccounts.length} active · ${accounts.length - activeAccounts.length} inactive` }, { label: 'Total balances', value: currency(totalBalance), detail: 'Across listed accounts' }, { label: 'Average balance', value: currency(accounts.length ? totalBalance / accounts.length : 0), detail: 'Per bank account' }]} /><section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Bank accounts</h2></div><Building2 size={22} /></div>{notice.text && <div className="bank-notice"><Notice notice={notice} /></div>}{accounts.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Account</th><th>Customer</th><th>Bank</th><th>Balance</th><th>Status</th>{canManageAccounts && <th>Action</th>}</tr></thead><PaginatedRows rows={accounts} colSpan={canManageAccounts ? 6 : 5} renderRow={(account) => <tr key={account._id}><td>{account.accountNumber}<br /><small>{account.accountName}</small></td><td>{account.userId?.name || 'Customer'}<br /><small>{account.userId?.email}</small></td><td>{account.bankId?.bankName || banks.find((bank) => String(bank._id) === String(account.bankId))?.bankName || 'Bank'}</td><td>{currency(account.balance)}</td><td><span className={`status ${account.status === 'active' ? 'verified' : ''}`}>{account.status}</span></td>{canManageAccounts && <td><button className={account.status === 'active' ? 'delete-button' : 'activate-button'} type="button" disabled={busyAccountId === account._id} onClick={() => toggleStatus(account)}>{busyAccountId === account._id ? 'Saving...' : account.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>}</tr>} /></table></div> : <p className="empty-state">No bank accounts are available for this sub-branch.</p>}</section></>;
}

function StatCard({ label, value, detail, tone = 'violet' }) { return <article className={`stat-card ${tone}`}><div className="stat-label">{label}<span className="stat-menu">...</span></div><strong>{value}</strong><small>{detail}</small></article>; }

function AdminDashboard({ users, pagination, query, setQuery, onActivateUser, onUserCreated, section }) {
  const verified = users.filter((user) => user.isVerified).length;
  return <><div className="stats-grid"><StatCard label="Total users" value={pagination.total} detail="Accounts in your workspace" /><StatCard label="Verified accounts" value={verified} detail="On this page" tone="green" /><StatCard label="Pending verification" value={users.length - verified} detail="On this page" tone="orange" /><StatCard label="Admin status" value="Active" detail="Full workspace access" tone="blue" /></div><div className={`dashboard-grid role-grid ${section === 'users' ? 'directory-focus' : ''}`}><section className="panel users-panel"><PanelHeading eyebrow="ADMIN DIRECTORY" title="All accounts" icon={<UsersRound size={22} />} /><div className="directory-toolbar"><input value={query.search} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search name or email" /><select value={query.sortBy} onChange={(event) => setQuery({ ...query, page: 1, sortBy: event.target.value })}><option value="createdAt">Newest</option><option value="name">Name</option><option value="email">Email</option><option value="role">Role</option></select><select value={query.sortOrder} onChange={(event) => setQuery({ ...query, page: 1, sortOrder: event.target.value })}><option value="desc">Desc</option><option value="asc">Asc</option></select></div><UserList users={users} /><div className="pagination"><button className="icon-button" disabled={pagination.page <= 1} onClick={() => setQuery({ ...query, page: pagination.page - 1 })} title="Previous page"><ChevronLeft size={16} /></button><span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span><button className="icon-button" disabled={pagination.page >= pagination.totalPages} onClick={() => setQuery({ ...query, page: pagination.page + 1 })} title="Next page"><ChevronRight size={16} /></button></div></section>{section !== 'users' && <section className="panel insight-panel"><PanelHeading eyebrow="CONTROL CENTER" title="Workspace health" icon={<ShieldCheck size={22} />} /><div className="health-ring"><div><strong>{users.length ? Math.round((verified / users.length) * 100) : 0}%</strong><small>this page</small></div></div><div className="legend-row"><span className="dot green-dot" /> Verified <b>{verified}</b></div><div className="legend-row"><span className="dot orange-dot" /> Pending <b>{users.length - verified}</b></div></section>}</div></>;
}

function GuestFeedbackDashboard({ token }) {
  const [feedback, setFeedback] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    getGuestFeedback(token)
      .then(({ feedback: loadedFeedback }) => { if (active) setFeedback(loadedFeedback || []); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function markReviewed(item) {
    setUpdatingId(item._id);
    setError('');
    try {
      const { feedback: updated } = await markGuestFeedbackReviewed(token, item._id);
      setFeedback((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...updated } : entry));
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setUpdatingId('');
    }
  }

  const openFeedback = feedback.filter((item) => !item.reviewedAt).length;
  const averageRating = feedback.length
    ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1)
    : '—';
  const visibleFeedback = feedback.filter((item) => `${item.category} ${item.message}`.toLowerCase().includes(search.trim().toLowerCase()));

  return <>
    <ReportCards items={[
      { label: 'Feedback received', value: feedback.length, detail: 'Latest 200 anonymous submissions' },
      { label: 'Needs review', value: openFeedback, detail: 'Not yet marked reviewed' },
      { label: 'Average rating', value: averageRating, detail: 'Out of 5' }
    ]} />
    <section className="bank-panel transaction-panel">
      <div className="bank-panel-heading"><div><span className="eyebrow">GUEST EXPERIENCE</span><h2>Anonymous feedback</h2></div><MessageSquareText size={22} /></div>
      <p className="form-disclaimer">No guest identity or contact information is collected. Feedback is rate-limited and stored for administrator review.</p>
      <div className="directory-toolbar"><input aria-label="Search guest feedback" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search category or message" /></div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Loading guest feedback…</p> : visibleFeedback.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Submitted</th><th>Category</th><th>Rating</th><th>Feedback</th><th>Status</th><th>Action</th></tr></thead><PaginatedRows rows={visibleFeedback} colSpan={6} renderRow={(item) => <tr key={item._id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.category.replaceAll('-', ' ')}</td><td>{item.rating}/5</td><td className="guest-feedback-cell">{item.message}</td><td><span className={`status ${item.reviewedAt ? 'verified' : ''}`}>{item.reviewedAt ? 'Reviewed' : 'New'}</span></td><td>{!item.reviewedAt && <button className="manage-button" type="button" disabled={updatingId === item._id} onClick={() => markReviewed(item)}>{updatingId === item._id ? 'Saving…' : 'Mark reviewed'}</button>}</td></tr>} /></table></div> : !error && <p className="empty-state">No feedback matches your search.</p>}
    </section>
  </>;
}

function ManagerDashboard({ applications, systemAnnualInterestRate, section, notice, readOnly = false, onDecision, onRepayment, onDefault }) {
  const pending = applications.filter((application) => application.status === 'pending');
  const decided = applications.filter((application) => application.status !== 'pending');
  const visibleApplications = section === 'applications' ? applications : pending.slice(0, 4);
  const approved = applications.filter((application) => application.status === 'approved').length;
  const repaid = applications.filter((application) => application.status === 'repaid').length;
  const defaulted = applications.filter((application) => application.status === 'defaulted').length;
  const interestIncome = applications.reduce((total, loan) => total + (loan.interestIncome || 0), 0);
  const losses = applications.reduce((total, loan) => total + (loan.loss || 0), 0);
  return <>
    <ReportCards items={[{ label: 'Applications', value: applications.length, detail: `${pending.length} awaiting review` }, { label: 'Approved loans', value: approved, detail: `${repaid} fully repaid` }, { label: 'Defaults', value: defaulted, detail: 'Loans recorded in default' }, { label: 'Interest income', value: currency(interestIncome), detail: 'Collected from repayments' }, { label: 'Principal loss', value: currency(losses), detail: 'Outstanding principal defaulted' }, { label: 'Net profit', value: currency(interestIncome - losses), detail: 'Interest income less principal loss' }]} />
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">CREDIT REVIEW</span><h2>{section === 'applications' ? 'All loan applications' : 'Applications to review'}</h2></div><HandCoins size={23} /></div>
      {notice.text && <div className="bank-notice"><Notice notice={notice} /></div>}
      {visibleApplications.length ? <div className="user-table-wrap"><table className="user-table loan-management-table"><thead><tr><th>Applicant / amount</th><th>Bank / purpose</th><th>Review status</th><th>{readOnly ? 'Financial summary' : 'Management actions'}</th></tr></thead><PaginatedRows rows={visibleApplications} colSpan={4} renderRow={(application) => <LoanApplicationCard key={application._id} application={application} systemAnnualInterestRate={systemAnnualInterestRate} readOnly={readOnly} onDecision={onDecision} onRepayment={onRepayment} onDefault={onDefault} />} /></table></div> : <p className="empty-state">{decided.length ? 'No applications in this view.' : 'No applications have been submitted yet.'}</p>}
    </section>
  </>;
}

function LoanApplicationCard({ application, systemAnnualInterestRate, readOnly = false, onDecision, onRepayment, onDefault }) {
  const [repayment, setRepayment] = useState('');
  const [paymentChannel, setPaymentChannel] = useState('cash');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const quote = calculateLoanQuote(application.amount, systemAnnualInterestRate, application.termMonths);

  async function submitRepayment(event) {
    event.preventDefault();
    setSubmitting(true);
    if (await onRepayment(application._id, {
      amount: Number(repayment),
      paymentChannel,
      confirmed: paymentConfirmed
    })) {
      setRepayment('');
      setPaymentConfirmed(false);
    }
    setSubmitting(false);
  }

  return <tr>
    <td><strong>{application.applicantName}</strong><br /><small>{application.applicantEmail}</small><br /><LoanMoney amount={application.amount} /> requested</td>
    <td>{application.bankName} · {application.branchName}<br /><small>{application.purpose}</small><br /><small>{application.termMonths} months · {application.hasExternalLoans ? application.externalLoanDetails : 'No other bank loans'}</small></td>
    <td><span className={`loan-status ${application.status}`}>{application.status}</span><br /><small>Submitted {new Date(application.createdAt).toLocaleDateString()}</small>{application.annualInterestRate !== undefined && <><br /><small>{application.annualInterestRate}% annual rate</small></>}</td>
    <td className="loan-management-actions-cell">
      {application.status === 'pending' && (readOnly ? <p className="form-disclaimer">Awaiting a decision from the Branch Manager.</p> : <form className="loan-review-form" onSubmit={(event) => { event.preventDefault(); onDecision(application._id, 'approved'); }}>
        <p className="system-rate-label">System annual interest rate: <strong>{systemAnnualInterestRate}%</strong></p>
        {quote && <div className="loan-quote"><span>Monthly payment <strong>{currency(quote.monthlyPayment)}</strong></span><span>Expected interest <strong>{currency(quote.expectedInterest)}</strong></span></div>}
        <div className="decision-actions"><button type="submit"><CircleCheck size={16} /> Approve and disburse</button><button type="button" onClick={() => onDecision(application._id, 'declined')}><CircleX size={16} /> Decline</button></div>
      </form>)}
      {['approved', 'repaid', 'defaulted'].includes(application.status) && <>
        <div className="loan-table-finances"><span>Outstanding <strong>{currency(application.outstandingPrincipal)}</strong></span><span>Collected interest <strong>{currency(application.interestIncome)}</strong></span><span>Loss <strong>{currency(application.loss)}</strong></span><span>Net <strong>{currency((application.interestIncome || 0) - (application.loss || 0))}</strong></span><span>Monthly <strong>{currency(application.monthlyPayment)}</strong></span></div>
        {!readOnly && application.status === 'approved' && <>
          <form className="repayment-form" onSubmit={submitRepayment}>
            <label>Customer payment received (RWF)<input type="number" min="1" step="1" value={repayment} onChange={(event) => setRepayment(event.target.value)} required /></label>
            <label>Payment method<select value={paymentChannel} onChange={(event) => setPaymentChannel(event.target.value)}><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Bank transfer</option></select></label>
            <label className="check-row repayment-confirmation"><input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} required /> I confirm this payment has already been received from the customer.</label>
            <button className="bank-button" type="submit" disabled={submitting || !paymentConfirmed}>{submitting ? 'Recording...' : 'Record customer payment'}</button>
            <p className="form-disclaimer">Records a payment already collected; this does not debit a customer account. A receipt number is generated.</p>
          </form>
          <details className="loan-default-details"><summary>Mark default</summary><form className="loan-default-form" onSubmit={(event) => { event.preventDefault(); onDefault(application._id); }}><label className="check-row"><input type="checkbox" checked={confirmDefault} onChange={(event) => setConfirmDefault(event.target.checked)} required /> Confirm remaining principal will be recorded as a loss.</label><button className="delete-button" type="submit" disabled={!confirmDefault}>Confirm default</button></form></details>
        </>}
        {application.repayments?.length > 0 && <div className="repayment-history">{application.repayments.slice(-3).reverse().map((item, index) => <div key={`${application._id}-payment-${index}`}><span>{new Date(item.paidAt).toLocaleDateString()} · {currency(item.amount)}</span><small>{item.receiptNumber ? `Receipt ${item.receiptNumber} · ` : ''}{item.paymentChannel ? `${item.paymentChannel.replaceAll('_', ' ')} · ` : ''}{currency(item.interestPortion)} interest / {currency(item.principalPortion)} principal</small></div>)}</div>}
      </>}
    </td>
  </tr>;
}

function UserDashboard({ profile, banks, applications, notice, setNotice, onLoanApplication, onVirtualLoanPayment, onAccountLoanPayment, onRefreshBanks, onActivity, token, systemAnnualInterestRate }) {
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhoneNumber, setDepositPhoneNumber] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [loanForm, setLoanForm] = useState({ bankId: '', branchId: '', amount: '', termMonths: '12', purpose: '', hasExternalLoans: false, externalLoanDetails: '' });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState({ bankId: '', branchId: '', accountName: profile.name || '' });
  const [transferForm, setTransferForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
  const [recipientSearch, setRecipientSearch] = useState('');
  const [transferRecipient, setTransferRecipient] = useState(null);
  const [recipientLookup, setRecipientLookup] = useState({ status: 'idle', message: '', recipients: [] });
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [submittingLoan, setSubmittingLoan] = useState(false);
  const [refreshingBanks, setRefreshingBanks] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [accountNotice, setAccountNotice] = useState({ type: '', text: '' });
  const [depositNotice, setDepositNotice] = useState({ type: '', text: '' });
  const [transferNotice, setTransferNotice] = useState({ type: '', text: '' });
  const activeAccounts = bankAccounts.filter((account) => account.status === 'active');
  const eligibleLoanAccounts = (application) => activeAccounts.filter((account) =>
    String(account.bankId?._id || account.bankId) === String(application.bank)
    && String(account.branchId?._id || account.branchId) === String(application.branchId)
  );
  const balance = activeAccounts.reduce((total, account) => total + Number(account.balance || 0), 0);
  const latestApplications = applications.slice(0, 3);
  const transactions = bankAccounts.flatMap((account) => (account.transactions || []).map((transaction) => ({ ...transaction, accountName: account.accountName, accountNumber: account.accountNumber })))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const activeLoan = applications.find((application) => ['approved', 'defaulted'].includes(application.status));
  const hasExistingApplication = applications.length > 0;
  const selectedLoanBank = banks.find((bank) => bank._id === loanForm.bankId);
  const selectedAccountBank = banks.find((bank) => bank._id === accountForm.bankId);
  const selectedAccountBranches = selectedAccountBank?.branches.filter((branch) => /^[\da-f]{24}$/i.test(String(branch._id || ''))) || [];

  useEffect(() => {
    if (!token) return;
    const loadAccounts = () => getMyBankAccounts(token)
      .then(({ accounts }) => {
        const loadedAccounts = accounts || [];
        setBankAccounts(loadedAccounts);
        setDepositAccountId((current) => loadedAccounts.some((account) => account._id === current && account.status === 'active') ? current : loadedAccounts.find((account) => account.status === 'active')?._id || '');
      })
      .catch(() => setBankAccounts([]));
    loadAccounts();
    const refreshTimer = window.setInterval(loadAccounts, 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [token]);

  useEffect(() => {
    const name = recipientSearch.trim();
    if (transferRecipient || name.length < 2) {
      setRecipientLookup({ status: 'idle', message: '', recipients: [] });
      return;
    }

    let isCurrentSearch = true;
    setRecipientLookup({ status: 'loading', message: '', recipients: [] });
    const searchTimer = window.setTimeout(() => {
      searchTransferRecipients(token, name)
      .then(({ recipients }) => {
        if (!isCurrentSearch) return;
        setRecipientLookup({ status: 'success', message: '', recipients });
      })
      .catch((error) => {
        if (!isCurrentSearch) return;
        setRecipientLookup({ status: 'error', message: error.message, recipients: [] });
      });
    }, 300);

    return () => {
      isCurrentSearch = false;
      window.clearTimeout(searchTimer);
    };
  }, [token, recipientSearch, transferRecipient]);

  const submitDeposit = async (event) => {
    event.preventDefault();
    if (!activeAccounts.length) return setDepositNotice({ type: 'error', text: 'Open an active bank account before making a deposit.' });
    if (!depositAccountId) return setDepositNotice({ type: 'error', text: 'Select an account for this deposit.' });
    setSubmittingDeposit(true);
    try {
      const { payment, message } = await depositToBankAccount(token, depositAccountId, Number(depositAmount), depositPhoneNumber);
      if (payment?.status === 'pending') {
        setDepositAmount('');
        setDepositPhoneNumber('');
        onActivity(`A mobile-money deposit request for ${currency(payment.amount)} was started.`);
      }
      setDepositNotice({ type: payment?.status === 'failed' ? 'error' : 'success', text: message || 'Payment request sent. Approve it on your mobile money phone.' });
    } catch (error) {
      setDepositNotice({ type: 'error', text: error.message });
    } finally {
      setSubmittingDeposit(false);
    }
  };
  const submitLoan = async (event) => {
    event.preventDefault();
    if (hasExistingApplication) return setNotice({ type: 'error', text: 'You have already submitted a loan application.' });
    if (!loanForm.bankId || !loanForm.branchId) return setNotice({ type: 'error', text: 'Select a bank and sub-branch for this loan.' });
    if (loanForm.hasExternalLoans) return setNotice({ type: 'error', text: 'Applicants with an outstanding loan at another bank are not eligible.' });
    if (Number(loanForm.amount) <= 0) return setNotice({ type: 'error', text: 'Enter a loan amount greater than zero.' });
    if (!bankAccounts.some((account) => String(account.bankId?._id || account.bankId) === loanForm.bankId && String(account.branchId) === loanForm.branchId && account.status === 'active')) {
      return setNotice({ type: 'error', text: 'Open an active bank account at this bank and sub-branch before applying.' });
    }
    setSubmittingLoan(true);
    try {
      const submitted = await onLoanApplication({ ...loanForm, amount: Number(loanForm.amount), termMonths: Number(loanForm.termMonths), externalLoanDetails: loanForm.hasExternalLoans ? loanForm.externalLoanDetails.trim() : 'None reported' });
      if (submitted) setLoanForm({ ...loanForm, amount: '', purpose: '', hasExternalLoans: false, externalLoanDetails: '' });
    } finally {
      setSubmittingLoan(false);
    }
  };

  async function handleCreateAccount(event) {
    event.preventDefault();
    if (!/^[\da-f]{24}$/i.test(accountForm.bankId) || !/^[\da-f]{24}$/i.test(accountForm.branchId)) {
      setAccountNotice({ type: 'error', text: 'Select a bank and a valid sub-branch. If branches are unavailable, refresh the page or ask an administrator to add a branch.' });
      return;
    }

    setSubmittingAccount(true);
    setAccountNotice({ type: '', text: '' });
    try {
      const { account } = await createBankAccount(token, {
        bankId: accountForm.bankId,
        branchId: accountForm.branchId,
        accountName: accountForm.accountName || `${profile.name} account`
      });
      setBankAccounts((current) => [account, ...current]);
      setAccountForm({ bankId: '', branchId: '', accountName: profile.name || '' });
      setAccountNotice({ type: 'success', text: `Bank account generated: ${account.accountNumber}` });
      onActivity('A customer bank account was opened.');
    } catch (error) {
      setAccountNotice({ type: 'error', text: error.message });
    } finally {
      setSubmittingAccount(false);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!transferForm.fromAccountId || !transferRecipient?.accountId || transferForm.toAccountId !== transferRecipient.accountId) {
      setTransferNotice({ type: 'error', text: 'Choose your source account and select a verified recipient.' });
      return;
    }

    setSubmittingTransfer(true);
    try {
      await transferBetweenAccounts(token, {
        fromAccountId: transferForm.fromAccountId,
        toAccountId: transferForm.toAccountId,
        amount: Number(transferForm.amount),
        description: transferForm.description || 'User transfer'
      });
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', description: '' });
      setRecipientSearch('');
      setTransferRecipient(null);
      setRecipientLookup({ status: 'idle', message: '', recipients: [] });
      const { accounts } = await getMyBankAccounts(token);
      setBankAccounts(accounts || []);
      setTransferNotice({ type: 'success', text: 'Transfer completed successfully.' });
      onActivity(`A transfer of ${currency(Number(transferForm.amount))} was completed.`);
    } catch (error) {
      setTransferNotice({ type: 'error', text: error.message });
    } finally {
      setSubmittingTransfer(false);
    }
  }

  return <>
    {(depositNotice.text || transferNotice.text) && <div className="bank-notice"><Notice notice={transferNotice.text ? transferNotice : depositNotice} /></div>}
    <div className="bank-stats"><article className="balance-stat"><span>Available balance</span><strong>{currency(balance)}</strong><small>{activeAccounts.length} active bank account{activeAccounts.length === 1 ? '' : 's'}</small></article><article><span>Loan requests</span><strong>{applications.length}</strong><small>{applications.filter((application) => application.status === 'pending').length} under review</small></article><article><span>Account holder</span><strong>{profile.name}</strong><small>Verified customer</small></article></div>
    <div className="bank-grid"><section className="bank-panel" id="customer-deposit"><div className="bank-panel-heading"><div><span className="eyebrow">MOVE MONEY</span><h2>Make a deposit</h2></div><ArrowDownToLine size={23} /></div><form className="bank-form" onSubmit={submitDeposit}><label htmlFor="deposit-account">Deposit into</label><select className="bank-text-input" id="deposit-account" value={depositAccountId} onChange={(event) => setDepositAccountId(event.target.value)} required disabled={!activeAccounts.length}><option value="">{activeAccounts.length ? 'Select an account' : 'Open a bank account first'}</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.accountName} · {account.accountNumber}</option>)}</select><label htmlFor="deposit-phone">Mobile money phone number</label><input className="bank-text-input" id="deposit-phone" type="tel" autoComplete="tel" value={depositPhoneNumber} onChange={(event) => setDepositPhoneNumber(event.target.value)} placeholder="0781234567" required disabled={!activeAccounts.length} /><label htmlFor="deposit-amount">Deposit amount (RWF)</label><div className="money-input"><img className="rf-currency-logo" src="/rf-currency.svg" alt="Rwandan franc" /><input id="deposit-amount" type="number" min="1" step="1" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="0" required disabled={!activeAccounts.length} /></div><button className="bank-button" type="submit" disabled={!activeAccounts.length || submittingDeposit}>{submittingDeposit ? 'Sending payment request...' : <><ArrowDownToLine size={17} /> Pay with mobile money</>}</button></form>{depositNotice.text && <div className="bank-notice"><Notice notice={depositNotice} /></div>}<p className="form-disclaimer">Approve the mobile-money prompt on your phone. Your account is credited after Paypack confirms payment.</p></section>
      <section className="bank-panel" id="customer-loan-application"><div className="bank-panel-heading"><div><span className="eyebrow">CREDIT</span><h2>Apply for a loan</h2></div><HandCoins size={23} /></div>{hasExistingApplication ? <div className="loan-application-message" role="status"><strong>{activeLoan ? 'Another loan application is not available yet.' : 'You already have a loan application.'}</strong><p>{activeLoan ? `You currently have a loan with ${activeLoan.bankName}. Please settle it before applying for another loan.` : 'Check Your loan requests below for the latest update.'}</p></div> : <form className="bank-form" onSubmit={submitLoan}>
        <label htmlFor="loan-bank">Bank</label><select className="bank-text-input" id="loan-bank" value={loanForm.bankId} onChange={(event) => setLoanForm({ ...loanForm, bankId: event.target.value, branchId: '' })} required><option value="">Select a bank</option>{banks.map((bank) => { const hasSubBranches = bank.branches?.some((branch) => /^[\da-f]{24}$/i.test(String(branch._id || ''))); return <option key={bank._id} value={bank._id} disabled={!hasSubBranches}>{bank.bankName}{bank.accountNumber ? ` · ${bank.accountNumber}` : ''}{hasSubBranches ? '' : ' (no sub-branches)'}</option>; })}</select>
        <label htmlFor="loan-branch">Sub-branch</label><select className="bank-text-input" id="loan-branch" value={loanForm.branchId} onChange={(event) => setLoanForm({ ...loanForm, branchId: event.target.value })} required disabled={!selectedLoanBank?.branches.length}><option value="">{!selectedLoanBank ? 'Select a bank first' : selectedLoanBank.branches.length ? 'Select a sub-branch' : 'No sub-branches available'}</option>{selectedLoanBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}{branch.branchCode ? ` · ${branch.branchCode}` : ''}</option>)}</select>
        <label htmlFor="loan-amount">Amount requested (RWF)</label><div className="money-input"><img className="rf-currency-logo" src="/rf-currency.svg" alt="Rwandan franc" /><input id="loan-amount" type="number" min="1" step="1" value={loanForm.amount} onChange={(event) => setLoanForm({ ...loanForm, amount: event.target.value })} placeholder="10000" required /></div>
        <label htmlFor="loan-term">Requested term (months)</label><input className="bank-text-input" id="loan-term" type="number" min="1" max="360" step="1" value={loanForm.termMonths} onChange={(event) => setLoanForm({ ...loanForm, termMonths: event.target.value })} required />
        <label htmlFor="loan-purpose">What is the loan for?</label><input className="bank-text-input" id="loan-purpose" value={loanForm.purpose} onChange={(event) => setLoanForm({ ...loanForm, purpose: event.target.value })} placeholder="e.g. Home improvement" required />
        <label className="check-row"><input type="checkbox" checked={loanForm.hasExternalLoans} onChange={(event) => setLoanForm({ ...loanForm, hasExternalLoans: event.target.checked })} /> I have an outstanding loan with another bank</label>{loanForm.hasExternalLoans && <p className="form-disclaimer">Applicants with an outstanding loan at another bank are not eligible.</p>}
        {notice.type === 'error' && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={loanForm.hasExternalLoans || hasExistingApplication || submittingLoan}>{submittingLoan ? 'Submitting...' : hasExistingApplication ? 'Application already submitted' : <><HandCoins size={17} /> Submit for review</>}</button><p className="form-disclaimer">System annual interest rate: {systemAnnualInterestRate}%. Approved funds are deposited to your account at this bank.</p>
      </form>}</section></div>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK ACCOUNT</span><h2>Open a bank account</h2></div><button className="text-button" type="button" disabled={refreshingBanks} onClick={async () => { setRefreshingBanks(true); await onRefreshBanks(); setRefreshingBanks(false); }}>{refreshingBanks ? 'Loading banks...' : 'Refresh banks'}</button></div>
      <form className="bank-form" onSubmit={handleCreateAccount}>
        <label htmlFor="bank-account-bank">Bank</label>
        <select className="bank-text-input" id="bank-account-bank" value={accountForm.bankId} onChange={(event) => setAccountForm({ ...accountForm, bankId: event.target.value, branchId: '' })} required><option value="">Select a bank</option>{banks.map((bank) => { const hasSubBranches = bank.branches?.some((branch) => /^[\da-f]{24}$/i.test(String(branch._id || ''))); return <option key={bank._id} value={bank._id} disabled={!hasSubBranches}>{bank.bankName}{bank.accountNumber ? ` · ${bank.accountNumber}` : ''}{hasSubBranches ? '' : ' (no sub-branches)'}</option>; })}</select>
        <label htmlFor="bank-account-branch">Sub-branch</label>
        <select className="bank-text-input" id="bank-account-branch" value={accountForm.branchId} onChange={(event) => setAccountForm({ ...accountForm, branchId: event.target.value })} required disabled={!selectedAccountBranches.length}><option value="">{!selectedAccountBank ? 'Select a bank first' : selectedAccountBranches.length ? 'Select a sub-branch' : selectedAccountBank.branches.length ? 'Branch IDs unavailable. Refresh the page.' : 'No sub-branches available'}</option>{selectedAccountBranches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}{branch.branchCode ? ` · ${branch.branchCode}` : ''}</option>)}</select>
        <label htmlFor="bank-account-name">Account name</label>
        <input className="bank-text-input" id="bank-account-name" value={accountForm.accountName} onChange={(event) => setAccountForm({ ...accountForm, accountName: event.target.value })} placeholder="Savings account" required />
        <button className="bank-button" type="submit" disabled={submittingAccount}>{submittingAccount ? 'Opening account...' : 'Open bank account'}</button>
      </form>
      {accountNotice.text && <div className="bank-notice"><Notice notice={accountNotice} /></div>}
      {bankAccounts.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Account</th><th>Bank</th><th>Status</th><th>Available balance</th></tr></thead><PaginatedRows rows={bankAccounts} colSpan={4} renderRow={(account) => <tr key={account._id}><td><strong>{account.accountName}</strong><br /><small>{account.accountNumber}</small></td><td>{account.bankId?.bankName || 'Bank'}</td><td><span className={`status ${account.status === 'active' ? 'verified' : ''}`}>{account.status}</span></td><td><strong>{currency(account.balance)}</strong></td></tr>} /></table></div> : <p className="empty-state">No bank accounts opened yet.</p>}
    </section>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">TRANSFER</span><h2>Move funds between accounts</h2></div><ArrowRight size={23} /></div>
      <form className="bank-form" onSubmit={handleTransfer}>
        <label htmlFor="transfer-from">From account</label>
        <select className="bank-text-input" id="transfer-from" value={transferForm.fromAccountId} onChange={(event) => setTransferForm({ ...transferForm, fromAccountId: event.target.value })} required disabled={!activeAccounts.length}><option value="">Select source account</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.accountName} · {account.accountNumber}</option>)}</select>
        <label htmlFor="transfer-to">Recipient name</label>
        <input className="bank-text-input" id="transfer-to" autoComplete="off" value={recipientSearch} onChange={(event) => { setRecipientSearch(event.target.value); setTransferRecipient(null); setTransferForm({ ...transferForm, toAccountId: '' }); }} placeholder="Search recipient name" aria-describedby="recipient-search-help" required={!transferRecipient} />
        <small className="form-disclaimer" id="recipient-search-help">Enter at least 2 letters, then select the matching recipient and account.</small>
        {recipientLookup.status === 'loading' && <p className="form-disclaimer" role="status">Searching recipients...</p>}
        {recipientLookup.status === 'error' && <p className="form-disclaimer" role="alert">{recipientLookup.message}</p>}
        {recipientSearch.trim().length >= 2 && recipientLookup.status === 'success' && !recipientLookup.recipients.length && <p className="form-disclaimer" role="status">No active recipient accounts found.</p>}
        {recipientLookup.recipients.length > 0 && !transferRecipient && <div className="recipient-options" role="listbox" aria-label="Matching recipients">{recipientLookup.recipients.map((recipient) => <button className="recipient-option" type="button" role="option" aria-selected="false" key={recipient.accountId} onClick={() => { setTransferRecipient(recipient); setTransferForm({ ...transferForm, toAccountId: recipient.accountId }); setRecipientSearch(''); setRecipientLookup({ status: 'idle', message: '', recipients: [] }); }}><strong>{recipient.name}</strong><span>{recipient.accountNumber}</span></button>)}</div>}
        {transferRecipient && <div className="recipient-selected"><span>Recipient: <strong>{transferRecipient.name}</strong> · {transferRecipient.accountNumber}</span><button type="button" onClick={() => { setTransferRecipient(null); setTransferForm({ ...transferForm, toAccountId: '' }); }}>Change</button></div>}
        <label htmlFor="transfer-amount">Amount (RWF)</label>
        <input className="bank-text-input" id="transfer-amount" type="number" min="1" step="1" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} required />
        <label htmlFor="transfer-desc">Transfer note</label>
        <input className="bank-text-input" id="transfer-desc" value={transferForm.description} onChange={(event) => setTransferForm({ ...transferForm, description: event.target.value })} placeholder="Rent payment" />
        <button className="bank-button" type="submit" disabled={submittingTransfer || !activeAccounts.length}>{submittingTransfer ? 'Transferring...' : 'Transfer funds'}</button>
      </form>
    </section>
    <section className="bank-panel transaction-panel" id="customer-activity"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>All transactions</h2></div><Wallet size={22} /></div>{transactions.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Date</th><th>Account</th><th>Transaction</th><th>Amount</th><th>Balance after</th></tr></thead><PaginatedRows rows={transactions} colSpan={5} renderRow={(transaction) => <tr key={`${transaction.accountNumber}-${transaction._id}`}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td>{transaction.accountName}<br /><small>{transaction.accountNumber}</small></td><td>{transaction.description || transaction.type.replaceAll('_', ' ')}</td><td className={['deposit', 'transfer_in', 'loan_disbursement'].includes(transaction.type) ? 'financial-positive' : 'financial-negative'}>{['deposit', 'transfer_in', 'loan_disbursement'].includes(transaction.type) ? '+' : '-'}{currency(transaction.amount)}</td><td>{currency(transaction.balanceAfter)}</td></tr>} /></table></div> : <p className="empty-state">Your account activity will appear here.</p>}</section>
    <section className="bank-panel loans-panel" id="customer-applications"><div className="bank-panel-heading"><div><span className="eyebrow">YOUR LOANS</span><h2>My loans &amp; repayments</h2></div><Clock3 size={22} /></div><p className="loan-repayment-intro">You can make repayments on your own approved loan below, using your eligible bank account or the virtual payment simulator.</p>{latestApplications.length ? <div className="loan-list">{latestApplications.map((application) => <article className="customer-loan-row" key={application._id}><div className="customer-loan-summary"><strong><LoanMoney amount={application.amount} /> · {application.bankName}</strong><small>{application.purpose} · {application.branchName} · {application.termMonths} months</small>{application.annualInterestRate !== undefined && <small>{application.annualInterestRate}% annual interest · {currency(application.monthlyPayment)} estimated monthly payment</small>}<small>Outstanding principal: {currency(application.outstandingPrincipal)} · {currency(application.interestIncome)} interest paid</small></div><span className={`loan-status ${application.status}`}>{application.status}</span>{application.status === 'approved' && <CustomerLoanRepayment application={application} accounts={eligibleLoanAccounts(application)} onAccountPay={onAccountLoanPayment} onVirtualPay={onVirtualLoanPayment} onAccountsRefresh={async () => { const { accounts } = await getMyBankAccounts(token); setBankAccounts(accounts || []); }} />}{application.repayments?.length > 0 && <div className="customer-payment-receipts">{application.repayments.slice(-3).reverse().map((item, index) => <div key={`${application._id}-receipt-${index}`}><strong>{currency(item.amount)} · {new Date(item.paidAt).toLocaleDateString()}</strong><small>{item.receiptNumber ? `Receipt ${item.receiptNumber} · ` : ''}{item.paymentMode === 'virtual_simulation' ? 'Virtual simulation' : item.paymentMode === 'account_transfer' ? 'Paid from bank account' : 'Received by bank staff'}{item.paymentChannel ? ` · ${item.paymentChannel.replaceAll('_', ' ')}` : ''}</small></div>)}</div>}</article>)}</div> : <p className="empty-state">You have not applied for a loan yet.</p>}</section>
  </>;
}

function CustomerLoanRepayment({ application, accounts, onAccountPay, onVirtualPay, onAccountsRefresh }) {
  const [amount, setAmount] = useState(String(application.monthlyPayment || ''));
  const [method, setMethod] = useState(accounts.length ? 'account' : 'virtual');
  const [accountId, setAccountId] = useState(accounts[0]?._id || '');
  const [channel, setChannel] = useState('mtn_mobile_money');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const requestKey = useRef(null);
  const eligibleAccountIds = accounts.map((account) => account._id).join(':');

  useEffect(() => {
    if (!accounts.some((account) => account._id === accountId)) {
      const nextAccount = accounts[0]?._id || '';
      setAccountId(nextAccount);
      if (nextAccount) setMethod('account');
    }
  }, [eligibleAccountIds, accountId]);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    const signature = `${amount}:${method}:${accountId}:${channel}:${simulateFailure}`;
    if (requestKey.current?.signature !== signature) {
      requestKey.current = { signature, key: window.crypto.randomUUID() };
    }
    try {
      const payment = method === 'account'
        ? await onAccountPay(application._id, { amount: Number(amount), accountId, idempotencyKey: requestKey.current.key })
        : await onVirtualPay(application._id, { amount: Number(amount), channel, simulateFailure, idempotencyKey: requestKey.current.key });
      if (!payment) {
        setNotice({ type: 'error', text: 'Payment was not confirmed. No loan repayment was recorded.' });
        return;
      }
      if (payment.status === 'error') {
        setNotice({ type: 'error', text: `${payment.message || 'The payment could not be confirmed.'} If the request was interrupted, retry with the same details to check its outcome safely.` });
        return;
      }
      requestKey.current = null;
      let accountRefreshWarning = '';
      if (payment.status === 'succeeded' && method === 'account') {
        try {
          await onAccountsRefresh();
        } catch (refreshError) {
          accountRefreshWarning = ` The payment succeeded, but the account balance could not refresh: ${refreshError.message}`;
        }
      }
      setNotice({
        type: 'success',
        text: method === 'account'
          ? `Payment completed. Receipt: ${payment.receiptNumber}. Your account was debited.${accountRefreshWarning}`
          : payment.status === 'succeeded'
            ? `Simulation succeeded. Receipt: ${payment.receiptNumber}. No real funds moved.`
            : `Simulation declined. Reference: ${payment.reference}. No repayment was recorded.`
      });
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="customer-repayment-form" onSubmit={submit}>
    <div><label>Repayment amount (RWF)<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="account" disabled={!accounts.length}>Pay from my bank account{accounts.length ? '' : ' (no eligible account)'}</option><option value="virtual">Virtual payment simulation</option></select></label></div>
    {!accounts.length && <p className="form-disclaimer">No active account is available at this loan’s bank and sub-branch. Open or activate an eligible account before choosing account repayment.</p>}
    {method === 'account' ? <label>Debit account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Select an eligible account</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.accountName} · {account.accountNumber} · {currency(account.balance)} available</option>)}</select></label> : <><label>Virtual payment method<select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="mtn_mobile_money">MTN Mobile Money (simulation)</option><option value="airtel_mobile_money">Airtel Money (simulation)</option><option value="bank_transfer">Bank transfer (simulation)</option><option value="virtual_account">Virtual account (simulation)</option></select></label><label className="check-row"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} /> Simulate a declined payment (test only)</label></>}
    {notice.text && <Notice notice={notice} />}
    <p className="form-disclaimer">{method === 'account' ? 'Your selected account will be debited immediately. The account must have sufficient available funds.' : 'Demo only: a successful test updates the loan ledger and issues a receipt. It does not debit an account or transfer real money.'}</p>
    <button className="bank-button" type="submit" disabled={submitting || (method === 'account' && (!accounts.length || !accountId))}>{submitting ? 'Processing payment...' : 'Pay Loan'}</button>
  </form>;
}

function BankStaffDashboard({ banks, token, profile, canManageAccounts = false, onActivity }) {
  const [accounts, setAccounts] = useState([]);
  const isBankAdmin = profile.staffRole === 'bank_admin';
  const [selectedBankId, setSelectedBankId] = useState(String(profile.bankId?._id || profile.bankId || ''));
  const [selectedBranchId, setSelectedBranchId] = useState(isBankAdmin ? '' : String(profile.branchId?._id || profile.branchId || ''));
  const [loadError, setLoadError] = useState('');
  const selectedBank = banks.find((bank) => String(bank._id) === selectedBankId);

  useEffect(() => {
    if (!banks.length) {
      setSelectedBankId('');
      setSelectedBranchId('');
      setAccounts([]);
      return;
    }
    if (!banks.some((bank) => String(bank._id) === selectedBankId)) {
      setSelectedBankId(String(banks[0]._id));
      setSelectedBranchId(isBankAdmin ? '' : String(banks[0].branches?.[0]?._id || ''));
    }
  }, [banks, selectedBankId, isBankAdmin]);

  useEffect(() => {
    if (!token || !selectedBankId || (!isBankAdmin && !selectedBranchId)) {
      setAccounts([]);
      return;
    }
    let active = true;
    setLoadError('');
    getBankAccounts(token, { bankId: selectedBankId, ...(selectedBranchId ? { branchId: selectedBranchId } : {}) })
      .then(({ accounts: loadedAccounts }) => { if (active) setAccounts(loadedAccounts || []); })
      .catch((error) => {
        if (!active) return;
        setAccounts([]);
        setLoadError(error.message);
      });
    return () => { active = false; };
  }, [selectedBankId, selectedBranchId, token, isBankAdmin]);

  return <><section className="panel bank-accounts-panel"><PanelHeading eyebrow="BANK STAFF DASHBOARD" title="Bank account ledger" icon={<Building2 size={22} />} />
    <div className="directory-toolbar"><label>Bank<select value={selectedBankId} onChange={(event) => { const bank = banks.find((item) => String(item._id) === event.target.value); setSelectedBankId(event.target.value); setSelectedBranchId(isBankAdmin ? '' : String(bank?.branches?.[0]?._id || '')); }} disabled={!banks.length}><option value="">{banks.length ? 'Select bank' : 'No bank assigned'}</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select></label><label>Sub-branch<select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} disabled={!selectedBank?.branches?.length}><option value="">{isBankAdmin ? 'All sub-branches' : 'Select sub-branch'}</option>{selectedBank?.branches?.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select></label></div>
    {!banks.length && <p className="empty-state">No bank is assigned to this Accounts Manager account. Ask the System Admin to assign a bank and sub-branch.</p>}
    {loadError && <p className="notice error" role="alert">{loadError}</p>}
  </section>{selectedBankId && (isBankAdmin || selectedBranchId) && <BankAccountManagementTable accounts={accounts} setAccounts={setAccounts} token={token} banks={banks} canManageAccounts={canManageAccounts} onActivity={onActivity} />}</>;
}

function ProfileDashboard({ profile, form, loading, notice, setForm, onSave }) { return <div className="dashboard-grid role-grid"><section className="panel profile-panel"><PanelHeading eyebrow="PERSONAL DETAILS" title="My profile" icon={<UserRound size={22} />} /><form onSubmit={onSave} className="form-stack"><Field icon={<UserRound size={17} />} name="name" placeholder="Full name" value={form.name || profile.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email || profile.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="New password (optional)" value={form.password || ''} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>Save changes <Check size={17} /></button></form></section><section className="panel account-card"><PanelHeading eyebrow="ACCOUNT SNAPSHOT" title="Your details" icon={<ShieldCheck size={22} />} /><div className="account-summary"><div className="large-avatar">{profile.name?.charAt(0).toUpperCase()}</div><strong>{profile.name}</strong><span>{profile.email}</span><span className="verified-label"><Check size={14} /> Verified account</span></div></section></div>; }

function calculateLoanQuote(principal, annualRate, termMonths) {
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate) || annualRate < 0 || !Number.isInteger(termMonths) || termMonths < 1) return null;
  const monthlyRate = annualRate / 1200;
  const rawPayment = monthlyRate === 0 ? principal / termMonths : principal * monthlyRate * ((1 + monthlyRate) ** termMonths) / (((1 + monthlyRate) ** termMonths) - 1);
  return { monthlyPayment: Math.round(rawPayment), expectedInterest: Math.max(0, Math.round(rawPayment * termMonths - principal)) };
}

function LoanMoney({ amount }) { return <span className="loan-money"><img src="/rf-currency.svg" alt="Rwandan franc" />{currency(amount)}</span>; }

function isKigaliCheckOutTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kigali',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute >= 17 * 60;
}

function currency(amount) { return new Intl.NumberFormat('rw-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(amount || 0); }

function PanelHeading({ eyebrow, title, icon }) { return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{icon}</div>; }
function UserList({ users, onActivate = async (userId) => { await activateUser(localStorage.getItem('loarn_token'), userId); window.location.reload(); } }) {
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [actionNotice, setActionNotice] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  function startEdit(user) {
    setEditingUser(user);
    setEditName(user.name || '');
    setDeletingUser(null);
    setDeleteConfirmed(false);
    setActionNotice({ type: '', text: '' });
  }

  function startDelete(user) {
    setDeletingUser(user);
    setEditingUser(null);
    setDeleteConfirmed(false);
    setActionNotice({ type: '', text: '' });
  }

  async function saveUser(event) {
    event.preventDefault();
    setSaving(true);
    setActionNotice({ type: '', text: '' });
    try {
      await updateUser(localStorage.getItem('loarn_token'), editingUser._id, { name: editName.trim() });
      window.location.reload();
    } catch (error) {
      setActionNotice({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(event) {
    event.preventDefault();
    setSaving(true);
    setActionNotice({ type: '', text: '' });
    try {
      await deleteUser(localStorage.getItem('loarn_token'), deletingUser._id);
      window.location.reload();
    } catch (error) {
      setActionNotice({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="user-table-wrap"><table className="user-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user._id}><td><div className="table-user"><div className="avatar">{user.name?.charAt(0).toUpperCase()}</div><strong>{user.name}</strong></div></td><td>{user.email}</td><td><span className="role-text">{user.role}</span></td><td><span className={`status ${user.isVerified ? 'verified' : ''}`}>{user.isVerified ? 'Verified' : 'Pending'}</span></td><td><div className="table-actions"><button className="manage-button" type="button" onClick={() => startEdit(user)}>Edit</button>{!user.isVerified && <button className="activate-button" type="button" onClick={() => onActivate(user._id)}>Activate</button>}<button className="delete-button" type="button" onClick={() => startDelete(user)}>Delete</button></div></td></tr>)}</tbody></table>{!users.length && <p className="empty-state">No users to show yet.</p>}</div>
    {editingUser && <form className="user-action-form" onSubmit={saveUser}>
      <header><div><span className="eyebrow">EDIT ACCOUNT</span><h3>{editingUser.name}</h3></div><button className="user-action-cancel" type="button" onClick={() => setEditingUser(null)}>Cancel</button></header>
      <label>Full name<input value={editName} onChange={(event) => setEditName(event.target.value)} required minLength={2} /></label>
      {actionNotice.text && <Notice notice={actionNotice} />}
      <button className="bank-button" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
    </form>}
    {deletingUser && <form className="user-action-form delete-user-form" onSubmit={confirmDelete}>
      <header><div><span className="eyebrow">DELETE ACCOUNT</span><h3>Delete {deletingUser.name}?</h3></div><button className="user-action-cancel" type="button" onClick={() => setDeletingUser(null)}>Cancel</button></header>
      <label className="check-row"><input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} required /> I understand this permanently deletes the user account.</label>
      {actionNotice.text && <Notice notice={actionNotice} />}
      <button className="delete-button user-delete-submit" type="submit" disabled={saving || !deleteConfirmed}>{saving ? 'Deleting...' : 'Delete account'}</button>
    </form>}
    {actionNotice.text && !editingUser && !deletingUser && <div className="user-action-notice"><Notice notice={actionNotice} /></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
