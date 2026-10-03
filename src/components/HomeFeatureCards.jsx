import React from 'react';
import { ArrowRight, CalendarDays, MessageCircle, Newspaper } from 'lucide-react';
import { Button } from './ui/button.jsx';

const features = [
  { page: 'complaints', Icon: MessageCircle, eyebrow: 'STUDENT SUPPORT', title: 'Help and guidance', action: 'Contact the FSU', className: 'feature-voice' },
  { page: 'notices', Icon: Newspaper, eyebrow: 'UPDATES', title: 'Notices', action: 'View notices', className: 'feature-notices' },
  { page: 'events', Icon: CalendarDays, eyebrow: 'CAMPUS LIFE', title: 'Events', action: 'View events', className: 'feature-events' },
];

export default function HomeFeatureCards() {
  return (
    <div className="feature-grid">
      {features.map(({ page, Icon, eyebrow, title, action, className }) => (
        <Button key={page} type="button" variant="ghost" className={`feature-card ${className}`} data-page={page}>
          <span className="feature-icon" aria-hidden="true"><Icon /></span>
          <span className="feature-label">{eyebrow}</span>
          <strong>{title}</strong>
          <span className="feature-link">{action}<ArrowRight aria-hidden="true" /></span>
        </Button>
      ))}
    </div>
  );
}
