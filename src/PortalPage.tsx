import { useEffect, useState, type FormEvent } from 'react'
import {
  doc,
  getDoc,
} from 'firebase/firestore'
import {
  CalendarDays,
  Download,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import type { User } from 'firebase/auth'
import { createSpreadsheet } from './excelExport'
import {
  addGalleryPhoto,
  createLostFoundPost,
  createPoll,
  createSupportThread,
  getEventRegistrations,
  hasVoted,
  moderateLostFound,
  registerForEvent,
  removeEvent,
  removeLostFound,
  removeOpportunity,
  removeGalleryPhoto,
  removePoll,
  saveEvent,
  saveOpportunity,
  sendSupportReply,
  subscribeEventRegistrations,
  subscribeEvents,
  subscribeGallery,
  subscribeLostFound,
  subscribeOpportunities,
  subscribePolls,
  subscribeSupportMessages,
  subscribeSupportThreads,
  updateSupportThread,
  voteInPoll,
  type EventRecord,
  type EventRegistration,
  type GalleryRecord,
  type LostFoundRecord,
  type OpportunityKind,
  type OpportunityRecord,
  type PollRecord,
  type SupportMessage,
  type SupportStatus,
  type SupportThread,
} from './portal'
import { firebaseConfigured, db } from './firebase'

type Props = {
  path: string
  user: User | null
  isAdmin: boolean
  emailVerified: boolean
  authLoading: boolean
  onNavigate: (path: string) => void
}

const opportunityKinds: OpportunityKind[] = ['scholarship', 'internship', 'training', 'competition', 'resource']
const supportCategories = ['Campus facilities', 'Academic', 'Wellbeing', 'Fees and finance', 'Other']
const supportStatuses: SupportStatus[] = ['Received', 'In progress', 'Solved']
const dataRoutes = new Set([
  '/events', '/my-events', '/admin/events', '/admin', '/complaint', '/my-complaints',
  '/admin/complaints', '/polls', '/admin/polls', '/opportunities', '/admin/opportunities',
  '/lost-found', '/admin/lost-found', '/gallery', '/admin/gallery',
])
const teamMembers = [
  { name: 'Nabin', role: 'Frontend / Backend' },
  { name: 'Binam', role: 'Frontend / Backend' },
  { name: 'Aabhas', role: 'Resources & Analysis' },
  { name: 'Angel', role: 'Testing and Feedback' },
]

const readableDate = (value: string) => value ? new Date(value).toLocaleString() : '—'
const formatForInput = (value?: string) => value ? new Date(value).toISOString().slice(0, 16) : ''
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Please try again.'

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')

const downloadCalendarEvent = (event: EventRecord) => {
  const utc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FSU//Campus Events//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@fsu-campus`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(event.startAt)}`,
    `DTEND:${utc(event.endAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  link.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'fsu-event'}.ics`
  link.click()
  URL.revokeObjectURL(link.href)
}

function MessageBox({ children, error = false }: { children: string; error?: boolean }) {
  return <p className={error ? 'portal-message portal-message-error' : 'portal-message'} role={error ? 'alert' : 'status'}>{children}</p>
}

function PortalPage({ path, user, isAdmin, emailVerified, authLoading, onNavigate }: Props) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [polls, setPolls] = useState<PollRecord[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([])
  const [lostFound, setLostFound] = useState<LostFoundRecord[]>([])
  const [gallery, setGallery] = useState<GalleryRecord[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(() => firebaseConfigured ? null : 'Firebase is not configured. Add the project settings to load portal data.')
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [registeringEventId, setRegisteringEventId] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null)
  const [registrationEventId, setRegistrationEventId] = useState<string | null>(null)
  const [registrations, setRegistrations] = useState<EventRegistration[]>([])
  const [editingOpportunity, setEditingOpportunity] = useState<OpportunityRecord | null>(null)
  const [votedPolls, setVotedPolls] = useState<Record<string, boolean>>({})
  const [working, setWorking] = useState(false)
  const [eventRegistrationCount, setEventRegistrationCount] = useState(0)

  const isAdminRoute = path.startsWith('/admin')

  useEffect(() => {
    if (!firebaseConfigured) return
    const fail = (reason: Error) => {
      setError(errorText(reason))
      setDataLoading(false)
    }
    const loaded = <T,>(setter: (value: T) => void) => (value: T) => {
      setter(value)
      setDataLoading(false)
    }
    const unsubscribers: (() => void)[] = []
    const listen = (unsubscribe: () => void) => unsubscribers.push(unsubscribe)

    if (path === '/events' || path === '/my-events' || path === '/admin/events') {
      listen(subscribeEvents(isAdmin && isAdminRoute, loaded(setEvents), fail))
    }
    if (path === '/complaint' || path === '/my-complaints' || path === '/admin/complaints' || path === '/admin') {
      if (user && emailVerified) {
        listen(subscribeSupportThreads(user.uid, isAdmin && isAdminRoute, loaded(setThreads), fail))
      }
    }
    if (path === '/polls' || path === '/admin/polls') {
      listen(subscribePolls(isAdmin && isAdminRoute, loaded(setPolls), fail))
    }
    if (path === '/opportunities' || path === '/admin/opportunities') {
      listen(subscribeOpportunities(isAdmin && isAdminRoute, loaded(setOpportunities), fail))
    }
    if (path === '/lost-found' || path === '/admin/lost-found') {
      listen(subscribeLostFound(isAdmin && isAdminRoute, user?.uid ?? '', loaded(setLostFound), fail))
    }
    if (path === '/gallery' || path === '/admin/gallery') {
      listen(subscribeGallery(loaded(setGallery), fail))
    }
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [path, isAdmin, isAdminRoute, user, emailVerified])

  useEffect(() => {
    if (!selectedThreadId || !firebaseConfigured) return
    return subscribeSupportMessages(selectedThreadId, setMessages, (reason) => setError(errorText(reason)))
  }, [selectedThreadId])

  useEffect(() => {
    if (!user || path !== '/polls' || !firebaseConfigured) return
    let active = true
    void Promise.all(polls.map(async (poll) => [poll.id, await hasVoted(poll.id, user.uid)] as const))
      .then((entries) => {
        if (active) setVotedPolls(Object.fromEntries(entries))
      })
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason))
      })
    return () => { active = false }
  }, [polls, path, user])

  useEffect(() => {
    if (path !== '/admin') return
    const unsubscribeList: (() => void)[] = []
    const registrationCounts: Record<string, number> = {}
    let active = true
    const unsubEvents = subscribeEvents(true, (items) => {
      setEvents(items)
      setDataLoading(false)
      unsubscribeList.splice(0).forEach((unsubscribe) => unsubscribe())
      items.forEach((event) => {
        unsubscribeList.push(subscribeEventRegistrations(event.id, (registrations) => {
          registrationCounts[event.id] = registrations.length
          if (active) setEventRegistrationCount(Object.values(registrationCounts).reduce((sum, count) => sum + count, 0))
        }, (reason) => setError(errorText(reason))))
      })
    }, (reason) => setError(errorText(reason)))
    return () => {
      active = false
      unsubEvents()
      unsubscribeList.forEach((unsubscribe) => unsubscribe())
    }
  }, [path])

  const requireSignedIn = (supportOnly = false) => {
    if (!user) {
      onNavigate('/login')
      return false
    }
    if (supportOnly && !emailVerified) {
      onNavigate('/verify-email')
      return false
    }
    return true
  }

  const selectThread = (threadId: string) => {
    setMessages([])
    setSelectedThreadId(threadId)
  }

  const runOperation = async (operation: () => Promise<unknown>, successMessage: string) => {
    setWorking(true)
    setError(null)
    setSuccess(null)
    try {
      await operation()
      setSuccess(successMessage)
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    } finally {
      setWorking(false)
    }
  }

  const register = async (event: FormEvent<HTMLFormElement>, eventId: string) => {
    event.preventDefault()
    if (!requireSignedIn()) return
    const attendeeUid = user?.uid
    if (!attendeeUid) return
    const formElement = event.currentTarget
    const values = new FormData(formElement)
    const attendee = {
      name: String(values.get('name') ?? '').trim(),
      email: String(values.get('email') ?? '').trim(),
      phone: String(values.get('phone') ?? '').trim(),
      department: String(values.get('department') ?? '').trim(),
      notes: String(values.get('notes') ?? '').trim(),
    }
    if (await runOperation(() => registerForEvent(eventId, attendeeUid, attendee), 'You are registered for this event.')) {
      setRegisteringEventId(null)
      formElement.reset()
    }
  }

  const exportRegistrations = async (event: EventRecord) => {
    await runOperation(async () => {
      const registrations = await getEventRegistrations(event.id)
      const rows = registrations.map(({ name, email, phone, department, notes, registeredAt }) => ({
        Name: name,
        Email: email,
        Phone: phone,
        Department: department,
        Notes: notes,
        'Registration time': readableDate(registeredAt),
      }))
      const spreadsheet = createSpreadsheet('Registrations', [
        { header: 'Name', width: 24 },
        { header: 'Email', width: 32 },
        { header: 'Phone', width: 20 },
        { header: 'Department', width: 24 },
        { header: 'Notes', width: 40 },
        { header: 'Registration time', width: 28 },
      ], rows.map(({ Name, Email, Phone, Department, Notes, 'Registration time': registrationTime }) =>
        [Name, Email, Phone, Department, Notes, registrationTime],
      ))
      const buffer = new ArrayBuffer(spreadsheet.byteLength)
      new Uint8Array(buffer).set(spreadsheet)
      const file = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-registrations.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    }, 'Registration spreadsheet downloaded.')
  }

  const viewRegistrations = async (eventId: string) => {
    if (await runOperation(async () => {
      setRegistrations(await getEventRegistrations(eventId))
      setRegistrationEventId(eventId)
    }, 'Attendee details loaded.')) return
    setRegistrationEventId(null)
  }

  const saveEventForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const startAt = String(form.get('startAt') ?? '')
    const endAt = String(form.get('endAt') ?? '')
    if (Date.parse(startAt) >= Date.parse(endAt)) {
      setError('The event end time must be after its start time.')
      return
    }
    const succeeded = await runOperation(() => saveEvent({
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      location: String(form.get('location') ?? '').trim(),
      startAt,
      endAt,
      published: form.get('published') === 'on',
    }, editingEvent?.id), editingEvent ? 'Event updated.' : 'Event created.')
    if (succeeded) setEditingEvent(null)
  }

  const submitSupport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignedIn(true)) return
    const form = new FormData(event.currentTarget)
    const category = String(form.get('category') ?? '')
    const body = String(form.get('message') ?? '').trim()
    if (await runOperation(async () => {
      const threadId = await createSupportThread(user!.uid, category, body)
      setSelectedThreadId(threadId)
    }, 'Your private support request was sent.')) event.currentTarget.reset()
  }

  const replyToThread = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedThreadId || !user) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const body = String(form.get('reply') ?? '').trim()
    if (await runOperation(() => sendSupportReply(selectedThreadId, user.uid, body), 'Your reply was sent.')) formElement.reset()
  }

  const updateThread = async (thread: SupportThread, form: FormEvent<HTMLFormElement>) => {
    form.preventDefault()
    const values = new FormData(form.currentTarget)
    const assignedTo = String(values.get('assignedTo') ?? '').trim() || null
    const status = String(values.get('status') ?? '') as SupportStatus
    if (!supportStatuses.includes(status)) {
      setError('Choose a valid support status.')
      return
    }
    await runOperation(() => updateSupportThread(thread.id, status, assignedTo), 'Support request updated.')
  }

  const submitVote = async (event: FormEvent<HTMLFormElement>, poll: PollRecord) => {
    event.preventDefault()
    if (!requireSignedIn()) return
    const ownerUid = user?.uid
    if (!ownerUid) return
    const form = new FormData(event.currentTarget)
    const optionId = String(form.get(`poll-${poll.id}`) ?? '')
    if (await runOperation(() => voteInPoll(poll.id, ownerUid, optionId), 'Your vote has been recorded.')) {
      setVotedPolls((current) => ({ ...current, [poll.id]: true }))
    }
  }

  const submitPoll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const question = String(form.get('question') ?? '').trim()
    const options = String(form.get('options') ?? '').split('\n').map((option) => option.trim()).filter(Boolean)
    if (options.length < 2 || new Set(options).size !== options.length) {
      setError('Add at least two different poll options, one per line.')
      return
    }
    if (await runOperation(() => createPoll(question, options), 'Poll created.')) formElement.reset()
  }

  const submitOpportunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const type = String(form.get('type') ?? '') as OpportunityKind
    if (!opportunityKinds.includes(type)) {
      setError('Choose a valid opportunity type.')
      return
    }
    const url = String(form.get('url') ?? '').trim()
    if (url && !/^https?:\/\//i.test(url)) {
      setError('Links must start with http:// or https://.')
      return
    }
    const succeeded = await runOperation(() => saveOpportunity({
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      type,
      url,
      published: form.get('published') === 'on',
    }, editingOpportunity?.id), editingOpportunity ? 'Opportunity updated.' : 'Opportunity saved.')
    if (succeeded) {
      setEditingOpportunity(null)
      formElement.reset()
    }
  }

  const submitLostFound = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!requireSignedIn()) return
    const ownerUid = user?.uid
    if (!ownerUid) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const kind = String(form.get('kind') ?? '')
    const email = String(form.get('contactEmail') ?? '').trim()
    const phone = String(form.get('contactPhone') ?? '').trim()
    if (kind !== 'lost' && kind !== 'found') {
      setError('Choose whether the item is lost or found.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+\d][\d\s().-]{6,19}$/.test(phone)) {
      setError('Enter a valid contact email and phone number.')
      return
    }
    const file = form.get('photo')
    const imageFile = file instanceof File && file.size ? file : undefined
    if (await runOperation(() => createLostFoundPost(ownerUid, {
      itemName: String(form.get('itemName') ?? '').trim(),
      kind,
      location: String(form.get('location') ?? '').trim(),
      contactName: String(form.get('contactName') ?? '').trim(),
      contactEmail: email,
      contactPhone: phone,
      description: String(form.get('description') ?? '').trim(),
    }, imageFile), 'Your item was submitted for admin approval.')) formElement.reset()
  }

  const submitGalleryPhoto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const file = form.get('photo')
    if (!(file instanceof File) || !file.size) {
      setError('Choose an event photo to upload.')
      return
    }
    if (await runOperation(() => addGalleryPhoto(file, String(form.get('caption') ?? '').trim(), user.uid), 'Gallery photo uploaded.')) formElement.reset()
  }

  if (authLoading) return <main className="portal-page"><MessageBox>Checking account permissions…</MessageBox></main>
  if (isAdminRoute && (!user || !emailVerified || !isAdmin)) {
    return (
      <main className="portal-page">
        <h1>Administrator access required</h1>
        <p>Sign in with a verified account that has an administrator record to use these tools.</p>
        <button className="button button-primary" onClick={() => onNavigate(user ? '/verify-email' : '/login')} type="button">
          {user ? 'Verify email' : 'Sign in'}
        </button>
      </main>
    )
  }

  const privateSupportPath = ['/complaint', '/my-complaints', '/admin/complaints'].includes(path)
  const waitingForData = firebaseConfigured
    && dataRoutes.has(path)
    && dataLoading
    && (!privateSupportPath || (user !== null && emailVerified))
  const titleMap: Record<string, string> = {
    '/events': 'Campus events',
    '/polls': 'Student polls',
    '/opportunities': 'Opportunities and resources',
    '/lost-found': 'Lost and found',
    '/gallery': 'Campus gallery',
    '/team': 'Meet the FSU team',
    '/complaint': 'Private support',
    '/my-complaints': 'My support conversations',
    '/my-events': 'My events',
    '/profile': 'Your account',
    '/admin': 'Admin dashboard',
    '/admin/events': 'Manage events',
    '/admin/complaints': 'Support inbox',
    '/admin/polls': 'Manage polls',
    '/admin/opportunities': 'Manage opportunities',
    '/admin/lost-found': 'Lost and found moderation',
    '/admin/gallery': 'Manage gallery',
  }

  return (
    <main className="portal-page">
      <header className="portal-heading">
        <span className="eyebrow">{isAdminRoute ? 'FSU ADMINISTRATION' : 'FREE STUDENTS UNION'}</span>
        <h1>{titleMap[path] ?? 'Campus portal'}</h1>
        {path === '/admin' && <p>Live operations and recent student activity.</p>}
      </header>
      {isAdminRoute && <AdminNavigation path={path} onNavigate={onNavigate} />}
      {error && <MessageBox error>{error}</MessageBox>}
      {success && <MessageBox>{success}</MessageBox>}
      {waitingForData && <MessageBox>Loading portal data…</MessageBox>}

      {path === '/events' && <EventsView events={events} user={user} registeringEventId={registeringEventId} setRegisteringEventId={setRegisteringEventId} onRegister={register} onCalendar={downloadCalendarEvent} onNavigate={onNavigate} />}
      {path === '/admin/events' && <AdminEvents events={events} editingEvent={editingEvent} setEditingEvent={setEditingEvent} onSave={saveEventForm} onDelete={(id) => void runOperation(() => removeEvent(id), 'Event deleted.')} onExport={exportRegistrations} onViewRegistrations={viewRegistrations} registrationEventId={registrationEventId} registrations={registrations} working={working} />}
      {(path === '/complaint' || path === '/my-complaints' || path === '/admin/complaints') && (
        <SupportView path={path} user={user} verified={emailVerified} isAdmin={isAdmin} threads={threads} messages={messages} selectedThreadId={selectedThreadId} onSelectThread={selectThread} onSubmit={submitSupport} onReply={replyToThread} onUpdateThread={updateThread} onNavigate={onNavigate} />
      )}
      {path === '/admin' && <Dashboard threads={threads} registrationCount={eventRegistrationCount} />}
      {path === '/polls' && <PollsView polls={polls} user={user} voted={votedPolls} onVote={submitVote} onNavigate={onNavigate} />}
      {path === '/admin/polls' && <AdminPolls polls={polls} onCreate={submitPoll} onDelete={(id) => void runOperation(() => removePoll(id), 'Poll deleted.')} />}
      {path === '/opportunities' && <OpportunitiesView items={opportunities} />}
      {path === '/admin/opportunities' && <AdminOpportunities items={opportunities} editing={editingOpportunity} setEditing={setEditingOpportunity} onSave={submitOpportunity} onDelete={(id) => void runOperation(() => removeOpportunity(id), 'Opportunity deleted.')} />}
      {path === '/lost-found' && <LostFoundView items={lostFound} user={user} onSubmit={submitLostFound} onNavigate={onNavigate} />}
      {path === '/admin/lost-found' && <AdminLostFound items={lostFound} onModerate={(item, approved) => void runOperation(() => moderateLostFound(item.id, approved), approved ? 'Item approved.' : 'Item hidden.')} onDelete={(item) => void runOperation(() => removeLostFound(item), 'Post removed.')} />}
      {(path === '/gallery' || path === '/admin/gallery') && <GalleryView items={gallery} admin={isAdminRoute} user={user} onUpload={submitGalleryPhoto} onDelete={(item) => void runOperation(() => removeGalleryPhoto(item), 'Gallery photo removed.')} />}
      {path === '/team' && <TeamView />}
      {path === '/profile' && <ProfileView user={user} verified={emailVerified} onNavigate={onNavigate} />}
      {path === '/my-events' && <MyEventsView events={events} user={user} onCalendar={downloadCalendarEvent} />}
    </main>
  )
}

