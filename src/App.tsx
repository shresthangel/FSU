import { lazy, Suspense, useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Eye,
  GraduationCap,
  House,
  Image,
  LayoutDashboard,
  LogIn,
  Mail,
  Menu,
  MessageSquareWarning,
  Moon,
  MoreHorizontal,
  Phone,
  PlusCircle,
  Pencil,
  Search,
  Sun,
  Trash2,
  Users,
  Vote,
  X,
  type LucideIcon,
} from 'lucide-react'
import { auth, db, firebaseConfigured } from './firebase'
import {
  createNotice,
  deleteNotice as deleteNoticeFromFirestore,
  subscribeToNotices,
  updateNotice,
  isNoticeCategory,
  type Notice,
  type NoticeCategory,
  type NoticeInput,
} from './notices'
import { subscribeEvents, type EventRecord } from './portal'
import './App.css'

const PortalPage = lazy(() => import('./PortalPage'))

type NavItem = {
  label: string
  path: string
  icon: LucideIcon
}

const mainLinks: NavItem[] = [
  { label: 'Home', path: '/', icon: House },
  { label: 'Notices', path: '/notices', icon: Bell },
  { label: 'Events', path: '/events', icon: CalendarDays },
  { label: 'Polls', path: '/polls', icon: Vote },
  { label: 'Opportunities', path: '/opportunities', icon: GraduationCap },
  { label: 'Lost & Found', path: '/lost-found', icon: Search },
]

const moreLinks: NavItem[] = [
  { label: 'Gallery', path: '/gallery', icon: Image },
  { label: 'Meet the Team', path: '/team', icon: Users },
  { label: 'Transparency', path: '/transparency', icon: Eye },
]

const memberLinks: NavItem[] = [
  { label: 'Profile', path: '/profile', icon: Users },
  { label: 'My Complaints', path: '/my-complaints', icon: MessageSquareWarning },
  { label: 'My Events', path: '/my-events', icon: CalendarDays },
]

const adminLinks: NavItem[] = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { label: 'Notices', path: '/admin/notices', icon: Bell },
  { label: 'Complaints', path: '/admin/complaints', icon: MessageSquareWarning },
  { label: 'Events', path: '/admin/events', icon: CalendarDays },
  { label: 'Polls', path: '/admin/polls', icon: Vote },
  { label: 'Opportunities', path: '/admin/opportunities', icon: GraduationCap },
  { label: 'Lost & Found', path: '/admin/lost-found', icon: Search },
  { label: 'Gallery', path: '/admin/gallery', icon: Image },
]

const portalPaths = new Set([
  '/events',
  '/polls',
  '/opportunities',
  '/lost-found',
  '/gallery',
  '/team',
  '/complaint',
  '/my-complaints',
  '/my-events',
  '/profile',
  '/track',
  '/admin',
  '/admin/events',
  '/admin/complaints',
  '/admin/polls',
  '/admin/opportunities',
  '/admin/lost-found',
  '/admin/gallery',
])

type NoticeForm = NoticeInput
const noticeCategories: NoticeCategory[] = ['exam', 'event', 'scholarship', 'general']
const noticeCategoryLabels: Record<NoticeCategory, string> = {
  exam: 'Exam',
  event: 'Event',
  scholarship: 'Scholarship',
  general: 'General',
}

const formatNoticeDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()

