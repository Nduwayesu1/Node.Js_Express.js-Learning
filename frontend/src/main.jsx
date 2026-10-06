import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownToLine, ArrowRight, AtSign, Building2, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock3, HandCoins, LayoutDashboard, LockKeyhole, LogOut, Menu, ShieldCheck, UserPlus, UserRound, UsersRound, Wallet, X } from 'lucide-react';
import { activateUser, addBankBranch, createBank, createBankAccount, createLoan, createPayrollBatch, decideLoan, deleteUser, depositToBankAccount, getAvailableBanks, getBankAccountTransactions, getBankAccounts, getBanks, getFinanceBanks, getLoans, getMyBankAccounts, getPayrollBatches, getPayrollEmployees, getProfile, getRwandaCells, getRwandaDistricts, getRwandaProvinces, getRwandaSectors, getRwandaVillages, getTransferRecipient, getUsers, login, markLoanDefaulted, recordLoanRepayment, register, resendOtp, transferBetweenAccounts, updateBankAccountStatus, updateProfile, updateUser, verifyOtp } from './api';
import './styles.css';

const initialForm = { name: '', email: '', password: '' };
const BANKS_PER_PAGE = 8;

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
  const [loading, setLoading] = useState(false);
  const [loanApplications, setLoanApplications] = useState([]);
  const [systemAnnualInterestRate, setSystemAnnualInterestRate] = useState(12);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!token) return;
    const loadProfile = () => getProfile(token)
      .then(({ user }) => {
        setProfile(user);
        const savedRole = sessionStorage.getItem('loarn_dashboard_role');
        const savedSection = savedRole === user.role ? sessionStorage.getItem('loarn_dashboard_section') : null;
        setSection(savedSection || 'overview');
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
    const loadBanks = profile.role === 'admin' ? getBanks(token) : profile.role === 'employee' ? getFinanceBanks(token) : getAvailableBanks(token);
    loadBanks.then(({ banks: loadedBanks }) => setBanks(loadedBanks)).catch(showError);
  }, [token, profile]);

  useEffect(() => {
    if (!profile) return;
    sessionStorage.setItem('loarn_dashboard_role', profile.role);
    sessionStorage.setItem('loarn_dashboard_section', section);
  }, [profile?.role, section]);

  useEffect(() => {
    if (!token || !profile) return;
    getLoans(token).then(({ loans, systemAnnualInterestRate: rate }) => {
      setLoanApplications(loans);
      if (Number.isFinite(rate)) setSystemAnnualInterestRate(rate);
    }).catch(showError);
  }, [token, profile]);

  const showError = (error) => setNotice({ type: 'error', text: error.message });
  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setNotice({ type: '', text: '' });
    try {
      if (view === 'login') {
        const result = await login({ email: form.email, password: form.password });
        localStorage.setItem('loarn_token', result.token);
        setToken(result.token);
        setNotice({ type: '', text: '' });
      } else {
        await register(form);
        setView('otp');
        setNotice({ type: 'success', text: 'Your verification code is on its way.' });
      }
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
    } catch (error) {
      showError(error);
    }
  }

  async function handleRoleUpdate(userId, updates) {
    try {
      await updateUser(token, userId, updates);
      setUserQuery((query) => ({ ...query }));
      setNotice({ type: 'success', text: 'User role updated.' });
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
    } catch (error) {
      showError(error);
    }
  }

  async function handleLoanRepayment(loanId, amount) {
    try {
      await recordLoanRepayment(token, loanId, amount);
      await refreshLoans();
      setNotice({ type: 'success', text: 'Loan repayment recorded.' });
      return true;
    } catch (error) {
      showError(error);
      return false;
    }
  }

  async function handleLoanDefault(loanId) {
    try {
      await markLoanDefaulted(token, loanId);
      await refreshLoans();
      setNotice({ type: 'success', text: 'Loan marked as defaulted.' });
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
    window.location.hash = '';
  }

  if (token && profile) {
    return <Dashboard profile={profile} users={users} banks={banks} token={token} pagination={pagination} userQuery={userQuery} setUserQuery={setUserQuery} onActivateUser={handleActivateUser} onRoleUpdate={handleRoleUpdate} onUserCreated={handleUserCreated} onBankCreated={handleBankCreated} onRefreshBanks={handleAvailableBanksRefresh} section={section} setSection={setSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} form={form} loading={loading} notice={notice} setNotice={setNotice} setForm={setForm} onSave={handleProfileSave} onLogout={handleLogout} loanApplications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} onLoanApplication={handleLoanApplication} onLoanDecision={handleLoanDecision} onLoanRepayment={handleLoanRepayment} onLoanDefault={handleLoanDefault} />;
  }

  return (
    <main className="auth-shell">
      <div className="stars" />
      <div className="mountains mountain-back" />
      <div className="mountains mountain-front" />
      <section className="auth-layout">
        <div className="brand-copy">
          <div className="brand-mark"><img className="brand-logo" src="/e-banking-payment.svg" alt="E-banking payment" /><span>LOAN</span></div>
          <h1>Make your next<br /><em>move</em> count.</h1>
          <p>A calm, secure place to manage your account and keep momentum on the things that matter.</p>
          <div className="trust-line"><ShieldCheck size={17} /> Secure account access</div>
        </div>
        <section className="auth-card">
          {view === 'otp' ? (
            <OtpForm otp={otp} setOtp={setOtp} email={form.email} loading={loading} notice={notice} onSubmit={handleVerify} onResend={async () => { setLoading(true); try { await resendOtp(form.email); setNotice({ type: 'success', text: 'A new verification code has been sent.' }); } catch (error) { showError(error); } finally { setLoading(false); } }} onBack={() => setView('login')} />
          ) : (
            <AuthForm view={view} form={form} loading={loading} notice={notice} onChange={updateField} onSubmit={handleSubmit} onSwitch={() => { setView(view === 'login' ? 'register' : 'login'); setNotice({ type: '', text: '' }); }} onVerify={() => setView('otp')} />
          )}
        </section>
      </section>
    </main>
  );
}

