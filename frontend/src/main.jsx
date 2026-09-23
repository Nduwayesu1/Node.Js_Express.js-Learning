import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, AtSign, Check, ChevronRight, LockKeyhole, LogOut, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { getProfile, getUsers, login, register, updateProfile, verifyOtp } from './api';
import './styles.css';

const initialForm = { name: '', email: '', password: '' };

function App() {
  const [view, setView] = useState('login');
  const [form, setForm] = useState(initialForm);
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem('loarn_token'));
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!token) return;
    getProfile(token)
      .then(({ user }) => {
        setProfile(user);
        window.location.hash = `dashboard/${user.role}`;
      })
      .catch(() => handleLogout());
  }, [token]);

  useEffect(() => {
    if (token && isAdmin) getUsers(token).then(({ users: loadedUsers }) => setUsers(loadedUsers)).catch(showError);
  }, [token, isAdmin]);

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
        setNotice({ type: 'success', text: 'Welcome back. Your workspace is ready.' });
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

  function handleLogout() {
    localStorage.removeItem('loarn_token');
    setToken(null);
    setProfile(null);
    setUsers([]);
    setView('login');
    setForm(initialForm);
    window.location.hash = '';
  }

  if (token && profile) {
    return <Dashboard profile={profile} users={users} form={form} loading={loading} notice={notice} setForm={setForm} onSave={handleProfileSave} onLogout={handleLogout} />;
  }

  return (
    <main className="auth-shell">
      <div className="stars" />
      <div className="mountains mountain-back" />
      <div className="mountains mountain-front" />
      <section className="auth-layout">
        <div className="brand-copy">
          <div className="brand-mark"><Sparkles size={18} /> LOARN</div>
          <h1>Make your next<br /><em>move</em> count.</h1>
          <p>A calm, secure place to manage your account and keep momentum on the things that matter.</p>
          <div className="trust-line"><ShieldCheck size={17} /> Secure account access</div>
        </div>
        <section className="auth-card">
          {view === 'otp' ? (
            <OtpForm otp={otp} setOtp={setOtp} loading={loading} notice={notice} onSubmit={handleVerify} onBack={() => setView('login')} />
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
    <div className="card-footer">{registerMode ? 'Already have an account?' : 'New to Loarn?'} <button className="text-button" onClick={onSwitch}>{registerMode ? 'Sign in' : 'Create account'}</button></div>
    {!registerMode && <button className="quiet-button" onClick={onVerify}>I already have an OTP</button>}
  </>;
}

function OtpForm({ otp, setOtp, loading, notice, onSubmit, onBack }) {
  return <>
    <div className="otp-icon"><Check size={22} /></div><div className="card-heading"><span className="eyebrow">EMAIL VERIFICATION</span><h2>Enter your code</h2><p>Use the 6-digit code sent to your email.</p></div>
    <form onSubmit={onSubmit} className="form-stack"><input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>{loading ? 'Verifying...' : 'Verify email'} <ArrowRight size={17} /></button></form><button className="quiet-button" onClick={onBack}>Back to sign in</button>
  </>;
}

function Field({ icon, ...props }) { return <label className="field"><span>{icon}</span><input {...props} required /></label>; }
function Notice({ notice }) { return <div className={`notice ${notice.type}`}>{notice.text}</div>; }

function Dashboard({ profile, users, form, loading, notice, setForm, onSave, onLogout }) {
  const firstName = profile.name?.split(' ')[0] || 'there';
  return <main className="dashboard-shell">
    <header className="topbar"><div className="brand-mark"><Sparkles size={18} /> LOARN</div><div className="topbar-user"><span>{profile.email}</span><button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div></header>
    <section className="dashboard-content"><div className="welcome-row"><div><span className="eyebrow">{profile.role.toUpperCase()} WORKSPACE</span><h1>Welcome, <em>{firstName}</em> <span className="wave">✦</span></h1></div><div className="role-pill"><ShieldCheck size={15} /> {profile.role}</div></div>
      {profile.role === 'admin' && <AdminDashboard profile={profile} users={users} />}
      {profile.role === 'employee' && <EmployeeDashboard profile={profile} users={users} />}
      {profile.role === 'user' && <UserDashboard profile={profile} form={form} loading={loading} notice={notice} setForm={setForm} onSave={onSave} />}
    </section>
  </main>;
}

function StatCard({ label, value, detail, tone = 'violet' }) { return <article className={`stat-card ${tone}`}><div className="stat-label">{label}<span className="stat-menu">...</span></div><strong>{value}</strong><small>{detail}</small></article>; }

function AdminDashboard({ profile, users }) {
  const verified = users.filter((user) => user.isVerified).length;
  return <><div className="stats-grid"><StatCard label="Total users" value={users.length} detail="Accounts in your workspace" /><StatCard label="Verified accounts" value={verified} detail="Ready to use the platform" tone="green" /><StatCard label="Pending verification" value={users.length - verified} detail="Awaiting email confirmation" tone="orange" /><StatCard label="Admin status" value="Active" detail="Full workspace access" tone="blue" /></div><div className="dashboard-grid role-grid"><section className="panel users-panel"><PanelHeading eyebrow="ADMIN DIRECTORY" title="All accounts" icon={<UsersRound size={22} />} /><UserList users={users} /></section><section className="panel insight-panel"><PanelHeading eyebrow="CONTROL CENTER" title="Workspace health" icon={<ShieldCheck size={22} />} /><div className="health-ring"><div><strong>{users.length ? Math.round((verified / users.length) * 100) : 0}%</strong><small>verified</small></div></div><div className="legend-row"><span className="dot green-dot" /> Verified <b>{verified}</b></div><div className="legend-row"><span className="dot orange-dot" /> Pending <b>{users.length - verified}</b></div></section></div></>;
}

function EmployeeDashboard() { return <><div className="stats-grid"><StatCard label="Workspace access" value="Ready" detail="Your account is active" tone="blue" /><StatCard label="My status" value="Verified" detail="Email confirmation complete" tone="green" /><StatCard label="Access level" value="Standard" detail="Employee workspace" /><StatCard label="Role" value="Employee" detail="Workspace contributor" tone="orange" /></div><div className="dashboard-grid role-grid"><section className="panel activity-panel"><PanelHeading eyebrow="TODAY" title="Your activity" icon={<Check size={22} />} /><div className="activity-item"><div className="activity-check"><Check size={15} /></div><div><strong>Account verified</strong><small>Your access is ready</small></div><span>Done</span></div><div className="activity-item"><div className="activity-check muted-check"><UserRound size={15} /></div><div><strong>Profile complete</strong><small>Keep your details current</small></div><span>Now</span></div></section><section className="panel insight-panel"><PanelHeading eyebrow="WORKSPACE NOTE" title="Stay current" icon={<ShieldCheck size={22} />} /><p className="empty-state">Keep your profile details up to date so your workspace identity stays accurate.</p></section></div></>; }

function UserDashboard({ profile, form, loading, notice, setForm, onSave }) { return <><div className="stats-grid"><StatCard label="Account status" value="Active" detail="Your account is verified" tone="green" /><StatCard label="Member since" value={new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} detail="Part of the Loarn workspace" /><StatCard label="Access level" value="Standard" detail="Personal workspace" tone="blue" /><StatCard label="Profile health" value="Ready" detail="Your account is looking good" tone="orange" /></div><div className="dashboard-grid role-grid"><section className="panel profile-panel"><PanelHeading eyebrow="PERSONAL DETAILS" title="My profile" icon={<UserRound size={22} />} /><form onSubmit={onSave} className="form-stack"><Field icon={<UserRound size={17} />} name="name" placeholder="Full name" value={form.name || profile.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email || profile.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="New password (optional)" value={form.password || ''} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>Save changes <Check size={17} /></button></form></section><section className="panel account-card"><PanelHeading eyebrow="ACCOUNT SNAPSHOT" title="Your details" icon={<ShieldCheck size={22} />} /><div className="account-summary"><div className="large-avatar">{profile.name?.charAt(0).toUpperCase()}</div><strong>{profile.name}</strong><span>{profile.email}</span><span className="verified-label"><Check size={14} /> Verified account</span></div></section></div></>; }

function PanelHeading({ eyebrow, title, icon }) { return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{icon}</div>; }
function UserList({ users }) { return <div className="user-list">{users.map((user) => <div className="user-row" key={user._id}><div className="avatar">{user.name?.charAt(0).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><span className={`status ${user.isVerified ? 'verified' : ''}`}>{user.isVerified ? 'Verified' : 'Pending'}</span><ChevronRight size={16} /></div>)}{!users.length && <p className="empty-state">No users to show yet.</p>}</div>; }

createRoot(document.getElementById('root')).render(<App />);