const emptyNoticeForm: NoticeForm = { title: '', body: '', category: 'general' }
const homeEventImages = [
  'photo-1523580494863-6f3031224c94',
  'photo-1511632765486-a01980e01a18',
  'photo-1523240795612-9a054b0db644',
]

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [authLoading, setAuthLoading] = useState(Boolean(auth))
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [noticeData, setNoticeData] = useState<{ notices: Notice[]; error: string | null; loading: boolean }>({
    notices: [],
    error: firebaseConfigured ? null : 'Notice board is not configured yet. Add Firebase settings to load shared notices.',
    loading: firebaseConfigured,
  })
  const [noticeSearch, setNoticeSearch] = useState('')
  const [noticeCategoryFilter, setNoticeCategoryFilter] = useState<NoticeCategory | 'all'>('all')
  const [noticeForm, setNoticeForm] = useState<NoticeForm>(emptyNoticeForm)
  const [noticeFormError, setNoticeFormError] = useState<string | null>(null)
  const [noticeSaving, setNoticeSaving] = useState(false)
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null)
  const [homeEvents, setHomeEvents] = useState<EventRecord[]>([])
  const [homeEventsError, setHomeEventsError] = useState<string | null>(null)
  const notices = noticeData.notices

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  useEffect(() => {
    const firebaseAuth = auth
    const firestore = db
    if (!firebaseAuth || !firestore) return
    let active = true
    let roleCheck = 0
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      const currentCheck = ++roleCheck
      setUser(currentUser)
      setEmailVerified(currentUser?.emailVerified ?? false)
      setIsAdmin(false)
      setAuthError(null)
      if (!currentUser || !currentUser.emailVerified) {
        setAuthLoading(false)
        return
      }

      try {
        const adminDocument = await getDoc(doc(firestore, 'admins', currentUser.uid))
        if (!active || currentCheck !== roleCheck) return
        setIsAdmin(adminDocument.exists() && adminDocument.data().role === 'admin')
      } catch (error) {
        if (!active || currentCheck !== roleCheck) return
        setAuthError(`Could not verify administrator access: ${errorMessage(error)}`)
      } finally {
        if (active && currentCheck === roleCheck) setAuthLoading(false)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!firebaseConfigured) return
    return subscribeToNotices(
      (nextNotices) => setNoticeData({ notices: nextNotices, error: null, loading: false }),
      (error) => setNoticeData((current) => ({ ...current, error: errorMessage(error), loading: false })),
    )
  }, [])

  useEffect(() => {
    if (!firebaseConfigured) return
    return subscribeEvents(false, setHomeEvents, (error) => setHomeEventsError(errorMessage(error)))
  }, [])

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setMoreOpen(false)
        setAvatarOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault()
    navigateTo(path)
  }

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
    setMenuOpen(false)
    setMoreOpen(false)
    setAvatarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const logout = async () => {
    setAvatarOpen(false)
    setAuthError(null)
    try {
      if (!auth) throw new Error('Firebase authentication is not configured.')
      await signOut(auth)
      window.history.pushState({}, '', '/')
      setCurrentPath('/')
    } catch (error) {
      setAuthError(errorMessage(error))
    }
  }

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError(null)
    setAuthMessage(null)
    setAuthPending(true)
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    try {
      if (!auth) throw new Error('Firebase is not configured. Add the Firebase environment variables and restart the app.')
      if (currentPath === '/signup') {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        const name = String(formData.get('name') ?? '').trim()
        if (name) await updateProfile(credential.user, { displayName: name })
        await sendEmailVerification(credential.user)
        setAuthMessage('We sent you a verification email. Verify your address to use private support features.')
        navigateTo('/verify-email')
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password)
        navigateTo(credential.user.emailVerified ? '/' : '/verify-email')
      }
    } catch (error) {
      setAuthError(errorMessage(error))
    } finally {
      setAuthPending(false)
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError(null)
    setAuthMessage(null)
    setAuthPending(true)
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    try {
      if (!auth) throw new Error('Firebase is not configured. Add the Firebase environment variables and restart the app.')
      await sendPasswordResetEmail(auth, email)
      setAuthMessage('If an account exists for that email address, a password reset link has been sent.')
    } catch (error) {
      setAuthError(errorMessage(error))
    } finally {
      setAuthPending(false)
    }
  }

  const resendVerification = async () => {
    setAuthError(null)
    setAuthMessage(null)
    try {
      if (!auth?.currentUser) throw new Error('Sign in to resend the verification email.')
      if (auth.currentUser.emailVerified) {
        setEmailVerified(true)
        setAuthMessage('Your email is already verified.')
        return
      }
      await sendEmailVerification(auth.currentUser)
      setAuthMessage('Verification email sent. Check your inbox and spam folder.')
    } catch (error) {
      setAuthError(errorMessage(error))
    }
  }

  const refreshVerification = async () => {
    setAuthError(null)
    setAuthMessage(null)
    try {
      if (!auth?.currentUser) throw new Error('Sign in to check your verification status.')
      await reload(auth.currentUser)
      const verified = auth.currentUser.emailVerified
      setEmailVerified(verified)
      if (!verified) {
        setAuthMessage('Your email is not verified yet. Open the link in the verification email and check again.')
        return
      }
      if (db) {
        const adminDocument = await getDoc(doc(db, 'admins', auth.currentUser.uid))
        setIsAdmin(adminDocument.exists() && adminDocument.data().role === 'admin')
      }
      setAuthMessage('Email verified. You can now use private support features.')
      navigateTo('/')
    } catch (error) {
      setAuthError(errorMessage(error))
    }
  }

  const saveNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = noticeForm.title.trim()
    const body = noticeForm.body.trim()
    if (!title || !body) {
      setNoticeFormError('Add a title and details before publishing.')
      return
    }

    setNoticeSaving(true)
    setNoticeFormError(null)
    try {
      const noticeInput = { title, body, category: noticeForm.category }
      if (editingNoticeId) await updateNotice(editingNoticeId, noticeInput)
      else await createNotice(noticeInput)
      setNoticeForm(emptyNoticeForm)
      setEditingNoticeId(null)
    } catch (error) {
      setNoticeFormError(errorMessage(error))
    } finally {
      setNoticeSaving(false)
    }
  }

  const startEditingNotice = (notice: Notice) => {
    setEditingNoticeId(notice.id)
    setNoticeForm({ title: notice.title, body: notice.body, category: notice.category })
    setNoticeFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteNotice = async (noticeId: string) => {
    try {
      await deleteNoticeFromFirestore(noticeId)
      if (editingNoticeId === noticeId) {
        setEditingNoticeId(null)
        setNoticeForm(emptyNoticeForm)
        setNoticeFormError(null)
      }
    } catch (error) {
      setNoticeData((current) => ({ ...current, error: errorMessage(error) }))
    }
  }

  const orderedNotices = [...notices]
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
  const visibleNotices = orderedNotices
    .filter((notice) => noticeCategoryFilter === 'all' || notice.category === noticeCategoryFilter)
    .filter((notice) => `${notice.title} ${notice.body} ${noticeCategoryLabels[notice.category]}`.toLocaleLowerCase().includes(noticeSearch.trim().toLocaleLowerCase()))
  const latestNotices = orderedNotices.slice(0, 3)

  const link = (item: NavItem, className = '') => {
    const Icon = item.icon
    return (
      <a
        key={item.path}
        className={`${className}${currentPath === item.path ? ' is-active' : ''}`}
        href={item.path}
        onClick={(event) => navigate(event, item.path)}
      >
        <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
        <span>{item.label}</span>
      </a>
    )
  }

  const renderPage = () => {
    if (currentPath === '/login' || currentPath === '/signup') {
      return (
        <main className="auth-page">
          <div className="auth-card">
            <div className="auth-icon"><Users size={22} /></div>
            <span className="eyebrow">GOOD TO HAVE YOU HERE</span>
            <h1>{currentPath === '/signup' ? 'Find your people.' : 'Welcome back.'}</h1>
            <p>{currentPath === '/signup' ? 'Create a student account to access portal features.' : 'Sign in to access your account and support conversations.'}</p>
            {!firebaseConfigured && <p className="notice-storage-error" role="alert">Firebase is not configured. Add the Firebase environment variables to enable accounts.</p>}
            {authError && <p className="notice-storage-error" role="alert">{authError}</p>}
            {authMessage && <p className="portal-message" role="status">{authMessage}</p>}
            <form onSubmit={login}>
              {currentPath === '/signup' && <label htmlFor="name">Your name</label>}
              {currentPath === '/signup' && <input id="name" name="name" autoComplete="name" placeholder="Alex Student" required />}
              <label htmlFor="email">University email</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@university.edu" required />
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete={currentPath === '/signup' ? 'new-password' : 'current-password'} minLength={6} placeholder="At least 6 characters" required />
              <button className="button button-primary auth-submit" type="submit" disabled={authPending || !firebaseConfigured}>
                {authPending ? 'Please wait…' : currentPath === '/signup' ? 'Create account' : 'Sign in'} {!authPending && <ArrowRight size={16} />}
              </button>
            </form>
            {currentPath === '/login' && <a className="demo-link" href="/reset-password" onClick={(event) => navigate(event, '/reset-password')}>Forgot your password?</a>}
            <a className="demo-link" href={currentPath === '/signup' ? '/login' : '/signup'} onClick={(event) => navigate(event, currentPath === '/signup' ? '/login' : '/signup')}>
              {currentPath === '/signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </a>
          </div>
        </main>
      )
    }

    if (currentPath === '/reset-password') {
      return (
        <main className="auth-page">
          <div className="auth-card">
            <span className="eyebrow">ACCOUNT RECOVERY</span>
            <h1>Reset password.</h1>
            <p>Enter your account email and Firebase will send a password reset link.</p>
            {authError && <p className="notice-storage-error" role="alert">{authError}</p>}
            {authMessage && <p className="portal-message" role="status">{authMessage}</p>}
            <form onSubmit={resetPassword}>
              <label htmlFor="reset-email">University email</label>
              <input id="reset-email" name="email" type="email" autoComplete="email" required />
              <button className="button button-primary auth-submit" type="submit" disabled={authPending || !firebaseConfigured}>{authPending ? 'Please wait…' : 'Send reset link'}</button>
            </form>
            <a className="demo-link" href="/login" onClick={(event) => navigate(event, '/login')}>Back to sign in</a>
          </div>
        </main>
      )
    }

    if (currentPath === '/verify-email') {
      return (
        <main className="auth-page">
          <div className="auth-card">
            <span className="eyebrow">EMAIL VERIFICATION</span>
            <h1>{emailVerified ? 'Email verified.' : 'Check your inbox.'}</h1>
            <p>{user?.email ? `Signed in as ${user.email}.` : 'Sign in to your student account to verify your email.'} Private support features require a verified email.</p>
            {authError && <p className="notice-storage-error" role="alert">{authError}</p>}
            {authMessage && <p className="portal-message" role="status">{authMessage}</p>}
            {user && !emailVerified && <div className="portal-actions"><button className="button button-primary" onClick={resendVerification} type="button">Resend verification email</button><button className="button button-outline" onClick={refreshVerification} type="button">I verified my email</button></div>}
            {emailVerified && <button className="button button-primary" onClick={() => navigateTo('/my-complaints')} type="button">Open support inbox</button>}
            {!user && <a className="button button-primary" href="/login" onClick={(event) => navigate(event, '/login')}>Sign in</a>}
          </div>
        </main>
      )
    }

    if (portalPaths.has(currentPath)) {
      return (
        <Suspense fallback={<main className="interior-page"><p role="status">Loading portal…</p></main>}>
          <PortalPage key={currentPath} path={currentPath === '/track' ? '/my-complaints' : currentPath} user={user} isAdmin={isAdmin} emailVerified={emailVerified} authLoading={authLoading} onNavigate={navigateTo} />
        </Suspense>
      )
    }

    if (currentPath === '/admin/notices') {
      if (authLoading) {
        return <main className="interior-page notice-access"><span className="eyebrow">FSU ADMINISTRATION</span><h1>Checking access…</h1></main>
      }
      if (!user || !emailVerified || !isAdmin) {
        return (
          <main className="interior-page notice-access">
            <span className="eyebrow">FSU ADMINISTRATION</span>
            <h1>Admin access required.</h1>
            <p>{authError ?? (user ? 'This account does not have administrator permissions.' : 'Sign in with an administrator account to manage notices. The public notice board is available to everyone.')}</p>
            <a className="button button-primary" href="/login" onClick={(event) => navigate(event, '/login')}>Go to admin sign in <ArrowRight size={16} /></a>
          </main>
        )
      }
      const activeAdmin = adminLinks.find((item) => item.path === currentPath)
      return (
        <main className="admin-layout">
          <aside className="admin-sidebar">
            <div className="admin-sidebar-label">WORKSPACE</div>
            {adminLinks.map((item) => {
              const Icon = item.icon
              return (
                <a className={`admin-link${currentPath === item.path ? ' is-active' : ''}`} href={item.path} key={item.path} onClick={(event) => navigate(event, item.path)}>
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.path === '/admin/complaints' && <span className="sidebar-badge">4</span>}
                  {item.path === '/admin/approvals' && <span className="sidebar-badge">2</span>}
                </a>
              )
            })}
            <a className="admin-back" href="/" onClick={(event) => navigate(event, '/')}><ArrowLeft size={17} /> Back to site</a>
          </aside>
          <section className="admin-content">
            <span className="eyebrow">FSU ADMINISTRATION</span>
            <h1>{activeAdmin?.label ?? 'Dashboard'}</h1>
            <p className="section-intro">A little more visibility, a lot more student voice.</p>
            {currentPath === '/admin/notices' ? (
              <div className="notice-admin">
                <section className="admin-panel notice-editor">
                  <div>
                    <h2>{editingNoticeId ? 'Edit notice' : 'Publish a notice'}</h2>
                    <p>Published notices are immediately visible on the public notice board.</p>
                  </div>
                  <form onSubmit={saveNotice}>
                    <label htmlFor="notice-title">Title</label>
                    <input id="notice-title" value={noticeForm.title} onChange={(event) => { setNoticeForm({ ...noticeForm, title: event.target.value }); setNoticeFormError(null) }} maxLength={120} required />
                    <label htmlFor="notice-category">Category</label>
                    <select id="notice-category" value={noticeForm.category} onChange={(event) => { if (isNoticeCategory(event.target.value)) setNoticeForm({ ...noticeForm, category: event.target.value }) }}>
                      {noticeCategories.map((category) => <option key={category} value={category}>{noticeCategoryLabels[category]}</option>)}
                    </select>
                    <label htmlFor="notice-body">Details</label>
                    <textarea id="notice-body" value={noticeForm.body} onChange={(event) => { setNoticeForm({ ...noticeForm, body: event.target.value }); setNoticeFormError(null) }} rows={4} maxLength={1000} required />
                    {noticeFormError && <p className="notice-form-error" role="alert">{noticeFormError}</p>}
                    <div className="notice-form-actions">
                      <button className="button button-primary" disabled={noticeSaving} type="submit">{noticeSaving ? 'Saving…' : editingNoticeId ? 'Save changes' : 'Publish notice'} {!noticeSaving && <ArrowRight size={15} />}</button>
                      {editingNoticeId && <button className="button button-outline" onClick={() => { setEditingNoticeId(null); setNoticeForm(emptyNoticeForm); setNoticeFormError(null) }} type="button">Cancel</button>}
                    </div>
                  </form>
                </section>
                {noticeData.error && <p className="notice-storage-error" role="alert">{noticeData.error}</p>}
                <section className="admin-panel notice-admin-list">
                  <div>
                    <h2>All notices <span className="notice-count">{notices.length}</span></h2>
                    <p>Manage notices currently shown to students.</p>
                  </div>
                  {orderedNotices.length ? orderedNotices.map((notice) => (
                    <article className="notice-admin-row" key={notice.id}>
                      <div className="notice-admin-copy">
                        <span className={`notice-category-tag category-${notice.category}`}>{noticeCategoryLabels[notice.category]}</span>
                        <strong>{notice.title}</strong>
                        <p>{notice.body}</p>
                        <small>{formatNoticeDate(notice.createdAt)}</small>
                      </div>
                      <div className="notice-admin-actions">
                        <button className="notice-icon-button" aria-label={`Edit ${notice.title}`} onClick={() => startEditingNotice(notice)} type="button"><Pencil size={16} /></button>
                        <button className="notice-icon-button danger" aria-label={`Delete ${notice.title}`} onClick={() => deleteNotice(notice.id)} type="button"><Trash2 size={16} /></button>
                      </div>
                    </article>
                  )) : <p className="notice-empty">No notices yet. Publish one to share it with students.</p>}
                </section>
              </div>
            ) : (
              <>
                <div className="admin-stats">
                  <article className="admin-stat"><span>New complaints</span><strong>04</strong><small>2 need a response today</small></article>
                  <article className="admin-stat"><span>Pending approvals</span><strong>02</strong><small>Events waiting for review</small></article>
                  <article className="admin-stat"><span>Students reached</span><strong>1,284</strong><small>+12% this month</small></article>
                </div>
                <div className="admin-panel">
                  <div><h2>Recently received</h2><p>New messages from your student community.</p></div>
                  {['Library hours during finals', 'Accessible seating in the main hall', 'More water refill stations'].map((title, index) => (
                    <div className="admin-row" key={title}><span className="admin-row-dot" /><strong>{title}</strong><span>{index === 0 ? '12 min ago' : `${index + 1} hr ago`}</span><ArrowRight size={16} /></div>
                  ))}
                </div>
              </>
            )}
          </section>
        </main>
      )
    }

    if (currentPath === '/notices') {
      return (
        <main className="notice-board-page">
          <div className="notice-board-heading">
            <span className="eyebrow"><span className="tiny-spark">✳</span> THE NOTICE BOARD</span>
            <h1>Good to know.</h1>
            <p>Updates, opportunities, and important dates from your Union.</p>
          </div>
          <div className="notice-board-controls">
            <label className="notice-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search notices</span>
              <input type="search" value={noticeSearch} onChange={(event) => setNoticeSearch(event.target.value)} placeholder="Search notices..." />
            </label>
            <div className="notice-filter-list" aria-label="Filter notices by category">
              <button className={noticeCategoryFilter === 'all' ? 'is-selected' : ''} onClick={() => setNoticeCategoryFilter('all')} type="button">All notices</button>
              {noticeCategories.map((category) => (
                <button className={noticeCategoryFilter === category ? 'is-selected' : ''} key={category} onClick={() => setNoticeCategoryFilter(category)} type="button">
                  {noticeCategoryLabels[category]}
                </button>
              ))}
            </div>
          </div>
          {noticeData.error && <p className="notice-storage-error" role="alert">{noticeData.error}</p>}
          {noticeData.loading ? <p className="notice-empty" role="status">Loading notices…</p> : visibleNotices.length ? (
            <div className="notice-board-list">
              {visibleNotices.map((notice, index) => (
                <article className={`notice-board-card notice-tone-${notice.category}`} key={notice.id}>
                  <div className="notice-board-card-meta">
                    <span className={`notice-category-tag category-${notice.category}`}>{noticeCategoryLabels[notice.category]}</span>
                    <time dateTime={notice.createdAt}>{formatNoticeDate(notice.createdAt)}</time>
                  </div>
                  <h2>{notice.title}</h2>
                  <p>{notice.body}</p>
                  <span className="notice-board-number">{String(index + 1).padStart(2, '0')}</span>
                </article>
              ))}
            </div>
          ) : <div className="notice-empty notice-board-empty">{noticeData.error ? 'Notices are temporarily unavailable.' : notices.length ? 'No notices match your search. Try a different search or category.' : 'There are no notices yet. Check back soon.'}</div>}
        </main>
      )
    }

    if (currentPath !== '/') {
      const pageItem = [...mainLinks, ...moreLinks, ...memberLinks].find((item) => item.path === currentPath)
      const titles: Record<string, string> = {
        '/complaint': 'Your voice matters here.',
        '/track': 'Let’s find your complaint.',
      }
      const title = titles[currentPath] ?? pageItem?.label ?? 'Your Union, your way.'
      return (
        <main className="interior-page">
          <span className="eyebrow">FREE STUDENTS UNION</span>
          <h1>{title}</h1>
          <p>Good things happen when students shape their own campus. We’re here to help make that happen.</p>
          <div className="interior-cards">
            <a href="/complaint" onClick={(event) => navigate(event, '/complaint')}><MessageSquareWarning /><strong>Something on your mind?</strong><span>Tell us what’s happening — anonymously if you like.</span><ArrowRight /></a>
            <a href="/events" onClick={(event) => navigate(event, '/events')}><CalendarDays /><strong>Find your people</strong><span>See what’s coming up around campus.</span><ArrowRight /></a>
            <a href="/notices" onClick={(event) => navigate(event, '/notices')}><Bell /><strong>Stay in the loop</strong><span>Read the latest from your student community.</span><ArrowRight /></a>
          </div>
        </main>
      )
    }

    return (
      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-pill"><span className="live-dot" /> YOUR UNION. YOUR CAMPUS.</div>
            <h1>A campus where<br />every voice <span>belongs.</span></h1>
            <p>We’re the students standing up for students. For the big changes, the little things, and everything that makes campus feel like yours.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/complaint" onClick={(event) => navigate(event, '/complaint')}>Speak up <ArrowRight size={16} /></a>
              <a className="text-link" href="/team" onClick={(event) => navigate(event, '/team')}>Get to know us <ArrowDownRight size={16} /></a>
            </div>
            <div className="hero-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div><span><strong>Made by students,</strong> for all of us.</span></div>
          </div>
          <div className="hero-visual">
            <img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=85" alt="Students spending time together on campus" />
            <div className="photo-caption"><span className="caption-mark">“</span><span>Campus gets better<br />when we build it together.</span><ArrowUpRightIcon /></div>
            <div className="hero-photo-label"><span className="live-dot" /> OPEN TO EVERY STUDENT</div>
          </div>
          <div className="hero-decoration decoration-one" />
          <div className="hero-decoration decoration-two" />
        </section>

        <section className="welcome-strip">
          <div className="welcome-label"><span>01</span> WHAT WE’RE ABOUT</div>
          <p>Not just a union. <strong>A thousand small ways</strong> to make campus life better.</p>
          <a href="/team" onClick={(event) => navigate(event, '/team')}>Meet your Union <ArrowRight size={15} /></a>
        </section>

        <section className="section-block notice-section">
          <div className="section-heading">
            <div><span className="eyebrow"><span className="tiny-spark">✳</span> THE LATEST</span><h2>A few things<br className="mobile-break" /> worth knowing.</h2></div>
            <a className="section-link" href="/notices" onClick={(event) => navigate(event, '/notices')}>All notices <ArrowRight size={16} /></a>
          </div>
          {noticeData.error && <p className="notice-storage-error" role="alert">{noticeData.error}</p>}
          <div className="notice-grid">
            {latestNotices.map((notice, index) => (
              <a className={`notice-card notice-tone-${notice.category}`} href="/notices" key={notice.id} onClick={(event) => navigate(event, '/notices')}>
                <div className="notice-meta"><span>{noticeCategoryLabels[notice.category]}</span><span>0{index + 1}</span></div>
                <h3>{notice.title}</h3>
                <div className="notice-bottom"><span>{formatNoticeDate(notice.createdAt)}</span><span className="round-arrow"><ArrowRight size={16} /></span></div>
              </a>
            ))}
          </div>
          {!noticeData.loading && latestNotices.length === 0 && <p className="notice-empty">{noticeData.error ? 'The latest notices could not be loaded.' : 'There are no notices yet. Check back soon.'}</p>}
        </section>

        <section className="events-section">
          <div className="section-heading">
            <div><span className="eyebrow"><span className="tiny-spark">✳</span> SAVE YOUR SEAT</span><h2>Campus is better<br />when we’re together.</h2></div>
            <a className="section-link" href="/events" onClick={(event) => navigate(event, '/events')}>See all events <ArrowRight size={16} /></a>
          </div>
          <div className="event-grid">
            {homeEvents.slice(0, 3).map((event, index) => {
              const startDate = new Date(event.startAt)
              return (
              <a className="event-card" href="/events" key={event.id} onClick={(clickEvent) => navigate(clickEvent, '/events')}>
                <div className="event-image-wrap">
                  <img src={`https://images.unsplash.com/${homeEventImages[index % homeEventImages.length]}?auto=format&fit=crop&w=800&q=80`} alt={`Students at ${event.title}`} />
                  <div className="event-date"><strong>{startDate.toLocaleDateString('en-US', { day: '2-digit' })}</strong><span>{startDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span></div>
                  <span className="event-arrow"><ArrowUpRightIcon /></span>
                </div>
                <div className="event-info"><span className="event-time">{startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {event.location}</span><h3>{event.title}</h3><p>{event.description}</p></div>
              </a>
              )
            })}
            {!homeEvents.length && <p className="portal-empty">{homeEventsError ?? (firebaseConfigured ? 'No upcoming events have been published yet.' : 'Campus events will appear here when Firebase is configured.')}</p>}
          </div>
        </section>

        <section className="voice-section">
          <div className="voice-art"><div className="voice-ring ring-outer" /><div className="voice-ring ring-inner" /><span className="voice-star">✳</span><div className="voice-art-note">You’re not<br />on your own.</div><span className="voice-caption">A UNION THAT LISTENS</span></div>
          <div className="voice-copy"><span className="eyebrow">A LITTLE NOTE FROM US</span><h2>Big feelings.<br />Small form.</h2><p>Something’s not right? Got an idea? Our complaint box is a safe, private place to start. You can even stay anonymous.</p><a className="button button-dark" href="/complaint" onClick={(event) => navigate(event, '/complaint')}>Tell us what’s up <ArrowRight size={16} /></a><span className="privacy-note"><Eye size={14} /> Anonymous complaints are private.</span></div>
        </section>

        <section className="impact-strip">
          <div><span>RIGHT HERE, RIGHT NOW</span><strong>2.4k</strong><small>student voices heard</small></div>
          <div><span>BETTER TOGETHER</span><strong>38</strong><small>student-led events</small></div>
          <div><span>THIS YEAR ALONE</span><strong>126</strong><small>campus changes made</small></div>
          <div className="impact-note">Small actions add up.<br /><em>Yours counts, too.</em></div>
        </section>
      </main>
    )
  }

  return (
    <div className="site-shell">
      <div className="announcement-bar"><span className="announcement-spark">✳</span> The new semester is yours to shape. <a href="/events" onClick={(event) => navigate(event, '/events')}>See what’s on <ArrowRight size={13} /></a></div>
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => navigate(event, '/')} aria-label="Free Students Union home">
          <span className="brand-mark"><span>F</span><span>S</span><i /></span>
          <span className="brand-name">free students<span>union</span></span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {mainLinks.map((item) => link(item, 'nav-link'))}
          <div className="dropdown-anchor">
            <button className={`nav-link nav-dropdown-trigger${moreLinks.some((item) => currentPath === item.path) ? ' is-active' : ''}`} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} type="button">
              <MoreHorizontal size={18} /><span>More</span><ChevronDown className={moreOpen ? 'chevron-rotated' : ''} size={13} />
            </button>
            {moreOpen && <div className="dropdown-menu">{moreLinks.map((item) => link(item, 'dropdown-link'))}</div>}
          </div>
        </nav>
        <div className="header-actions">
          <button className="theme-button" aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`} onClick={() => setDarkMode(!darkMode)} type="button">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
          {authLoading ? null : user === null ? (
            <>
              <a className="button header-complaint" href="/complaint" onClick={(event) => navigate(event, '/complaint')}><MessageSquareWarning size={15} /> Submit complaint</a>
              <a className="login-link" href="/login" onClick={(event) => navigate(event, '/login')}>Log in</a>
              <a className="button button-small" href="/signup" onClick={(event) => navigate(event, '/signup')}>Create account <ArrowRight size={14} /></a>
            </>
          ) : (
            <div className="dropdown-anchor">
              <button className="user-avatar" aria-label="Open account menu" aria-expanded={avatarOpen} onClick={() => setAvatarOpen(!avatarOpen)} type="button">{user.displayName?.trim().charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'S'}<ChevronDown size={12} /></button>
              {avatarOpen && (
                <div className="dropdown-menu avatar-menu">
                  {memberLinks.map((item) => link(item, 'dropdown-link'))}
                  {isAdmin && link({ label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard }, 'dropdown-link')}
                  <button className="dropdown-link" onClick={logout} type="button"><LogIn size={17} /><span>Logout</span></button>
                </div>
              )}
            </div>
          )}
          <button className="mobile-menu-button" onClick={() => setMenuOpen(true)} type="button" aria-label="Open menu"><Menu size={22} /></button>
        </div>
      </header>

      {authError && currentPath !== '/login' && currentPath !== '/signup' && !currentPath.startsWith('/admin') && (
        <p className="auth-status-error" role="alert">{authError}</p>
      )}

      {renderPage()}

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand-col">
            <a className="brand footer-brand" href="/" onClick={(event) => navigate(event, '/')}>
              <span className="brand-mark"><span>F</span><span>S</span><i /></span>
              <span className="brand-name">free students<span>union</span></span>
            </a>
            <p>Students first. Always.<br />That’s the whole idea.</p>
            <div className="footer-social"><a href="https://www.facebook.com/" aria-label="Visit Facebook" target="_blank" rel="noreferrer"><FacebookIcon /></a><a href="mailto:hello@fsu.edu" aria-label="Email FSU"><Mail size={17} /></a><a href="tel:+15550142025" aria-label="Call FSU"><Phone size={17} /></a></div>
          </div>
          <div className="footer-col"><h3>Quick links</h3>{mainLinks.slice(1, 5).map((item) => link(item, 'footer-link'))}</div>
          <div className="footer-col"><h3>We can help</h3>{link({ label: 'Track a complaint', path: '/track', icon: Search }, 'footer-link')}{link({ label: 'Submit a complaint', path: '/complaint', icon: MessageSquareWarning }, 'footer-link')}{link(moreLinks[1], 'footer-link')}</div>
          <div className="footer-col footer-contact"><h3>About FSU</h3>{link(moreLinks[2], 'footer-link')}{link(moreLinks[0], 'footer-link')}<a className="footer-link" href="mailto:hello@fsu.edu">hello@fsu.edu</a><a className="footer-link" href="tel:+15550142025">+1 (555) 014-2025</a><span className="privacy-footer"><Eye size={13} /> Anonymous complaints are private.</span></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Free Students Union. Made with students, for students.</span><a href="/transparency" onClick={(event) => navigate(event, '/transparency')}>Always in your corner <ArrowRight size={14} /></a></div>
      </footer>

      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        {[
          { label: 'Home', path: '/', icon: House },
          { label: 'Notices', path: '/notices', icon: Bell },
          { label: 'Events', path: '/events', icon: CalendarDays },
        ].map((item) => link(item, 'mobile-tab'))}
        <a className="mobile-tab mobile-tab-complaint" href="/complaint" onClick={(event) => navigate(event, '/complaint')}><span><PlusCircle size={21} /></span><small>Complaint</small></a>
        <button className={`mobile-tab${menuOpen ? ' is-active' : ''}`} onClick={() => setMenuOpen(true)} type="button"><Menu size={20} /><small>Menu</small></button>
      </nav>

      {menuOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setMenuOpen(false)} role="presentation">
          <aside className="mobile-sheet" aria-label="Mobile menu" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-header"><a className="brand" href="/" onClick={(event) => navigate(event, '/')}><span className="brand-mark"><span>F</span><span>S</span><i /></span><span className="brand-name">free students<span>union</span></span></a><button className="sheet-close" onClick={() => setMenuOpen(false)} type="button" aria-label="Close menu"><X size={21} /></button></div>
            <div className="sheet-links">{mainLinks.map((item) => link(item, 'sheet-link'))}<div className="sheet-divider" /><span className="sheet-label">EXPLORE MORE</span>{moreLinks.map((item) => link(item, 'sheet-link'))}<div className="sheet-divider" /><a className="sheet-link" href="/complaint" onClick={(event) => navigate(event, '/complaint')}><MessageSquareWarning size={18} /><span>Submit a complaint</span></a>
              {authLoading ? null : user === null ? <div className="sheet-auth"><a className="button button-primary" href="/login" onClick={(event) => navigate(event, '/login')}>Log in</a><a className="button button-outline" href="/signup" onClick={(event) => navigate(event, '/signup')}>Create account</a></div> : <>{isAdmin && link({ label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard }, 'sheet-link')}<button className="sheet-link" onClick={logout} type="button"><LogIn size={18} /><span>Logout</span></button></>}
            </div>
          </aside>
        </div>
      )}
      <a className="help-bubble" href="/track" onClick={(event) => navigate(event, '/track')} aria-label="Track a complaint"><CircleHelp size={19} /><span>Need a hand?</span></a>
    </div>
  )
}

function ArrowUpRightIcon() {
  return <ArrowRight className="arrow-up-right" size={17} aria-hidden="true" />
}

function FacebookIcon() {
  return <span className="facebook-glyph" aria-hidden="true">f</span>
}

export default App