function AuthForm({ view, form, loading, notice, onChange, onSubmit, onSwitch, onVerify }) {
  const registerMode = view === 'register';
  return <>
    <div className="card-heading"><span className="eyebrow">ACCOUNT PORTAL</span><h2>{registerMode ? 'Create account' : 'Welcome back'}</h2><p>{registerMode ? 'Start with a secure account.' : 'Sign in to continue your journey.'}</p></div>
    <form onSubmit={onSubmit} className="form-stack">
      {registerMode && <Field icon={<UserRound size={17} />} name="name" placeholder="Full name" value={form.name} onChange={onChange} />}
      <Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email} onChange={onChange} />
      <Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="Password (8+ characters)" value={form.password} onChange={onChange} minLength={8} />
      {notice.text && <Notice notice={notice} />}
      <button className="primary-button" disabled={loading}>{loading ? 'Working...' : registerMode ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
    </form>
    <div className="card-footer">{registerMode ? 'Already have an account?' : 'New to Loan?'} <button className="text-button" onClick={onSwitch}>{registerMode ? 'Sign in' : 'Create account'}</button></div>
    {!registerMode && <button className="quiet-button" onClick={onVerify}>I already have an OTP</button>}
  </>;
}

function OtpForm({ otp, setOtp, email, loading, notice, onSubmit, onResend, onBack }) {
  return <>
    <div className="otp-icon"><Check size={22} /></div><div className="card-heading"><span className="eyebrow">EMAIL VERIFICATION</span><h2>Enter your code</h2><p>Use the 6-digit code sent to your email.</p></div>
    <form onSubmit={onSubmit} className="form-stack"><input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>{loading ? 'Verifying...' : 'Verify email'} <ArrowRight size={17} /></button></form><button className="quiet-button" disabled={loading || !email} onClick={onResend}>Resend code</button><button className="quiet-button" onClick={onBack}>Back to sign in</button>
  </>;
}

function Field({ icon, ...props }) { return <label className="field"><span>{icon}</span><input {...props} required /></label>; }
function Notice({ notice }) { return <div className={`notice ${notice.type}`}>{notice.text}</div>; }

