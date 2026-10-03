import React from 'react';
import { BadgeCheck, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Input } from './ui/input.jsx';
import { Label } from './ui/label.jsx';

export default function AccountPage() {
  return (
    <section id="page-login" className="page">
      <Card className="login-card card">
        <div id="accountSignedOut">
          <CardHeader className="account-card-header">
            <div className="account-heading-icon" aria-hidden="true"><ShieldCheck /></div>
            <p className="eyebrow">FSU PORTAL ACCOUNT</p>
            <CardTitle id="authHeading">Sign in</CardTitle>
            <CardDescription>
              Create an account with any email address. Portal access is enabled after an FSU admin verifies your campus student ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="account-card-content">
            <div id="authSetupNotice" className="alert alert-warning hidden" role="status" />
            <div id="authResult" aria-live="polite" />
            <form id="authForm" className="form mt-1">
              <div id="authNameField" className="field hidden">
                <Label htmlFor="authName">Full name</Label>
                <Input id="authName" type="text" autoComplete="name" />
              </div>
              <div className="field">
                <Label htmlFor="authEmail"><Mail aria-hidden="true" />Email</Label>
                <Input id="authEmail" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" />
              </div>
              <div className="field">
                <Label htmlFor="authPassword"><KeyRound aria-hidden="true" />Password</Label>
                <Input id="authPassword" type="password" autoComplete="current-password" minLength={1} required placeholder="Password" />
              </div>
              <Button id="authSubmit" className="btn btn-primary" type="submit">Sign in</Button>
            </form>
            <div className="auth-actions">
              <Button id="authModeToggle" className="text-link" variant="link" type="button">Create a student account</Button>
              <Button id="resetPassword" className="text-link" variant="link" type="button">Forgot password?</Button>
            </div>
          </CardContent>
        </div>

        <div id="accountSignedIn" className="hidden">
          <CardHeader className="account-card-header">
            <div className="account-heading-icon" aria-hidden="true"><BadgeCheck /></div>
            <p id="accountRoleEyebrow" className="eyebrow">YOUR STUDENT ACCOUNT</p>
            <CardTitle id="accountHeading">You're signed in</CardTitle>
            <CardDescription id="accountEmail" className="muted" />
          </CardHeader>
          <CardContent className="account-card-content">
            <div id="accountVerificationNotice" className="alert alert-info" role="status" />
            <div id="accountAccessNotice" className="alert alert-warning hidden" role="status" />
            <Card id="studentVerificationPanel" className="card hidden">
              <p className="eyebrow">CAMPUS MEMBERSHIP CHECK</p>
              <h3 id="studentVerificationHeading">Verify your student account</h3>
              <p id="studentVerificationDescription" className="muted small">
                Enter the student ID issued by your campus. An FSU admin will check it before portal access is enabled.
              </p>
              <div id="studentVerificationResult" aria-live="polite" />
              <form id="studentVerificationForm" className="form">
                <div className="field">
                  <Label htmlFor="campusStudentId">Campus student ID</Label>
                  <Input id="campusStudentId" type="text" autoComplete="off" maxLength={64} required placeholder="Enter the ID on your student card" />
                </div>
                <Button className="btn btn-primary" type="submit">Submit for verification</Button>
              </form>
            </Card>
            <div id="student-id-card" className="student-id-card">
              <span className="muted small">Your private student ID</span>
              <strong id="studentId" />
              <Button id="copyStudentId" type="button" className="btn btn-outline btn-sm" variant="outline">Copy ID</Button>
            </div>
            <p className="muted small">Use this ID when contacting the FSU. Staff can reply to your private inbox.</p>
            <div className="card-actions">
              <Button id="accountPrimaryAction" className="btn btn-primary" data-page="complaints">Open my inbox</Button>
              <Button id="signOut" type="button" className="btn btn-outline" variant="outline">Sign out</Button>
            </div>
          </CardContent>
        </div>
      </Card>
    </section>
  );
}
