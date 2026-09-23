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
      .then(({ user }) => setProfile(user))
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
  return <main className="dashboard-shell"><header className="topbar"><div className="brand-mark"><Sparkles size={18} /> LOARN</div><div className="topbar-user"><span>{profile.name}</span><button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div></header><section className="dashboard-content"><div className="welcome-row"><div><span className="eyebrow">YOUR SPACE</span><h1>Good to see you, <em>{profile.name.split(' ')[0]}.</em></h1></div><div className="role-pill"><ShieldCheck size={15} /> {profile.role}</div></div><div className="dashboard-grid"><section className="panel profile-panel"><div className="panel-heading"><div><span className="eyebrow">PERSONAL DETAILS</span><h2>My profile</h2></div><UserRound size={22} /></div><form onSubmit={onSave} className="form-stack"><Field icon={<UserRound size={17} />} name="name" placeholder="Full name" value={form.name || profile.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field icon={<AtSign size={17} />} name="email" type="email" placeholder="Email address" value={form.email || profile.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Field icon={<LockKeyhole size={17} />} name="password" type="password" placeholder="New password (optional)" value={form.password || ''} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} />{notice.text && <Notice notice={notice} />}<button className="primary-button" disabled={loading}>Save changes <Check size={17} /></button></form></section>{profile.role === 'admin' && <section className="panel users-panel"><div className="panel-heading"><div><span className="eyebrow">ADMIN VIEW</span><h2>User directory</h2></div><UsersRound size={22} /></div><div className="user-list">{users.map((user) => <div className="user-row" key={user._id}><div className="avatar">{user.name?.charAt(0).toUpperCase()}</div><div><strong>{user.name}</strong><small>{user.email}</small></div><span className={`status ${user.isVerified ? 'verified' : ''}`}>{user.isVerified ? 'Verified' : 'Pending'}</span><ChevronRight size={16} /></div>)}{!users.length && <p className="empty-state">No users to show yet.</p>}</div></section>}</div></section></main>;
}

createRoot(document.getElementById('root')).render(<App />);