function EventsView({ events, user, registeringEventId, setRegisteringEventId, onRegister, onCalendar, onNavigate }: {
  events: EventRecord[]
  user: User | null
  registeringEventId: string | null
  setRegisteringEventId: (id: string | null) => void
  onRegister: (event: FormEvent<HTMLFormElement>, eventId: string) => void
  onCalendar: (event: EventRecord) => void
  onNavigate: (path: string) => void
}) {
  return <div className="portal-card-grid">
    {events.map((event) => (
      <article className="portal-card" key={event.id}>
        <span className="portal-tag">{readableDate(event.startAt)}</span>
        <h2>{event.title}</h2><p>{event.description}</p><p><strong>Where:</strong> {event.location}</p>
        <div className="portal-actions">
          <button className="button button-outline" onClick={() => onCalendar(event)} type="button"><CalendarDays size={15} /> Add reminder</button>
          {user && <button className="button button-primary" onClick={() => setRegisteringEventId(registeringEventId === event.id ? null : event.id)} type="button">Register</button>}
          {!user && <button className="button button-primary" onClick={() => onNavigate('/login')} type="button">Sign in to register</button>}
        </div>
        {registeringEventId === event.id && <form className="portal-form" onSubmit={(form) => onRegister(form, event.id)}>
          <label>Name<input name="name" defaultValue={user?.displayName ?? ''} required maxLength={100} /></label>
          <label>Email<input name="email" type="email" defaultValue={user?.email ?? ''} required /></label>
          <label>Phone<input name="phone" required pattern="[+0-9 ()-]{7,20}" /></label>
          <label>Department<input name="department" required maxLength={100} /></label>
          <label>Notes<textarea name="notes" maxLength={500} /></label>
          <button className="button button-primary" type="submit">Confirm registration</button>
        </form>}
      </article>
    ))}
    {!events.length && <p className="portal-empty">No upcoming events have been published yet.</p>}
  </div>
}