function Dashboard({ profile, users, banks, token, pagination, userQuery, setUserQuery, onActivateUser, onRoleUpdate, onUserCreated, onBankCreated, onRefreshBanks, section, setSection, sidebarOpen, setSidebarOpen, form, loading, notice, setNotice, setForm, onSave, onLogout, loanApplications, systemAnnualInterestRate, onLoanApplication, onLoanDecision, onLoanRepayment, onLoanDefault }) {
  const firstName = profile.name?.split(' ')[0] || 'there';
  const manager = profile.role === 'employee';
  useEffect(() => {
    if (profile.role === 'user' && section !== 'overview' && section !== 'profile') {
      document.getElementById(`customer-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [profile.role, section]);
  const bankView = profile.role === 'user' || manager || (profile.role === 'admin' && ['deposits', 'applications', 'banks'].includes(section));
  return <main className={`dashboard-shell ${bankView ? 'bank-shell' : ''}`}>
    <Sidebar profile={profile} section={section} setSection={setSection} open={sidebarOpen} setOpen={setSidebarOpen} onLogout={onLogout} /><div className="dashboard-main"><header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} title="Open navigation"><Menu size={20} /></button><div className="topbar-user"><span>{profile.email}</span><button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div></header>
    <section className={`dashboard-content ${bankView ? 'bank-dashboard' : ''}`}><div className="welcome-row"><div><span className="eyebrow">{manager ? 'BRANCH MANAGER' : profile.role.toUpperCase()} WORKSPACE</span><h1>Welcome, <em>{firstName}</em> <span className="wave">✦</span></h1></div><div className="role-pill"><ShieldCheck size={15} /> {manager ? 'Manager' : profile.role}</div></div>
      {profile.role === 'admin' && ['overview', 'users'].includes(section) && <AdminCreateUser onCreated={onUserCreated} />}
      {profile.role === 'admin' && !['deposits', 'applications', 'banks'].includes(section) && <AdminDashboard users={users} pagination={pagination} query={userQuery} setQuery={setUserQuery} onActivateUser={onActivateUser} onRoleUpdate={onRoleUpdate} onUserCreated={onUserCreated} section={section} />}
      {profile.role === 'admin' && section === 'users' && <AdminEmployeeAccess users={users} banks={banks} currentUserId={profile._id} onRoleUpdate={onRoleUpdate} />}
      {profile.role === 'admin' && section === 'deposits' && <AdminDepositDashboard token={token} />}
      {profile.role === 'admin' && section === 'applications' && <ManagerDashboard applications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} section={section} notice={notice} onDecision={onLoanDecision} onRepayment={onLoanRepayment} onDefault={onLoanDefault} />}
      {profile.role === 'admin' && section === 'banks' && <AdminBankDashboard banks={banks} loanApplications={loanApplications} token={token} onCreated={onBankCreated} />}
      {manager && section === 'payroll' && <FinancePayrollDashboard banks={banks} token={token} />}
      {manager && ['overview', 'bank-staff'].includes(section) && <BankStaffDashboard banks={banks} token={token} profile={profile} />}
      {manager && !['profile', 'payroll', 'overview', 'bank-staff'].includes(section) && <ManagerDashboard applications={loanApplications} systemAnnualInterestRate={systemAnnualInterestRate} section={section} notice={notice} onDecision={onLoanDecision} onRepayment={onLoanRepayment} onDefault={onLoanDefault} />}
      {profile.role === 'user' && section !== 'profile' && <UserDashboard profile={profile} banks={banks} token={token} systemAnnualInterestRate={systemAnnualInterestRate} onRefreshBanks={onRefreshBanks} applications={loanApplications.filter((application) => application.applicant === profile._id || application.applicant?._id === profile._id)} notice={notice} setNotice={setNotice} onLoanApplication={onLoanApplication} />}
      {section === 'profile' && <ProfileDashboard profile={profile} form={form} loading={loading} notice={notice} setForm={setForm} onSave={onSave} />}
    </section></div>
  </main>;
}

function AdminCreateUser({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice({ type: '', text: '' });
    try {
      await register(form);
      setForm({ name: '', email: '', password: '' });
      setNotice({ type: 'success', text: 'Account created. A verification code was sent to the user.' });
      onCreated();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="panel create-user-panel"><PanelHeading eyebrow="ADMIN DIRECTORY" title="Create user account" icon={<UserPlus size={22} />} /><form className="create-user-form" onSubmit={handleSubmit}><label className="create-user-field">Full name<input autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="create-user-field">Email address<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="create-user-field">Temporary password<input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><button className="create-user-submit" type="submit" disabled={submitting}><UserPlus size={16} /> {submitting ? 'Creating...' : 'Create user'}</button></form>{notice.text && <div className="create-user-notice"><Notice notice={notice} /></div>}<p className="create-user-help">The user must verify their email before signing in.</p></section>;
}

function AdminEmployeeAccess({ users, banks, currentUserId, onRoleUpdate }) {
  const eligibleUsers = users.filter((user) => user.isVerified);
  return <section className="panel employee-access-panel"><PanelHeading eyebrow="STAFF ACCESS" title="User roles and bank assignments" icon={<UsersRound size={22} />} /><p>Change verified account roles and assign employees to a bank and sub-branch. The Finance Manager email must match an assigned employee login.</p>{eligibleUsers.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>User</th><th>Role</th><th>Bank and sub-branch</th><th>Assignment</th></tr></thead><tbody>{eligibleUsers.map((user) => <EmployeeAccessRow key={user._id} user={user} banks={banks} currentUserId={currentUserId} onRoleUpdate={onRoleUpdate} />)}</tbody></table></div> : <p className="empty-state">No verified user accounts are available.</p>}</section>;
}

function EmployeeAccessRow({ user, banks, currentUserId, onRoleUpdate }) {
  const [role, setRole] = useState(user.role);
  const [bankId, setBankId] = useState(user.bankId || '');
  const [branchId, setBranchId] = useState(user.branchId || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedBank = banks.find((bank) => bank._id === bankId);

  useEffect(() => {
    setRole(user.role);
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
    const saved = await onRoleUpdate(user._id, { role: 'employee', bankId, branchId });
    setMessage(saved ? 'Assignment saved' : 'Could not save');
    setSaving(false);
  }

  return <tr><td><strong>{user.name}</strong><br /><small>{user.email}</small></td><td><select value={role} onChange={(event) => saveRole(event.target.value)} disabled={saving || user._id === currentUserId} aria-label={`Access role for ${user.name}`}><option value="user">Customer</option><option value="employee">Employee</option><option value="admin">Administrator</option></select></td><td>{role === 'employee' ? <div className="employee-assignment-form"><select value={bankId} onChange={(event) => { setBankId(event.target.value); setBranchId(''); }} required disabled={saving}><option value="">Select bank</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select><select value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={saving || !selectedBank?.branches.length}><option value="">Select sub-branch</option>{selectedBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select></div> : 'Not assigned'}</td><td>{role === 'employee' ? <button className="manage-button" type="button" onClick={saveAssignment} disabled={saving || !bankId || !branchId}>{saving ? 'Saving...' : 'Assign'}</button> : role === 'admin' ? 'Administrator access' : 'Customer access'}{message && <small className="employee-access-message">{message}</small>}</td></tr>;
}

function Sidebar({ profile, section, setSection, open, setOpen, onLogout }) {
  const go = (next) => { setSection(next); setOpen(false); };
  const navigation = [{ section: 'overview', label: profile.role === 'employee' ? 'Overview' : 'Dashboard', icon: LayoutDashboard }];
  if (profile.role === 'user') navigation.push(
    { section: 'deposit', label: 'Make a deposit', icon: ArrowDownToLine },
    { section: 'loan-application', label: 'Apply for a loan', icon: HandCoins },
    { section: 'activity', label: 'Account activity', icon: Wallet },
    { section: 'applications', label: 'Loan requests', icon: Clock3 }
  );
  if (profile.role === 'employee') navigation.push(
    { section: 'bank-staff', label: 'Bank account dashboard', icon: Building2 },
    { section: 'applications', label: 'Loan applications', icon: HandCoins },
    { section: 'payroll', label: 'Finance payroll', icon: Wallet }
  );
  if (profile.role === 'admin') navigation.push(
    { section: 'deposits', label: 'Deposit activity', icon: ArrowDownToLine },
    { section: 'applications', label: 'Loan applications', icon: HandCoins },
    { section: 'banks', label: 'Bank branches', icon: Building2 }
  );
  navigation.push({ section: 'profile', label: 'My profile', icon: UserRound });
  if (profile.role === 'admin') navigation.push({ section: 'users', label: 'User directory', icon: UsersRound });

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

function AdminBankDashboard({ banks, loanApplications, token, onCreated }) {
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
      setNotice({ type: 'success', text: `Bank created. System account number: ${accountNumber}.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <div className="bank-management-actions">
      <button className="bank-button" type="button" onClick={() => { setNotice({ type: '', text: '' }); setBankModalOpen(true); }}><Building2 size={17} /> Create bank</button>
      <AddBranchForm banks={banks} token={token} onCreated={onCreated} />
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
                : bankStaff.length ? <div className="user-table-wrap"><table className="user-table bank-staff-table"><thead><tr><th>Staff member</th><th>Sub-branch</th><th>Account status</th></tr></thead><tbody>{bankStaff.map((staff) => {
                  const staffBranch = activeBank.branches.find((branch) => String(branch._id) === String(staff.branchId));
                  return <tr key={staff._id}><td><strong>{staff.name}</strong><br /><small>{staff.email}</small></td><td>{staffBranch?.branchName || 'Not assigned'}{staffBranch?.branchCode && <><br /><small>{staffBranch.branchCode}</small></>}</td><td><span className={`status ${staff.isVerified ? 'verified' : ''}`}>{staff.isVerified ? 'Verified' : 'Pending verification'}</span></td></tr>;
                })}</tbody></table></div>
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

function AddBranchForm({ banks, token, onCreated }) {
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

function FinancePayrollDashboard({ banks, token }) {
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
  return <>
    <div className="bank-stats"><article className="balance-stat"><span>Assigned bank</span><strong>{selectedBank?.bankName || 'Not assigned'}</strong><small>Finance authorization by bank</small></article><article><span>Employees selected</span><strong>{selectedEmployees.length}</strong><small>Same amount per employee</small></article><article><span>Batch total</span><strong>{currency(batchTotal)}</strong><small>One grouped payroll batch</small></article></div>
    {!banks.length ? <section className="bank-panel"><p className="empty-state">No bank is assigned to this Finance Manager account.</p></section> : <>
      <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">FINANCE · PAYROLL</span><h2>Prepare equal-amount payment</h2></div><Wallet size={22} /></div><form className="payroll-form" onSubmit={handleSubmit}>
        <label>Bank<select value={bankId} onChange={(event) => setBankId(event.target.value)} required>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select></label>
        <label>Sub-branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={!selectedBank?.branches.length}><option value="">Select a sub-branch</option>{selectedBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName} · {branch.branchCode}</option>)}</select></label>
        <label>Amount per employee (RWF)<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <div className="employee-picker"><div className="employee-picker-heading"><strong>Verified employees</strong><span>{loading ? 'Loading…' : `${employees.length} available`}</span></div>{employees.length ? employees.map((employee) => <label className="payroll-employee" key={employee._id}><input type="checkbox" checked={selectedEmployees.includes(employee._id)} onChange={() => toggleEmployee(employee._id)} /><span><strong>{employee.name}</strong><small>{employee.email}</small></span></label>) : <p className="empty-state">No verified employee accounts are available.</p>}</div>
        <div className="payroll-summary"><span>{selectedEmployees.length} employees × {currency(Number(amount || 0))}</span><strong>{currency(batchTotal)}</strong></div>
        {notice.text && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={submitting || loading || !branchId || !selectedEmployees.length}>{submitting ? 'Queueing batch…' : 'Queue payroll batch'}</button>
        <p className="form-disclaimer">All selected employees receive the same amount in one queued batch. This records a payment instruction; a payment provider is required to move funds.</p>
      </form></section>
      <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">PAYROLL QUEUE</span><h2>Recent batches</h2></div><Clock3 size={22} /></div>{batches.length ? <div className="payroll-batches">{batches.map((batch) => <article className="payroll-batch" key={batch._id}><div><strong>{batch.branchName} · {new Date(batch.createdAt).toLocaleString()}</strong><small>{batch.employees.length} employees · {currency(batch.amount)} each</small></div><strong>{currency(batch.totalAmount)}</strong><span className="loan-status pending">{batch.status}</span></article>)}</div> : <p className="empty-state">No payroll batches have been queued.</p>}</section>
    </>}
  </>;
}

function AdminDepositDashboard({ token }) {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    getBankAccounts(token)
      .then(({ accounts: loadedAccounts }) => setAccounts(loadedAccounts))
      .catch((loadError) => setError(loadError.message));
  }, [token]);
  const deposits = accounts.flatMap((account) => (account.transactions || [])
    .filter((transaction) => transaction.type === 'deposit')
    .map((transaction) => ({ ...transaction, accountId: account._id, accountNumber: account.accountNumber, ownerName: account.userId?.name || 'Account holder', ownerEmail: account.userId?.email || '' })));
  deposits.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const total = deposits.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  return <>
    <div className="bank-stats"><article className="balance-stat"><span>Total deposits</span><strong>{currency(total)}</strong><small>Across customer accounts</small></article><article><span>Deposit transactions</span><strong>{deposits.length}</strong><small>Recorded deposits</small></article><article><span>Accounts with deposits</span><strong>{new Set(deposits.map((transaction) => transaction.accountId)).size}</strong><small>Customer accounts</small></article></div>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>Deposit history</h2></div><ArrowDownToLine size={23} /></div>{error && <p className="empty-state">{error}</p>}{deposits.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Customer</th><th>Email / account</th><th>Date</th><th>Amount</th></tr></thead><tbody>{deposits.map((transaction) => <tr key={transaction._id}><td>{transaction.ownerName}</td><td>{transaction.ownerEmail || transaction.accountNumber}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td><td><strong>{currency(transaction.amount)}</strong></td></tr>)}</tbody></table></div> : !error && <p className="empty-state">No deposits have been recorded yet.</p>}</section>
    <BankAccountManagementTable accounts={accounts} setAccounts={setAccounts} token={token} banks={[]} />
  </>;
}

function BankAccountManagementTable({ accounts, setAccounts, token, banks }) {
  const [busyAccountId, setBusyAccountId] = useState('');
  const [message, setMessage] = useState('');

  async function toggleStatus(account) {
    const status = account.status === 'active' ? 'inactive' : 'active';
    setBusyAccountId(account._id);
    setMessage('');
    try {
      const { account: updatedAccount } = await updateBankAccountStatus(token, account._id, status);
      setAccounts((current) => current.map((item) => item._id === account._id ? { ...item, ...updatedAccount } : item));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyAccountId('');
    }
  }

  return <section className="bank-panel transaction-panel"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Bank accounts</h2></div><Building2 size={22} /></div>{message && <p className="bank-notice error">{message}</p>}{accounts.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Account</th><th>Customer</th><th>Bank</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{accounts.map((account) => <tr key={account._id}><td>{account.accountNumber}<br /><small>{account.accountName}</small></td><td>{account.userId?.name || 'Customer'}<br /><small>{account.userId?.email}</small></td><td>{account.bankId?.bankName || banks.find((bank) => String(bank._id) === String(account.bankId))?.bankName || 'Bank'}</td><td>{currency(account.balance)}</td><td><span className={`status ${account.status === 'active' ? 'verified' : ''}`}>{account.status}</span></td><td><button className={account.status === 'active' ? 'delete-button' : 'activate-button'} type="button" disabled={busyAccountId === account._id} onClick={() => toggleStatus(account)}>{busyAccountId === account._id ? 'Saving...' : account.status === 'active' ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div> : <p className="empty-state">No bank accounts are available.</p>}</section>;
}

function StatCard({ label, value, detail, tone = 'violet' }) { return <article className={`stat-card ${tone}`}><div className="stat-label">{label}<span className="stat-menu">...</span></div><strong>{value}</strong><small>{detail}</small></article>; }

function AdminDashboard({ users, pagination, query, setQuery, onActivateUser, onUserCreated, section }) {
  const verified = users.filter((user) => user.isVerified).length;
  return <><div className="stats-grid"><StatCard label="Total users" value={pagination.total} detail="Accounts in your workspace" /><StatCard label="Verified accounts" value={verified} detail="On this page" tone="green" /><StatCard label="Pending verification" value={users.length - verified} detail="On this page" tone="orange" /><StatCard label="Admin status" value="Active" detail="Full workspace access" tone="blue" /></div><div className={`dashboard-grid role-grid ${section === 'users' ? 'directory-focus' : ''}`}><section className="panel users-panel"><PanelHeading eyebrow="ADMIN DIRECTORY" title="All accounts" icon={<UsersRound size={22} />} /><div className="directory-toolbar"><input value={query.search} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search name or email" /><select value={query.sortBy} onChange={(event) => setQuery({ ...query, page: 1, sortBy: event.target.value })}><option value="createdAt">Newest</option><option value="name">Name</option><option value="email">Email</option><option value="role">Role</option></select><select value={query.sortOrder} onChange={(event) => setQuery({ ...query, page: 1, sortOrder: event.target.value })}><option value="desc">Desc</option><option value="asc">Asc</option></select></div><UserList users={users} /><div className="pagination"><button className="icon-button" disabled={pagination.page <= 1} onClick={() => setQuery({ ...query, page: pagination.page - 1 })} title="Previous page"><ChevronLeft size={16} /></button><span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span><button className="icon-button" disabled={pagination.page >= pagination.totalPages} onClick={() => setQuery({ ...query, page: pagination.page + 1 })} title="Next page"><ChevronRight size={16} /></button></div></section>{section !== 'users' && <section className="panel insight-panel"><PanelHeading eyebrow="CONTROL CENTER" title="Workspace health" icon={<ShieldCheck size={22} />} /><div className="health-ring"><div><strong>{users.length ? Math.round((verified / users.length) * 100) : 0}%</strong><small>this page</small></div></div><div className="legend-row"><span className="dot green-dot" /> Verified <b>{verified}</b></div><div className="legend-row"><span className="dot orange-dot" /> Pending <b>{users.length - verified}</b></div></section>}</div></>;
}

function ManagerDashboard({ applications, systemAnnualInterestRate, section, notice, onDecision, onRepayment, onDefault }) {
  const pending = applications.filter((application) => application.status === 'pending');
  const decided = applications.filter((application) => application.status !== 'pending');
  const visibleApplications = section === 'applications' ? applications : pending.slice(0, 4);
  const interestIncome = applications.reduce((total, loan) => total + (loan.interestIncome || 0), 0);
  const losses = applications.reduce((total, loan) => total + (loan.loss || 0), 0);
  return <>
    <div className="bank-stats"><article><span>Awaiting review</span><strong>{pending.length}</strong><small>Loan requests needing a decision</small></article><article><span>Interest income</span><strong>{currency(interestIncome)}</strong><small>Collected from repayments</small></article><article><span>Principal loss</span><strong>{currency(losses)}</strong><small>Outstanding principal defaulted</small></article><article><span>Net profit</span><strong>{currency(interestIncome - losses)}</strong><small>Interest income less principal loss</small></article></div>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">CREDIT REVIEW</span><h2>{section === 'applications' ? 'All loan applications' : 'Applications to review'}</h2></div><HandCoins size={23} /></div>
      {notice.text && <div className="bank-notice"><Notice notice={notice} /></div>}
      {visibleApplications.length ? <div className="user-table-wrap"><table className="user-table loan-management-table"><thead><tr><th>Applicant / amount</th><th>Bank / purpose</th><th>Review status</th><th>Management actions</th></tr></thead><tbody>{visibleApplications.map((application) => <LoanApplicationCard key={application._id} application={application} systemAnnualInterestRate={systemAnnualInterestRate} onDecision={onDecision} onRepayment={onRepayment} onDefault={onDefault} />)}</tbody></table></div> : <p className="empty-state">{decided.length ? 'No applications in this view.' : 'No applications have been submitted yet.'}</p>}
    </section>
  </>;
}

function LoanApplicationCard({ application, systemAnnualInterestRate, onDecision, onRepayment, onDefault }) {
  const [repayment, setRepayment] = useState('');
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const quote = calculateLoanQuote(application.amount, systemAnnualInterestRate, application.termMonths);

  async function submitRepayment(event) {
    event.preventDefault();
    setSubmitting(true);
    if (await onRepayment(application._id, Number(repayment))) setRepayment('');
    setSubmitting(false);
  }

  return <tr>
    <td><strong>{application.applicantName}</strong><br /><small>{application.applicantEmail}</small><br /><LoanMoney amount={application.amount} /> requested</td>
    <td>{application.bankName} · {application.branchName}<br /><small>{application.purpose}</small><br /><small>{application.termMonths} months · {application.hasExternalLoans ? application.externalLoanDetails : 'No other bank loans'}</small></td>
    <td><span className={`loan-status ${application.status}`}>{application.status}</span><br /><small>Submitted {new Date(application.createdAt).toLocaleDateString()}</small>{application.annualInterestRate !== undefined && <><br /><small>{application.annualInterestRate}% annual rate</small></>}</td>
    <td className="loan-management-actions-cell">
      {application.status === 'pending' && <form className="loan-review-form" onSubmit={(event) => { event.preventDefault(); onDecision(application._id, 'approved'); }}>
        <p className="system-rate-label">System annual interest rate: <strong>{systemAnnualInterestRate}%</strong></p>
        {quote && <div className="loan-quote"><span>Monthly payment <strong>{currency(quote.monthlyPayment)}</strong></span><span>Expected interest <strong>{currency(quote.expectedInterest)}</strong></span></div>}
        <div className="decision-actions"><button type="submit"><CircleCheck size={16} /> Approve and disburse</button><button type="button" onClick={() => onDecision(application._id, 'declined')}><CircleX size={16} /> Decline</button></div>
      </form>}
      {['approved', 'repaid', 'defaulted'].includes(application.status) && <>
        <div className="loan-table-finances"><span>Outstanding <strong>{currency(application.outstandingPrincipal)}</strong></span><span>Collected interest <strong>{currency(application.interestIncome)}</strong></span><span>Loss <strong>{currency(application.loss)}</strong></span><span>Net <strong>{currency((application.interestIncome || 0) - (application.loss || 0))}</strong></span><span>Monthly <strong>{currency(application.monthlyPayment)}</strong></span></div>
        {application.status === 'approved' && <>
          <form className="repayment-form" onSubmit={submitRepayment}><label>Record repayment (RWF)<input type="number" min="1" step="1" value={repayment} onChange={(event) => setRepayment(event.target.value)} required /></label><button className="bank-button" type="submit" disabled={submitting}>{submitting ? 'Recording...' : 'Record payment'}</button></form>
          <details className="loan-default-details"><summary>Mark default</summary><form className="loan-default-form" onSubmit={(event) => { event.preventDefault(); onDefault(application._id); }}><label className="check-row"><input type="checkbox" checked={confirmDefault} onChange={(event) => setConfirmDefault(event.target.checked)} required /> Confirm remaining principal will be recorded as a loss.</label><button className="delete-button" type="submit" disabled={!confirmDefault}>Confirm default</button></form></details>
        </>}
        {application.repayments?.length > 0 && <div className="repayment-history">{application.repayments.slice(-3).reverse().map((item, index) => <div key={`${application._id}-payment-${index}`}><span>{new Date(item.paidAt).toLocaleDateString()} · {currency(item.amount)}</span><small>{currency(item.interestPortion)} interest / {currency(item.principalPortion)} principal</small></div>)}</div>}
      </>}
    </td>
  </tr>;
}

function UserDashboard({ profile, banks, applications, notice, setNotice, onLoanApplication, onRefreshBanks, token, systemAnnualInterestRate }) {
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhoneNumber, setDepositPhoneNumber] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [loanForm, setLoanForm] = useState({ bankId: '', branchId: '', amount: '', termMonths: '12', purpose: '', hasExternalLoans: false, externalLoanDetails: '' });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState({ bankId: '', branchId: '', accountName: profile.name || '' });
  const [transferForm, setTransferForm] = useState({ fromAccountId: '', toAccountNumber: '', amount: '', description: '' });
  const [transferRecipient, setTransferRecipient] = useState(null);
  const [recipientLookup, setRecipientLookup] = useState({ status: 'idle', message: '' });
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [submittingLoan, setSubmittingLoan] = useState(false);
  const [refreshingBanks, setRefreshingBanks] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [accountNotice, setAccountNotice] = useState({ type: '', text: '' });
  const [depositNotice, setDepositNotice] = useState({ type: '', text: '' });
  const [transferNotice, setTransferNotice] = useState({ type: '', text: '' });
  const activeAccounts = bankAccounts.filter((account) => account.status === 'active');
  const balance = activeAccounts.reduce((total, account) => total + Number(account.balance || 0), 0);
  const latestApplications = applications.slice(0, 3);
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
    const accountNumber = transferForm.toAccountNumber;
    setTransferRecipient(null);
    if (!/^\d{12}$/.test(accountNumber)) {
      setRecipientLookup({ status: 'idle', message: '' });
      return;
    }

    let isCurrentLookup = true;
    setRecipientLookup({ status: 'loading', message: '' });
    getTransferRecipient(token, accountNumber)
      .then(({ recipient }) => {
        if (!isCurrentLookup) return;
        setTransferRecipient({ ...recipient, lookupNumber: accountNumber });
        setRecipientLookup({ status: 'success', message: '' });
      })
      .catch((error) => {
        if (!isCurrentLookup) return;
        setRecipientLookup({ status: 'error', message: error.message });
      });

    return () => {
      isCurrentLookup = false;
    };
  }, [token, transferForm.toAccountNumber]);

  const submitDeposit = async (event) => {
    event.preventDefault();
    if (!activeAccounts.length) return setDepositNotice({ type: 'error', text: 'Create an active bank account before making a deposit.' });
    if (!depositAccountId) return setDepositNotice({ type: 'error', text: 'Select an account for this deposit.' });
    setSubmittingDeposit(true);
    try {
      const { payment, message } = await depositToBankAccount(token, depositAccountId, Number(depositAmount), depositPhoneNumber);
      if (payment?.status === 'pending') {
        setDepositAmount('');
        setDepositPhoneNumber('');
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
      return setNotice({ type: 'error', text: 'Create an active bank account at this bank and sub-branch before applying.' });
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
    } catch (error) {
      setAccountNotice({ type: 'error', text: error.message });
    } finally {
      setSubmittingAccount(false);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!transferForm.fromAccountId || !/^\d{12}$/.test(transferForm.toAccountNumber)) {
      setTransferNotice({ type: 'error', text: 'Choose your source account and enter the recipient 12-digit account number.' });
      return;
    }
    if (transferRecipient?.lookupNumber !== transferForm.toAccountNumber) {
      setTransferNotice({ type: 'error', text: 'Wait for an active recipient account to be confirmed before transferring.' });
      return;
    }

    setSubmittingTransfer(true);
    try {
      await transferBetweenAccounts(token, {
        fromAccountId: transferForm.fromAccountId,
        toAccountNumber: transferForm.toAccountNumber,
        amount: Number(transferForm.amount),
        description: transferForm.description || 'User transfer'
      });
      setTransferForm({ fromAccountId: '', toAccountNumber: '', amount: '', description: '' });
      const { accounts } = await getMyBankAccounts(token);
      setBankAccounts(accounts || []);
      setTransferNotice({ type: 'success', text: 'Transfer completed successfully.' });
    } catch (error) {
      setTransferNotice({ type: 'error', text: error.message });
    } finally {
      setSubmittingTransfer(false);
    }
  }

  return <>
    {(depositNotice.text || transferNotice.text) && <div className="bank-notice"><Notice notice={transferNotice.text ? transferNotice : depositNotice} /></div>}
    <div className="bank-stats"><article className="balance-stat"><span>Available balance</span><strong>{currency(balance)}</strong><small>{activeAccounts.length} active bank account{activeAccounts.length === 1 ? '' : 's'}</small></article><article><span>Loan requests</span><strong>{applications.length}</strong><small>{applications.filter((application) => application.status === 'pending').length} under review</small></article><article><span>Account holder</span><strong>{profile.name}</strong><small>Verified customer</small></article></div>
    <div className="bank-grid"><section className="bank-panel" id="customer-deposit"><div className="bank-panel-heading"><div><span className="eyebrow">MOVE MONEY</span><h2>Make a deposit</h2></div><ArrowDownToLine size={23} /></div><form className="bank-form" onSubmit={submitDeposit}><label htmlFor="deposit-account">Deposit into</label><select className="bank-text-input" id="deposit-account" value={depositAccountId} onChange={(event) => setDepositAccountId(event.target.value)} required disabled={!activeAccounts.length}><option value="">{activeAccounts.length ? 'Select an account' : 'Create a bank account first'}</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.accountName} · {account.accountNumber}</option>)}</select><label htmlFor="deposit-phone">Mobile money phone number</label><input className="bank-text-input" id="deposit-phone" type="tel" autoComplete="tel" value={depositPhoneNumber} onChange={(event) => setDepositPhoneNumber(event.target.value)} placeholder="0781234567" required disabled={!activeAccounts.length} /><label htmlFor="deposit-amount">Deposit amount (RWF)</label><div className="money-input"><img className="rf-currency-logo" src="/rf-currency.svg" alt="Rwandan franc" /><input id="deposit-amount" type="number" min="1" step="1" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="0" required disabled={!activeAccounts.length} /></div><button className="bank-button" type="submit" disabled={!activeAccounts.length || submittingDeposit}>{submittingDeposit ? 'Sending payment request...' : <><ArrowDownToLine size={17} /> Pay with mobile money</>}</button></form>{depositNotice.text && <div className="bank-notice"><Notice notice={depositNotice} /></div>}<p className="form-disclaimer">Approve the mobile-money prompt on your phone. Your account is credited after Paypack confirms payment.</p></section>
      <section className="bank-panel" id="customer-loan-application"><div className="bank-panel-heading"><div><span className="eyebrow">CREDIT</span><h2>Apply for a loan</h2></div><HandCoins size={23} /></div><form className="bank-form" onSubmit={submitLoan}>
        <label htmlFor="loan-bank">Bank</label><select className="bank-text-input" id="loan-bank" value={loanForm.bankId} onChange={(event) => setLoanForm({ ...loanForm, bankId: event.target.value, branchId: '' })} required><option value="">Select a bank</option>{banks.map((bank) => { const hasSubBranches = bank.branches?.some((branch) => /^[\da-f]{24}$/i.test(String(branch._id || ''))); return <option key={bank._id} value={bank._id} disabled={!hasSubBranches}>{bank.bankName}{hasSubBranches ? '' : ' (no sub-branches)'}</option>; })}</select>
        <label htmlFor="loan-branch">Sub-branch</label><select className="bank-text-input" id="loan-branch" value={loanForm.branchId} onChange={(event) => setLoanForm({ ...loanForm, branchId: event.target.value })} required disabled={!selectedLoanBank?.branches.length}><option value="">{!selectedLoanBank ? 'Select a bank first' : selectedLoanBank.branches.length ? 'Select a sub-branch' : 'No sub-branches available'}</option>{selectedLoanBank?.branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select>
        <label htmlFor="loan-amount">Amount requested (RWF)</label><div className="money-input"><img className="rf-currency-logo" src="/rf-currency.svg" alt="Rwandan franc" /><input id="loan-amount" type="number" min="1" step="1" value={loanForm.amount} onChange={(event) => setLoanForm({ ...loanForm, amount: event.target.value })} placeholder="10000" required /></div>
        <label htmlFor="loan-term">Requested term (months)</label><input className="bank-text-input" id="loan-term" type="number" min="1" max="360" step="1" value={loanForm.termMonths} onChange={(event) => setLoanForm({ ...loanForm, termMonths: event.target.value })} required />
        <label htmlFor="loan-purpose">What is the loan for?</label><input className="bank-text-input" id="loan-purpose" value={loanForm.purpose} onChange={(event) => setLoanForm({ ...loanForm, purpose: event.target.value })} placeholder="e.g. Home improvement" required />
        <label className="check-row"><input type="checkbox" checked={loanForm.hasExternalLoans} onChange={(event) => setLoanForm({ ...loanForm, hasExternalLoans: event.target.checked })} /> I have an outstanding loan with another bank</label>{loanForm.hasExternalLoans && <p className="form-disclaimer">Applicants with an outstanding loan at another bank are not eligible.</p>}
        {notice.type === 'error' && <Notice notice={notice} />}
        <button className="bank-button" type="submit" disabled={loanForm.hasExternalLoans || hasExistingApplication || submittingLoan}>{submittingLoan ? 'Submitting...' : hasExistingApplication ? 'Application already submitted' : <><HandCoins size={17} /> Submit for review</>}</button><p className="form-disclaimer">System annual interest rate: {systemAnnualInterestRate}%. Approved funds are deposited to your account at this bank.</p>
      </form></section></div>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">BANK ACCOUNT</span><h2>Create a bank account</h2></div><button className="text-button" type="button" disabled={refreshingBanks} onClick={async () => { setRefreshingBanks(true); await onRefreshBanks(); setRefreshingBanks(false); }}>{refreshingBanks ? 'Loading banks...' : 'Refresh banks'}</button></div>
      <form className="bank-form" onSubmit={handleCreateAccount}>
        <label htmlFor="bank-account-bank">Bank</label>
        <select className="bank-text-input" id="bank-account-bank" value={accountForm.bankId} onChange={(event) => setAccountForm({ ...accountForm, bankId: event.target.value, branchId: '' })} required><option value="">Select a bank</option>{banks.map((bank) => { const hasSubBranches = bank.branches?.some((branch) => /^[\da-f]{24}$/i.test(String(branch._id || ''))); return <option key={bank._id} value={bank._id} disabled={!hasSubBranches}>{bank.bankName}{hasSubBranches ? '' : ' (no sub-branches)'}</option>; })}</select>
        <label htmlFor="bank-account-branch">Sub-branch</label>
        <select className="bank-text-input" id="bank-account-branch" value={accountForm.branchId} onChange={(event) => setAccountForm({ ...accountForm, branchId: event.target.value })} required disabled={!selectedAccountBranches.length}><option value="">{!selectedAccountBank ? 'Select a bank first' : selectedAccountBranches.length ? 'Select a sub-branch' : selectedAccountBank.branches.length ? 'Branch IDs unavailable. Refresh the page.' : 'No sub-branches available'}</option>{selectedAccountBranches.map((branch) => <option key={branch._id} value={branch._id}>{branch.branchName}</option>)}</select>
        <label htmlFor="bank-account-name">Account name</label>
        <input className="bank-text-input" id="bank-account-name" value={accountForm.accountName} onChange={(event) => setAccountForm({ ...accountForm, accountName: event.target.value })} placeholder="Savings account" required />
        <button className="bank-button" type="submit" disabled={submittingAccount}>{submittingAccount ? 'Generating account...' : 'Generate bank account'}</button>
      </form>
      {accountNotice.text && <div className="bank-notice"><Notice notice={accountNotice} /></div>}
      {bankAccounts.length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Account</th><th>Bank</th><th>Status</th><th>Available balance</th></tr></thead><tbody>{bankAccounts.map((account) => <tr key={account._id}><td><strong>{account.accountName}</strong><br /><small>{account.accountNumber}</small></td><td>{account.bankId?.bankName || 'Bank'}</td><td><span className={`status ${account.status === 'active' ? 'verified' : ''}`}>{account.status}</span></td><td><strong>{currency(account.balance)}</strong></td></tr>)}</tbody></table></div> : <p className="empty-state">No bank accounts created yet.</p>}
    </section>
    <section className="bank-panel"><div className="bank-panel-heading"><div><span className="eyebrow">TRANSFER</span><h2>Move funds between accounts</h2></div><ArrowRight size={23} /></div>
      <form className="bank-form" onSubmit={handleTransfer}>
        <label htmlFor="transfer-from">From account</label>
        <select className="bank-text-input" id="transfer-from" value={transferForm.fromAccountId} onChange={(event) => setTransferForm({ ...transferForm, fromAccountId: event.target.value })} required disabled={!activeAccounts.length}><option value="">Select source account</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.accountName} · {account.accountNumber}</option>)}</select>
        <label htmlFor="transfer-to">Recipient account number</label>
        <input className="bank-text-input" id="transfer-to" inputMode="numeric" pattern="[0-9]{12}" maxLength="12" value={transferForm.toAccountNumber} onChange={(event) => setTransferForm({ ...transferForm, toAccountNumber: event.target.value.replace(/\D/g, '').slice(0, 12) })} placeholder="12-digit account number" required />
        {recipientLookup.status === 'loading' && <p className="form-disclaimer" role="status">Looking up recipient...</p>}
        {recipientLookup.status === 'success' && transferRecipient?.lookupNumber === transferForm.toAccountNumber && <p className="form-disclaimer" role="status">Recipient: <strong>{transferRecipient.name}</strong> · Account {transferRecipient.accountNumber}</p>}
        {recipientLookup.status === 'error' && <p className="form-disclaimer" role="status">{recipientLookup.message}</p>}
        <label htmlFor="transfer-amount">Amount (RWF)</label>
        <input className="bank-text-input" id="transfer-amount" type="number" min="1" step="1" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} required />
        <label htmlFor="transfer-desc">Transfer note</label>
        <input className="bank-text-input" id="transfer-desc" value={transferForm.description} onChange={(event) => setTransferForm({ ...transferForm, description: event.target.value })} placeholder="Rent payment" />
        <button className="bank-button" type="submit" disabled={submittingTransfer || !activeAccounts.length}>{submittingTransfer ? 'Transferring...' : 'Transfer funds'}</button>
      </form>
    </section>
    <section className="bank-panel transaction-panel" id="customer-activity"><div className="bank-panel-heading"><div><span className="eyebrow">ACCOUNT ACTIVITY</span><h2>All transactions</h2></div><Wallet size={22} /></div>{bankAccounts.flatMap((account) => (account.transactions || []).map((transaction) => ({ ...transaction, accountName: account.accountName, accountNumber: account.accountNumber }))).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).length ? <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Date</th><th>Account</th><th>Transaction</th><th>Amount</th><th>Balance after</th></tr></thead><tbody>{bankAccounts.flatMap((account) => (account.transactions || []).map((transaction) => ({ ...transaction, accountName: account.accountName, accountNumber: account.accountNumber }))).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).map((transaction) => <tr key={`${transaction.accountNumber}-${transaction._id}`}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td>{transaction.accountName}<br /><small>{transaction.accountNumber}</small></td><td>{transaction.description || transaction.type.replaceAll('_', ' ')}</td><td className={['deposit', 'transfer_in', 'loan_disbursement'].includes(transaction.type) ? 'financial-positive' : 'financial-negative'}>{['deposit', 'transfer_in', 'loan_disbursement'].includes(transaction.type) ? '+' : '-'}{currency(transaction.amount)}</td><td>{currency(transaction.balanceAfter)}</td></tr>)}</tbody></table></div> : <p className="empty-state">Your account activity will appear here.</p>}</section>
    <section className="bank-panel loans-panel" id="customer-applications"><div className="bank-panel-heading"><div><span className="eyebrow">APPLICATION TRACKER</span><h2>Your loan requests</h2></div><Clock3 size={22} /></div>{latestApplications.length ? <div className="loan-list">{latestApplications.map((application) => <article className="loan-row" key={application._id}><div><strong><LoanMoney amount={application.amount} /> · {application.bankName}</strong><small>{application.purpose} · {application.branchName} · {application.termMonths} months</small>{application.annualInterestRate !== undefined && <small>{application.annualInterestRate}% annual interest · {currency(application.monthlyPayment)} estimated monthly payment</small>}<small>{currency(application.interestIncome)} interest income · {currency(application.loss)} principal loss</small></div><span className={`loan-status ${application.status}`}>{application.status}</span></article>)}</div> : <p className="empty-state">You have not applied for a loan yet.</p>}</section>
  </>;
}

