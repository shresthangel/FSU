import React from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  GraduationCap,
  Home,
  Images,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Button } from './ui/button.jsx';

const navigation = [
  { page: 'home', label: 'Home', Icon: Home },
  { page: 'notices', label: 'Notices', Icon: Bell },
  { page: 'events', label: 'Events', Icon: CalendarDays },
  { page: 'complaints', label: 'Help & private inbox', Icon: MessageCircle },
  { page: 'lostfound', label: 'Lost & Found', Icon: Search },
];

const moreNavigation = [
  { page: 'opportunities', label: 'Opportunities', Icon: GraduationCap },
  { page: 'gallery', label: 'Campus gallery', Icon: Images },
  { page: 'team', label: 'Meet the team', Icon: UsersRound },
  { page: 'admin', label: 'Admin dashboard', Icon: ShieldCheck, className: 'nav-admin hidden' },
];

function Icon({ component: Component, className }) {
  return <Component className={className} aria-hidden="true" focusable="false" strokeWidth={1.7} />;
}

export default function PortalHeader() {
  return (
    <header className="site-header">
      <div className="announcement-bar">
        <span className="announcement-label">FROM YOUR STUDENTS’ UNION</span>
        <span>Updates, events and support for campus life.</span>
        <Button className="announcement-link" variant="link" type="button" data-page="notices">
          View notices <Icon component={ArrowRight} />
        </Button>
      </div>
      <div className="container header-inner">
        <a href="#" className="brand" data-page="home" aria-label="Free Students Union home">
          <span className="brand-mark" aria-hidden="true">FSU</span>
          <span className="brand-lockup"><strong>Free Students’ Union</strong><span>STUDENT PORTAL</span></span>
        </a>
        <Button id="navToggle" className="nav-toggle" variant="outline" size="icon" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mainNav" type="button">
          <Menu className="menu-open-icon" aria-hidden="true" />
          <X className="menu-close-icon" aria-hidden="true" />
        </Button>
        <nav id="mainNav" className="main-nav" aria-label="Main navigation">
          {navigation.map(({ page, label, Icon: PageIcon }) => (
            <a key={page} href="#" data-page={page} className={page === 'home' ? 'active' : undefined} aria-current={page === 'home' ? 'page' : undefined}>
              <Icon component={PageIcon} />
              <span>{label}</span>
            </a>
          ))}
          <div className="nav-more">
            <Button id="moreToggle" className="more-toggle" variant="ghost" type="button" aria-expanded="false" aria-controls="moreMenu">
              <Icon component={MoreHorizontal} />
              <span>More</span>
              <span className="more-chevron" aria-hidden="true">⌄</span>
            </Button>
            <div id="moreMenu" className="more-menu hidden">
              {moreNavigation.map(({ page, label, Icon: PageIcon, className }) => (
                <a key={page} href="#" data-page={page} className={className}>
                  <Icon component={PageIcon} />
                  {label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <div className="header-actions">
          <Button id="themeToggle" className="theme-toggle" variant="outline" size="icon" type="button" aria-label="Switch to dark mode" title="Switch theme">
            <Moon className="theme-icon-moon" aria-hidden="true" />
            <Sun className="theme-icon-sun" aria-hidden="true" />
          </Button>
          <a href="#" className="header-support" data-page="complaints">
            <Icon component={MessageCircle} /><span>Submit complaint</span>
          </a>
          <a href="#" id="authNav" className="header-login" data-page="login" aria-label="Log in">
            <UserRound className="profile-icon" aria-hidden="true" />
            <span id="authNavLabel">Log in</span>
          </a>
          <Button id="createAccountCta" className="btn btn-primary header-create" type="button">
            Create account <Icon component={ArrowRight} className="line-icon" />
          </Button>
        </div>
      </div>
    </header>
  );
}