function AdminEvents({ events, editingEvent, setEditingEvent, onSave, onDelete, onExport, onViewRegistrations, registrationEventId, registrations, working }: {
  events: EventRecord[]
  editingEvent: EventRecord | null
  setEditingEvent: (event: EventRecord | null) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onDelete: (id: string) => void
  onExport: (event: EventRecord) => void
  onViewRegistrations: (eventId: string) => void
  registrationEventId: string | null
  registrations: EventRegistration[]
  working: boolean
}) {
  return <div className="portal-stack">
    <section className="admin-panel">
      <h2>{editingEvent ? 'Edit event' : 'Create event'}</h2>
      <form className="portal-form portal-form-grid" key={editingEvent?.id ?? 'new-event'} onSubmit={onSave}>
        <label>Title<input name="title" defaultValue={editingEvent?.title} required maxLength={120} /></label>
        <label>Location<input name="location" defaultValue={editingEvent?.location} required maxLength={160} /></label>
        <label>Starts<input name="startAt" type="datetime-local" defaultValue={formatForInput(editingEvent?.startAt)} required /></label>
        <label>Ends<input name="endAt" type="datetime-local" defaultValue={formatForInput(editingEvent?.endAt)} required /></label>
        <label className="portal-wide">Description<textarea name="description" defaultValue={editingEvent?.description} required maxLength={2000} rows={3} /></label>
        <label className="portal-check"><input type="checkbox" name="published" defaultChecked={editingEvent?.published ?? true} /> Publish event</label>
        <div className="portal-actions portal-wide"><button className="button button-primary" disabled={working} type="submit">{editingEvent ? 'Save event' : 'Create event'}</button>{editingEvent && <button className="button button-outline" onClick={() => setEditingEvent(null)} type="button">Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-panel"><h2>Events and registrations</h2>
      {events.map((event) => <article className="portal-admin-row" key={event.id}>
        <div><strong>{event.title}</strong><p>{readableDate(event.startAt)} · {event.published ? 'Published' : 'Hidden'}</p></div>
        <div className="portal-actions">
          <button className="button button-outline" onClick={() => onExport(event)} type="button"><Download size={15} /> Export .xlsx</button>
          <button className="button button-outline" onClick={() => onViewRegistrations(event.id)} type="button">View attendees</button>
          <button className="button button-outline" onClick={() => setEditingEvent(event)} type="button">Edit</button>
          <button className="button button-danger" onClick={() => onDelete(event.id)} type="button"><Trash2 size={15} /> Delete</button>
        </div>
      </article>)}
      {registrationEventId && <div className="registration-details">
        <h3>Attendees · {events.find((event) => event.id === registrationEventId)?.title}</h3>
        {registrations.length ? <div className="registration-table-wrap"><table className="registration-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Notes</th><th>Registered</th></tr></thead>
          <tbody>{registrations.map((registration) => <tr key={registration.uid}><td>{registration.name}</td><td>{registration.email}</td><td>{registration.phone}</td><td>{registration.department}</td><td>{registration.notes}</td><td>{readableDate(registration.registeredAt)}</td></tr>)}</tbody>
        </table></div> : <p className="portal-empty">No students have registered for this event.</p>}
      </div>}
      {!events.length && <p className="portal-empty">No events created yet.</p>}
    </section>
  </div>
}

function SupportView({ path, user, verified, isAdmin, threads, messages, selectedThreadId, onSelectThread, onSubmit, onReply, onUpdateThread, onNavigate }: {
  path: string
  user: User | null
  verified: boolean
  isAdmin: boolean
  threads: SupportThread[]
  messages: SupportMessage[]
  selectedThreadId: string | null
  onSelectThread: (id: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onReply: (event: FormEvent<HTMLFormElement>) => void
  onUpdateThread: (thread: SupportThread, event: FormEvent<HTMLFormElement>) => void
  onNavigate: (path: string) => void
}) {
  const activeThread = threads.find((thread) => thread.id === selectedThreadId)
  if (!user || !verified) return <section className="admin-panel"><p>Sign in and verify your email to access private support requests.</p><button className="button button-primary" onClick={() => onNavigate(user ? '/verify-email' : '/login')} type="button">{user ? 'Verify email' : 'Sign in'}</button></section>

  return <div className="support-layout">
    {path === '/complaint' && <section className="admin-panel">
      <h2>Start a private conversation</h2>
      <form className="portal-form" onSubmit={onSubmit}>
        <label>Category<select name="category" required>{supportCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>Message<textarea name="message" required minLength={5} maxLength={3000} rows={5} placeholder="Tell the FSU team what you need help with." /></label>
        <button className="button button-primary" type="submit">Send private request</button>
      </form>
    </section>}
    <section className="admin-panel">
      <h2>{isAdmin ? 'Support queue' : 'Conversations'}</h2>
      {threads.map((thread) => <button className={`support-thread${selectedThreadId === thread.id ? ' is-active' : ''}`} key={thread.id} onClick={() => onSelectThread(thread.id)} type="button">
        <span className="portal-tag">{thread.status}</span><strong>{thread.category}</strong><small>{readableDate(thread.updatedAt)}</small><span>{thread.lastMessage}</span>{isAdmin && <small>Student: {thread.ownerUid}</small>}
      </button>)}
      {!threads.length && <p className="portal-empty">No support conversations yet.</p>}
    </section>
    {activeThread && <section className="admin-panel support-conversation">
      <h2>{activeThread.category}</h2>
      <p>Status: {activeThread.status} · Opened {readableDate(activeThread.createdAt)}</p>
      {isAdmin && <form className="portal-form portal-form-grid" onSubmit={(event) => onUpdateThread(activeThread, event)}>
        <label>Status<select name="status" defaultValue={activeThread.status}>{supportStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Assigned admin UID<input name="assignedTo" defaultValue={activeThread.assignedTo ?? ''} placeholder="Leave blank to unassign" /></label>
        <button className="button button-outline portal-wide" type="submit">Save assignment and status</button>
      </form>}
      <div className="support-messages">{messages.map((message) => <article className="support-message" key={message.id}>
        <strong>{message.senderUid === user.uid ? 'You' : isAdmin ? `Student ${activeThread.ownerUid.slice(0, 6)}` : 'FSU team'}</strong><time>{readableDate(message.createdAt)}</time><p>{message.body}</p>
      </article>)}</div>
      {(activeThread.status !== 'Solved' || isAdmin) && <form className="portal-form" onSubmit={onReply}><label>Reply<textarea name="reply" required minLength={1} maxLength={3000} rows={3} /></label><button className="button button-primary" type="submit">Send reply</button></form>}
    </section>}
  </div>
}

function Dashboard({ threads, registrationCount }: { threads: SupportThread[]; registrationCount: number }) {
  const statusCounts = Object.fromEntries(supportStatuses.map((status) => [status, threads.filter((thread) => thread.status === status).length]))
  return <div className="portal-stack">
    <div className="portal-metrics">
      {supportStatuses.map((status) => <article className="admin-stat" key={status}><span>{status} requests</span><strong>{statusCounts[status]}</strong></article>)}
      <article className="admin-stat"><span>Event registrations</span><strong>{registrationCount}</strong><small>Across published and draft events</small></article>
    </div>
    <section className="admin-panel"><h2>Recent support activity</h2>
      {threads.slice(0, 8).map((thread) => <div className="portal-admin-row" key={thread.id}><div><strong>{thread.category} · {thread.status}</strong><p>{thread.lastMessage}</p></div><time>{readableDate(thread.updatedAt)}</time></div>)}
      {!threads.length && <p className="portal-empty">No support requests yet.</p>}
    </section>
  </div>
}

function PollsView({ polls, user, voted, onVote, onNavigate }: {
  polls: PollRecord[]
  user: User | null
  voted: Record<string, boolean>
  onVote: (event: FormEvent<HTMLFormElement>, poll: PollRecord) => void
  onNavigate: (path: string) => void
}) {
  return <div className="portal-card-grid">{polls.map((poll) => {
    const total = Object.values(poll.results).reduce((sum, count) => sum + (Number(count) || 0), 0)
    const showResults = Boolean(voted[poll.id])
    return <article className="portal-card" key={poll.id}>
      <span className="portal-tag">{poll.active ? 'Open' : 'Closed'}</span><h2>{poll.question}</h2>
      {showResults ? <div className="poll-results">{poll.options.map((option) => {
        const count = Number(poll.results[option.id]) || 0
        return <div className="poll-result" key={option.id}><div><span>{option.label}</span><strong>{count} ({total ? Math.round(count / total * 100) : 0}%)</strong></div><progress value={count} max={Math.max(1, total)} /></div>
      })}<small>{total} vote{total === 1 ? '' : 's'}</small></div> : poll.active && user ? <form className="portal-form" onSubmit={(event) => onVote(event, poll)}>
        {poll.options.map((option) => <label className="portal-choice" key={option.id}><input type="radio" name={`poll-${poll.id}`} value={option.id} required />{option.label}</label>)}
        <button className="button button-primary" type="submit">Vote</button>
      </form> : poll.active ? <button className="button button-primary" onClick={() => onNavigate('/login')} type="button">Sign in to vote</button> : <p>This poll is closed.</p>}
    </article>
  })}{!polls.length && <p className="portal-empty">No active polls right now.</p>}</div>
}

function AdminPolls({ polls, onCreate, onDelete }: {
  polls: PollRecord[]
  onCreate: (event: FormEvent<HTMLFormElement>) => void
  onDelete: (id: string) => void
}) {
  return <div className="portal-stack">
    <section className="admin-panel"><h2>Create poll</h2><form className="portal-form" onSubmit={onCreate}>
      <label>Question<input name="question" required maxLength={300} /></label>
      <label>Options (one per line)<textarea name="options" required minLength={3} rows={4} placeholder={'Option one\\nOption two'} /></label>
      <button className="button button-primary" type="submit">Create poll</button>
    </form></section>
    {polls.map((poll) => <article className="admin-panel" key={poll.id}><div className="portal-admin-row"><h2>{poll.question}</h2><button className="button button-danger" onClick={() => onDelete(poll.id)} type="button"><Trash2 size={15} /> Delete</button></div>
      <ul>{poll.options.map((option) => <li key={option.id}>{option.label}: {poll.results[option.id] ?? 0}</li>)}</ul>
    </article>)}
  </div>
}

function OpportunitiesView({ items }: { items: OpportunityRecord[] }) {
  return <div className="portal-card-grid">{items.filter((item) => item.published).map((item) => <article className="portal-card" key={item.id}>
    <span className="portal-tag">{item.type}</span><h2>{item.title}</h2><p>{item.description}</p>{item.url && <a className="button button-outline" href={item.url} target="_blank" rel="noreferrer">View opportunity</a>}
  </article>)}{!items.some((item) => item.published) && <p className="portal-empty">No opportunities have been published yet.</p>}</div>
}

function AdminOpportunities({ items, editing, setEditing, onSave, onDelete }: {
  items: OpportunityRecord[]
  editing: OpportunityRecord | null
  setEditing: (item: OpportunityRecord | null) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onDelete: (id: string) => void
}) {
  return <div className="portal-stack">
    <section className="admin-panel"><h2>{editing ? 'Edit opportunity' : 'Add opportunity'}</h2><form className="portal-form" onSubmit={onSave}>
      <label>Title<input key={editing?.id ?? 'new-title'} name="title" defaultValue={editing?.title} required maxLength={160} /></label>
      <label>Type<select key={editing?.id ?? 'new-type'} name="type" defaultValue={editing?.type ?? 'scholarship'}>{opportunityKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
      <label>Description<textarea key={editing?.id ?? 'new-description'} name="description" defaultValue={editing?.description} required rows={4} maxLength={3000} /></label>
      <label>URL<input key={editing?.id ?? 'new-url'} name="url" type="url" defaultValue={editing?.url} /></label>
      <label className="portal-check"><input key={editing?.id ?? 'new-published'} type="checkbox" name="published" defaultChecked={editing?.published ?? false} /> Published</label>
      <div className="portal-actions"><button className="button button-primary" type="submit">{editing ? 'Save opportunity' : 'Create opportunity'}</button>{editing && <button className="button button-outline" onClick={() => setEditing(null)} type="button">Cancel</button>}</div>
    </form></section>
    <section className="admin-panel"><h2>All opportunities</h2>{items.map((item) => <article className="portal-admin-row" key={item.id}><div><strong>{item.title}</strong><p>{item.type} · {item.published ? 'Published' : 'Hidden'}</p></div><div className="portal-actions"><button className="button button-outline" onClick={() => setEditing(item)} type="button">Edit</button><button className="button button-danger" onClick={() => onDelete(item.id)} type="button">Delete</button></div></article>)}</section>
  </div>
}

function LostFoundView({ items, user, onSubmit, onNavigate }: {
  items: LostFoundRecord[]
  user: User | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onNavigate: (path: string) => void
}) {
  return <div className="portal-stack">
    {!user && <section className="admin-panel"><p>Sign in to post a lost or found item.</p><button className="button button-primary" onClick={() => onNavigate('/login')} type="button">Sign in</button></section>}
    {user && <section className="admin-panel"><h2>Post a lost or found item</h2><form className="portal-form portal-form-grid" onSubmit={onSubmit}>
      <label>Item name<input name="itemName" required maxLength={120} /></label>
      <label>Post type<select name="kind"><option value="lost">Lost</option><option value="found">Found</option></select></label>
      <label>Location<input name="location" required maxLength={160} /></label>
      <label>Your name<input name="contactName" required maxLength={100} /></label>
      <label>Contact email<input name="contactEmail" type="email" required /></label>
      <label>Contact phone<input name="contactPhone" required pattern="[+0-9 ()-]{7,20}" /></label>
      <label className="portal-wide">Description<textarea name="description" required rows={3} maxLength={1500} /></label>
      <label className="portal-wide">Photo (JPEG, PNG, or WebP; max 5 MB)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <button className="button button-primary portal-wide" type="submit">Submit for approval</button>
    </form></section>}
    <div className="portal-card-grid">{items.map((item) => <article className="portal-card" key={item.id}>
      {item.photoUrl && <img className="portal-image" src={item.photoUrl} alt={item.itemName} />}
      <span className="portal-tag">{item.kind}</span><h2>{item.itemName}</h2><p>{item.description}</p><p>Last seen/found: {item.location}</p>
      <p>Contact {item.contactName}: <a href={`mailto:${item.contactEmail}`}>{item.contactEmail}</a> · <a href={`tel:${item.contactPhone}`}>{item.contactPhone}</a></p>
    </article>)}{!items.length && <p className="portal-empty">No approved lost and found posts right now.</p>}</div>
  </div>
}

function AdminLostFound({ items, onModerate, onDelete }: {
  items: LostFoundRecord[]
  onModerate: (item: LostFoundRecord, approved: boolean) => void
  onDelete: (item: LostFoundRecord) => void
}) {
  return <div className="portal-card-grid">{items.map((item) => <article className="portal-card" key={item.id}>
    {item.photoUrl && <img className="portal-image" src={item.photoUrl} alt={item.itemName} />}
    <span className="portal-tag">{item.approved ? 'Approved' : 'Pending review'}</span><h2>{item.itemName} · {item.kind}</h2><p>{item.description}</p><p>{item.contactName} · {item.contactEmail} · {item.contactPhone}</p>
    <div className="portal-actions">{!item.approved && <button className="button button-primary" onClick={() => onModerate(item, true)} type="button">Approve</button>}{item.approved && <button className="button button-outline" onClick={() => onModerate(item, false)} type="button">Hide</button>}<button className="button button-danger" onClick={() => onDelete(item)} type="button"><Trash2 size={15} /> Delete</button></div>
  </article>)}{!items.length && <p className="portal-empty">No lost and found posts to review.</p>}</div>
}

function GalleryView({ items, admin, user, onUpload, onDelete }: {
  items: GalleryRecord[]
  admin: boolean
  user: User | null
  onUpload: (event: FormEvent<HTMLFormElement>) => void
  onDelete: (item: GalleryRecord) => void
}) {
  return <div className="portal-stack">
    {admin && user && <section className="admin-panel"><h2>Add gallery photo</h2><form className="portal-form" onSubmit={onUpload}>
      <label>Caption<input name="caption" required maxLength={200} /></label>
      <label>Photo (JPEG, PNG, or WebP; max 5 MB)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
      <button className="button button-primary" type="submit">Upload photo</button>
    </form></section>}
    <div className="portal-card-grid">{items.map((item) => <figure className="portal-card gallery-card" key={item.id}>
      <img className="portal-image" src={item.downloadUrl} alt={item.caption} /><figcaption>{item.caption}</figcaption>
      {admin && <button className="button button-danger" onClick={() => onDelete(item)} type="button"><Trash2 size={15} /> Remove photo</button>}
    </figure>)}{!items.length && <p className="portal-empty">The gallery is empty for now.</p>}</div>
  </div>
}

function TeamView() {
  return <div className="portal-card-grid">{teamMembers.map((member) => <article className="portal-card" key={member.name}><Users /><h2>{member.name}</h2><p>{member.role}</p></article>)}</div>
}

function ProfileView({ user, verified, onNavigate }: { user: User | null; verified: boolean; onNavigate: (path: string) => void }) {
  return <section className="admin-panel"><h2>{user?.displayName || user?.email}</h2><p>Email: {user?.email}</p><p>Verification: {verified ? 'Verified' : 'Not verified'}</p>{!verified && <button className="button button-primary" onClick={() => onNavigate('/verify-email')} type="button">Verify email</button>}</section>
}

function MyEventsView({ events, user, onCalendar }: { events: EventRecord[]; user: User | null; onCalendar: (event: EventRecord) => void }) {
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const database = db
    if (!user || !database) return
    let active = true
    void Promise.all(events.map(async (event) => {
      const snapshot = await getDoc(doc(database, 'events', event.id, 'registrations', user.uid))
      return snapshot.exists() ? event.id : null
    })).then((ids) => { if (active) setRegisteredIds(new Set(ids.filter((id): id is string => id !== null))) })
      .catch(() => { if (active) setRegisteredIds(new Set()) })
    return () => { active = false }
  }, [events, user])
  const mine = events.filter((event) => registeredIds.has(event.id))
  return <div className="portal-card-grid">{mine.map((event) => <article className="portal-card" key={event.id}><h2>{event.title}</h2><p>{readableDate(event.startAt)} · {event.location}</p><button className="button button-outline" onClick={() => onCalendar(event)} type="button">Add reminder</button></article>)}{!mine.length && <p className="portal-empty">You have not registered for upcoming events.</p>}</div>
}

function AdminNavigation({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const items = [
    ['/admin', 'Dashboard', FileText],
    ['/admin/notices', 'Notices', FileText],
    ['/admin/complaints', 'Support', MessageSquare],
    ['/admin/events', 'Events', CalendarDays],
    ['/admin/polls', 'Polls', FileText],
    ['/admin/opportunities', 'Opportunities', Plus],
    ['/admin/lost-found', 'Lost & Found', Users],
    ['/admin/gallery', 'Gallery', ImageIcon],
  ] as const
  return <nav className="portal-admin-nav" aria-label="Admin tools">{items.map(([href, label, Icon]) => <button className={path === href ? 'is-active' : ''} key={href} onClick={() => onNavigate(href)} type="button"><Icon size={15} />{label}</button>)}</nav>
}

export default PortalPage