function BankStaffDashboard({ banks, token, profile }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState(profile.bankId || '');

  useEffect(() => {
    if (!token) return;
    const activeBankId = selectedBankId || (banks[0]?._id || '');
    if (!activeBankId) {
      setAccounts([]);
      return;
    }
    getBankAccounts(token, { bankId: activeBankId })
      .then(({ accounts: loadedAccounts }) => setAccounts(loadedAccounts || []))
      .catch(() => setAccounts([]));
  }, [banks, selectedBankId, token]);

  return <><section className="panel bank-accounts-panel"><PanelHeading eyebrow="BANK STAFF DASHBOARD" title="Bank account ledger" icon={<Building2 size={22} />} />
    <div className="directory-toolbar"><select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)}><option value="">Select bank</option>{banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.bankName}</option>)}</select></div>
  </section><BankAccountManagementTable accounts={accounts} setAccounts={setAccounts} token={token} banks={banks} /></>;
}

function ProfileDashboard({ profile, form, loading, notice, setForm, onSave }) { return <div className="dashboard-grid role-grid"><section className="panel profile-panel"><PanelHeading eyebrow="PERSONAL DETAILS" title="My profile" icon={<UserRound size={22} />} /><form onSubmit={onSave} className="form-stack"><Field icon={<UserRound size={17} />} name="name" placeholder="Full name" value={form.name || profile.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email || profile.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="New password (optional)" value={form.password || ''} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>Save changes <Check size={17} /></button></form></section><section className="panel account-card"><PanelHeading eyebrow="ACCOUNT SNAPSHOT" title="Your details" icon={<ShieldCheck size={22} />} /><div className="account-summary"><div className="large-avatar">{profile.name?.charAt(0).toUpperCase()}</div><strong>{profile.name}</strong><span>{profile.email}</span><span className="verified-label"><Check size={14} /> Verified account</span></div></section></div>; }

function calculateLoanQuote(principal, annualRate, termMonths) {
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(annualRate) || annualRate < 0 || !Number.isInteger(termMonths) || termMonths < 1) return null;
  const monthlyRate = annualRate / 1200;
  const rawPayment = monthlyRate === 0 ? principal / termMonths : principal * monthlyRate * ((1 + monthlyRate) ** termMonths) / (((1 + monthlyRate) ** termMonths) - 1);
  return { monthlyPayment: Math.round(rawPayment), expectedInterest: Math.max(0, Math.round(rawPayment * termMonths - principal)) };
}

function LoanMoney({ amount }) { return <span className="loan-money"><img src="/rf-currency.svg" alt="Rwandan franc" />{currency(amount)}</span>; }

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
