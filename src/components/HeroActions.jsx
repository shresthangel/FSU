import React from 'react';
import { ArrowDownRight, ArrowRight } from 'lucide-react';
import { Button } from './ui/button.jsx';

export default function HeroActions() {
  return (
    <div className="hero-actions">
      <Button type="button" size="lg" className="hero-speak-up" data-page="complaints">
        Speak up
        <ArrowRight className="hero-action-icon" aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" className="hero-about" data-page="team">
        Get to know us
        <ArrowDownRight className="hero-action-icon" aria-hidden="true" />
      </Button>
    </div>
  );
}
