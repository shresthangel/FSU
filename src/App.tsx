import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  CircleHelp,
  Eye,
  FileText,
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
  Search,
  Sun,
  Users,
  UserPlus,
  Vote,
  X,
  type LucideIcon,
} from 'lucide-react'
import './App.css'

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
  { label: 'Join FSU', path: '/join-fsu', icon: UserPlus },
]

const adminLinks: NavItem[] = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { label: 'Notices', path: '/admin/notices', icon: Bell },
  { label: 'Complaints', path: '/admin/complaints', icon: MessageSquareWarning },
  { label: 'Events', path: '/admin/events', icon: CalendarDays },
  { label: 'Polls', path: '/admin/polls', icon: Vote },
  { label: 'Approvals', path: '/admin/approvals', icon: CheckCircle },
  { label: 'Gallery', path: '/admin/gallery', icon: Image },
  { label: 'Team', path: '/admin/team', icon: Users },
  { label: 'Decisions', path: '/admin/decisions', icon: FileText },
]

const notices = [
  { category: 'STUDENT LIFE', title: 'Your Union, your say: the semester starts here', date: 'OCT 02, 2026', tone: 'mint' },
  { category: 'CAMPUS UPDATE', title: 'Study spaces open later during midterms', date: 'SEP 28, 2026', tone: 'peach' },
  { category: 'OPPORTUNITY', title: 'Applications are open for student representatives', date: 'SEP 24, 2026', tone: 'lavender' },
]

const events = [
  {
    day: '08',
    month: 'OCT',
    title: 'Campus voices town hall',
    details: 'Bring your questions. Leave with a plan.',
    time: '5:30 PM · Student Commons',
    image: 'photo-1523580494863-6f3031224c94',
    alt: 'Students gathering on a university campus',
  },
  {
    day: '12',
    month: 'OCT',
    title: 'Welcome back, everyone',
    details: 'Good food, new friends, zero awkward icebreakers.',
    time: '12:00 PM · The Quad',
    image: 'photo-1511632765486-a01980e01a18',
    alt: 'Students spending time together outdoors',
  },
  {
    day: '17',
    month: 'OCT',
    title: 'Ideas into action workshop',
    details: 'Make the change you want to see on campus.',
    time: '3:00 PM · Union Studio',
    image: 'photo-1523240795612-9a054b0db644',
    alt: 'Students working together at a table',
  },
]

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [user, setUser] = useState<'guest' | 'student' | 'admin'>('guest')

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

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
    window.history.pushState({}, '', path)
    setCurrentPath(path)
    setMenuOpen(false)
    setMoreOpen(false)
    setAvatarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const logout = () => {
    setUser('guest')
    setAvatarOpen(false)
    window.history.pushState({}, '', '/')
    setCurrentPath('/')
  }

  const login = (event: FormEvent<HTMLFormElement>, role: 'student' | 'admin') => {
    event.preventDefault()
    setUser(role)
    window.history.pushState({}, '', '/')
    setCurrentPath('/')
  }

  const loginAsAdmin = () => {
    setUser('admin')
    window.history.pushState({}, '', '/')
    setCurrentPath('/')
  }

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
            <p>Sign in to follow your complaints, save events, and get more from your Union.</p>
            <form onSubmit={(event) => login(event, 'student')}>
              {currentPath === '/signup' && <label htmlFor="name">Your name</label>}
              {currentPath === '/signup' && <input id="name" name="name" placeholder="Alex Student" required />}
              <label htmlFor="email">University email</label>
              <input id="email" name="email" type="email" placeholder="you@university.edu" required />
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" placeholder="At least 8 characters" required />
              <button className="button button-primary auth-submit" type="submit">
                {currentPath === '/signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16} />
              </button>
            </form>
            <button className="demo-link" onClick={loginAsAdmin} type="button">
              Preview the site as an admin
            </button>
          </div>
        </main>
      )
    }

    if (currentPath.startsWith('/admin')) {
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
          </section>
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
          <div className="notice-grid">
            {notices.map((notice, index) => (
              <a className={`notice-card ${notice.tone}`} href="/notices" key={notice.title} onClick={(event) => navigate(event, '/notices')}>
                <div className="notice-meta"><span>{notice.category}</span><span>0{index + 1}</span></div>
                <h3>{notice.title}</h3>
                <div className="notice-bottom"><span>{notice.date}</span><span className="round-arrow"><ArrowRight size={16} /></span></div>
              </a>
            ))}
          </div>
        </section>

        <section className="events-section">
          <div className="section-heading">
            <div><span className="eyebrow"><span className="tiny-spark">✳</span> SAVE YOUR SEAT</span><h2>Campus is better<br />when we’re together.</h2></div>
            <a className="section-link" href="/events" onClick={(event) => navigate(event, '/events')}>See all events <ArrowRight size={16} /></a>
          </div>
          <div className="event-grid">
            {events.map((event) => (
              <a className="event-card" href="/events" key={event.title} onClick={(clickEvent) => navigate(clickEvent, '/events')}>
                <div className="event-image-wrap">
                  <img src={`https://images.unsplash.com/${event.image}?auto=format&fit=crop&w=800&q=80`} alt={event.alt} />
                  <div className="event-date"><strong>{event.day}</strong><span>{event.month}</span></div>
                  <span className="event-arrow"><ArrowUpRightIcon /></span>
                </div>
                <div className="event-info"><span className="event-time">{event.time}</span><h3>{event.title}</h3><p>{event.details}</p></div>
              </a>
            ))}
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
          {user === 'guest' ? (
            <>
              <a className="button header-complaint" href="/complaint" onClick={(event) => navigate(event, '/complaint')}><MessageSquareWarning size={15} /> Submit complaint</a>
              <a className="login-link" href="/login" onClick={(event) => navigate(event, '/login')}>Log in</a>
              <a className="button button-small" href="/signup" onClick={(event) => navigate(event, '/signup')}>Join FSU <ArrowRight size={14} /></a>
            </>
          ) : (
            <div className="dropdown-anchor">
              <button className="user-avatar" aria-label="Open account menu" aria-expanded={avatarOpen} onClick={() => setAvatarOpen(!avatarOpen)} type="button">{user === 'admin' ? 'A' : 'S'}<ChevronDown size={12} /></button>
              {avatarOpen && (
                <div className="dropdown-menu avatar-menu">
                  {memberLinks.filter((item) => item.path !== '/join-fsu').map((item) => link(item, 'dropdown-link'))}
                  {user === 'admin' && link({ label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard }, 'dropdown-link')}
                  <button className="dropdown-link" onClick={logout} type="button"><LogIn size={17} /><span>Logout</span></button>
                </div>
              )}
            </div>
          )}
          <button className="mobile-menu-button" onClick={() => setMenuOpen(true)} type="button" aria-label="Open menu"><Menu size={22} /></button>
        </div>
      </header>

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
              {user === 'guest' ? <div className="sheet-auth"><a className="button button-primary" href="/login" onClick={(event) => navigate(event, '/login')}>Log in</a><a className="button button-outline" href="/signup" onClick={(event) => navigate(event, '/signup')}>Join FSU</a></div> : <button className="sheet-link" onClick={logout} type="button"><LogIn size={18} /><span>Logout</span></button>}
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
