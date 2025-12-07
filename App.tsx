import React, { useState, useEffect } from 'react';
import { IEvent, EventFormData, IUser, IApplication } from './types';
import { getEvents, createEvent, deleteEvent, applyForEvent, getApplications, updateApplicationStatus, updateEvent } from './services/mockDatabase';
import EventForm from './components/EventForm';
import BackendConfig from './components/BackendConfig';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import UserAuth from './components/UserAuth';
import UserDashboard from './components/UserDashboard';
import CalendarView from './components/CalendarView';
import EventDetailsModal from './components/EventDetailsModal';
import ApplicationModal from './components/ApplicationModal';

// Helper for formatting dates
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

type ViewState = 'home' | 'admin-login' | 'cms' | 'user-dashboard';

function App() {
  // Navigation State
  const [currentView, setCurrentView] = useState<ViewState>('home');
  
  // Auth State
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<IUser | null>(null);
  const [showUserAuth, setShowUserAuth] = useState(false);

  // Data State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applications' | 'backend'>('dashboard');
  const [dashboardViewMode, setDashboardViewMode] = useState<'list' | 'calendar'>('list');
  const [events, setEvents] = useState<IEvent[]>([]);
  const [applications, setApplications] = useState<IApplication[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [selectedEventForApp, setSelectedEventForApp] = useState<IEvent | null>(null);
  
  // Reschedule Modal
  const [rescheduleModal, setRescheduleModal] = useState<{ isOpen: boolean, eventId: string, eventTitle: string, currentDate: string } | null>(null);
  const [newDate, setNewDate] = useState('');

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Admin selected event for details
  const [adminSelectedEvent, setAdminSelectedEvent] = useState<IEvent | null>(null);

  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Initial Check for Hidden Admin Link and Data Load
  useEffect(() => {
    // Check URL hash for admin access
    const checkHash = () => {
      if (window.location.hash === '#admin') {
        setCurrentView('admin-login');
      }
    };
    
    checkHash();
    window.addEventListener('hashchange', checkHash);

    // Load initial events for Home Page
    loadEvents();

    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Poll for applications if admin
  useEffect(() => {
    if (adminAuthenticated && currentView === 'cms') {
      loadApplications();
    }
  }, [adminAuthenticated, currentView]);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      const apps = await getApplications();
      setApplications(apps);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Auth Handlers ---

  const handleAdminLoginSuccess = () => {
    setAdminAuthenticated(true);
    setCurrentView('cms');
    loadApplications();
  };

  const handleUserLogin = (user: IUser) => {
    setCurrentUser(user);
    setShowUserAuth(false);
  };

  const handleUserLogout = () => {
    setCurrentUser(null);
    setCurrentView('home');
  };

  const handleAdminLogout = () => {
    setAdminAuthenticated(false);
    setCurrentView('home');
    window.location.hash = ''; // Remove hidden link trigger
  };

  // --- User Event Actions ---

  const initiateJoinEvent = (event: IEvent) => {
    if (!currentUser) {
      setShowUserAuth(true);
      return;
    }

    if (event.registrationStatus && event.registrationStatus !== 'none') {
        // Use standard handler to cancel
        handleApplyConfirm({ name: currentUser.name, email: currentUser.email, phoneNumber: currentUser.phoneNumber || ''}, event._id);
    } else {
        // Open Confirmation Modal
        setSelectedEventForApp(event);
        setIsApplicationModalOpen(true);
    }
  };

  const handleApplyConfirm = async (details: {name: string, email: string, phoneNumber: string}, directEventId?: string) => {
    const eventId = directEventId || selectedEventForApp?._id;
    if (!eventId || !currentUser) return;

    setFormSubmitting(true);

    try {
      // Optimistic Update
      const previousEvents = [...events];
      setEvents(events.map(e => {
        if (e._id === eventId) {
             const isCancelling = e.registrationStatus && e.registrationStatus !== 'none';
             return {
                 ...e,
                 registrationStatus: isCancelling ? 'none' : 'pending' // Default to pending on apply
             }
        }
        return e;
      }));

      // Update user details in state to reflect latest provided
      setCurrentUser({ ...currentUser, ...details });

      await applyForEvent(eventId, { id: currentUser.id, ...details });
      
      const event = events.find(e => e._id === eventId);
      const isCancelling = event?.registrationStatus && event.registrationStatus !== 'none';

      if (!isCancelling) {
        setNotification({
            message: `Application submitted! An admin will review your request.`,
            type: 'success'
        });
      } else {
        setNotification({
            message: "Application withdrawn.",
            type: 'success'
        });
      }

    } catch (e) {
      console.error(e);
      loadEvents(); // Revert
      setNotification({ message: "Action failed.", type: 'error' });
    } finally {
      setFormSubmitting(false);
      setIsApplicationModalOpen(false);
      setSelectedEventForApp(null);
    }
  };

  // --- Admin Actions ---

  const handleCreateEvent = async (data: EventFormData) => {
    setFormSubmitting(true);
    try {
      const newEventData = { ...data, imageUrl: data.imageUrl || undefined };
      const newEvent = await createEvent(newEventData);
      if (data.imageUrl) newEvent.imageUrl = data.imageUrl;
      
      setEvents([newEvent, ...events]);
      setIsModalOpen(false);
      setNotification({ message: "Event created successfully!", type: 'success' });
    } catch (err) {
      setNotification({ message: "Failed to create event.", type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteEvent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to cancel this event?")) return;
    try {
      await deleteEvent(id);
      setEvents(events.filter(ev => ev._id !== id));
      setNotification({ message: "Event deleted.", type: 'success' });
    } catch (err) {
      setNotification({ message: "Failed to delete event.", type: 'error' });
    }
  };

  const handleApplicationAction = async (appId: string, status: 'confirmed' | 'rejected' | 'pending') => {
    try {
        await updateApplicationStatus(appId, status);
        
        // Update local application state
        setApplications(apps => apps.map(a => a.id === appId ? { ...a, status } : a));
        
        // Update local event stats if confirmed/rejected switch
        const app = applications.find(a => a.id === appId);
        if (app) {
           // We need to reload events to get accurate count if we want to be safe, 
           // OR we can rely on our local optimistic logic if complex. 
           // For simplicity in mock, let's reload events to sync counts.
           loadEvents(); 
        }

        setNotification({ message: `Application updated to ${status}.`, type: 'success' });
    } catch (e) {
        setNotification({ message: "Failed to update application.", type: 'error' });
    }
  };

  const openRescheduleModal = (eventId: string, eventTitle: string, date: string) => {
      // Find current event date
      const event = events.find(e => e._id === eventId);
      setNewDate(event?.date || '');
      setRescheduleModal({ isOpen: true, eventId, eventTitle, currentDate: event?.date || '' });
  };

  const handleRescheduleSubmit = async () => {
    if(!rescheduleModal || !newDate) return;
    
    try {
        await updateEvent(rescheduleModal.eventId, { date: newDate });
        setEvents(prev => prev.map(e => e._id === rescheduleModal.eventId ? { ...e, date: newDate } : e));
        setNotification({ message: "Event rescheduled successfully. Applicants notified.", type: 'success' });
        setRescheduleModal(null);
    } catch(e) {
        setNotification({ message: "Failed to reschedule.", type: 'error' });
    }
  };

  const filteredEvents = events.filter(ev => 
    ev.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    ev.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- SHARED UI ---
  const NotificationBanner = () => (
    notification ? (
      <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-lg shadow-2xl border flex items-center gap-3 animate-fade-in-down ${
        notification.type === 'success' ? 'bg-[#1c2128] border-green-500 text-green-400' : 'bg-[#1c2128] border-red-500 text-red-400'
      }`}>
        <i className={`fas ${notification.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
        <span className="font-medium text-sm">{notification.message}</span>
        <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-75"><i className="fas fa-times"></i></button>
      </div>
    ) : null
  );

  // --- VIEW RENDERING ---

  if (currentView === 'home') {
    return (
      <>
        <NotificationBanner />
        <HomePage 
          events={events}
          user={currentUser}
          onLoginClick={() => setShowUserAuth(true)}
          onLogoutClick={handleUserLogout}
          onJoinClick={initiateJoinEvent}
          onGoToDashboard={() => setCurrentView('user-dashboard')}
          onAdminClick={() => {
            setCurrentView('admin-login');
            window.location.hash = 'admin';
          }}
          loading={loading}
        />
        {showUserAuth && (
          <UserAuth 
            onLogin={handleUserLogin} 
            onClose={() => setShowUserAuth(false)} 
          />
        )}
        {isApplicationModalOpen && selectedEventForApp && currentUser && (
            <ApplicationModal 
                event={selectedEventForApp}
                user={currentUser}
                onConfirm={handleApplyConfirm}
                onCancel={() => setIsApplicationModalOpen(false)}
                isLoading={formSubmitting}
            />
        )}
      </>
    );
  }

  if (currentView === 'user-dashboard' && currentUser) {
    return (
      <>
        <NotificationBanner />
        <UserDashboard 
          user={currentUser}
          registeredEvents={events.filter(e => e.registrationStatus && e.registrationStatus !== 'none')}
          onUnregister={(id) => handleApplyConfirm({name: currentUser.name, email: currentUser.email, phoneNumber: currentUser.phoneNumber || ''}, id)} 
          onBrowseEvents={() => setCurrentView('home')}
          onLogout={handleUserLogout}
        />
      </>
    );
  }

  if (currentView === 'admin-login') {
    return <LoginPage onLoginSuccess={handleAdminLoginSuccess} onBack={() => {
      setCurrentView('home');
      window.location.hash = '';
    }} />;
  }

  // --- CMS LAYOUT (Admin Only) ---
  if (currentView === 'cms' && adminAuthenticated) {
    return (
      <div className="flex h-screen bg-[#0f1115] text-gray-100 font-sans overflow-hidden">
        <NotificationBanner />
        
        {/* Sidebar */}
        <aside className="w-64 bg-[#161b22] border-r border-gray-800 flex flex-col hidden md:flex">
          <div className="p-6 flex items-center gap-3 border-b border-gray-800">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
               <i className="fas fa-calendar-alt text-white text-sm"></i>
            </div>
            <span className="text-xl font-bold tracking-tight">EventHorizon</span>
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/20">ADMIN</span>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <i className="fas fa-th-large w-5"></i>
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('applications')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'applications' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
               <div className="relative">
                 <i className="fas fa-users w-5"></i>
                 {applications.filter(a => a.status === 'pending').length > 0 && (
                     <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-[#161b22]"></span>
                 )}
               </div>
              Applications
            </button>
            {/* <button 
              onClick={() => setActiveTab('backend')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'backend' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <i className="fas fa-server w-5"></i>
              Backend Setup
            </button> */}
          </nav>

          <div className="p-4 border-t border-gray-800">
            <button 
              onClick={handleAdminLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <i className="fas fa-sign-out-alt"></i> Logout
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {/* Mobile Header */}
          <header className="md:hidden h-16 bg-[#161b22] border-b border-gray-800 flex items-center justify-between px-4">
            <span className="text-lg font-bold">EventHorizon Admin</span>
            <button onClick={handleAdminLogout} className="text-gray-400"><i className="fas fa-sign-out-alt"></i></button>
          </header>

          {/* Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            
            {activeTab === 'dashboard' && (
              <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Header Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[#1c2128] p-6 rounded-xl border border-gray-800 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">Total Events</p>
                        <h3 className="text-3xl font-bold text-white">{events.length}</h3>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <i className="fas fa-calendar-check"></i>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1c2128] p-6 rounded-xl border border-gray-800 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">Total Attendees</p>
                        <h3 className="text-3xl font-bold text-white">
                          {events.reduce((acc, curr) => acc + curr.attendees, 0)}
                        </h3>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <i className="fas fa-users"></i>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1c2128] p-6 rounded-xl border border-gray-800 shadow-sm">
                     <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">Upcoming</p>
                        <h3 className="text-3xl font-bold text-white">
                          {events.filter(e => e.status === 'upcoming').length}
                        </h3>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <i className="fas fa-clock"></i>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions & Search */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                   <div className="flex gap-2 w-full md:w-auto">
                     <div className="bg-[#1c2128] p-1 rounded-lg border border-gray-700 flex">
                        <button 
                          onClick={() => setDashboardViewMode('list')}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${dashboardViewMode === 'list' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                          <i className="fas fa-list mr-2"></i> List
                        </button>
                        <button 
                          onClick={() => setDashboardViewMode('calendar')}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${dashboardViewMode === 'calendar' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                          <i className="fas fa-calendar mr-2"></i> Calendar
                        </button>
                     </div>
                   </div>

                   <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                     <div className="relative w-full md:w-80">
                       <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"></i>
                       <input 
                         type="text" 
                         placeholder="Search events..." 
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                         className="w-full bg-[#1c2128] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                       />
                     </div>
                     <button 
                      onClick={() => setIsModalOpen(true)}
                      className="w-full md:w-auto bg-primary hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                     >
                       <i className="fas fa-plus"></i>
                       Create
                     </button>
                   </div>
                </div>

                {/* CONTENT AREA */}
                {loading ? (
                  <div className="flex justify-center items-center py-20">
                    <i className="fas fa-circle-notch fa-spin text-4xl text-primary"></i>
                  </div>
                ) : (
                  dashboardViewMode === 'list' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {filteredEvents.map(event => (
                        <div key={event._id} className="group bg-[#1c2128] rounded-xl border border-gray-800 overflow-hidden hover:border-gray-600 transition-all duration-300 flex flex-col h-full cursor-pointer" onClick={() => setAdminSelectedEvent(event)}>
                          <div className="h-40 overflow-hidden relative">
                            <img 
                              src={event.imageUrl || 'https://picsum.photos/800/400'} 
                              alt={event.title} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-white border border-white/10">
                              {event.status}
                            </div>
                          </div>
                          
                          <div className="p-5 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="text-xl font-bold text-white line-clamp-1">{event.title}</h3>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                              <div className="flex items-center gap-1.5">
                                <i className="far fa-calendar text-primary"></i>
                                {formatDate(event.date)}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <i className="fas fa-map-marker-alt text-secondary"></i>
                                <span className="truncate max-w-[100px]">{event.location}</span>
                              </div>
                            </div>

                            <p className="text-gray-400 text-sm mb-6 line-clamp-2 flex-1">
                              {event.description}
                            </p>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-800 mt-auto">
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-primary to-secondary" 
                                    style={{ width: `${(event.attendees / event.capacity) * 100}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs text-gray-400">{event.attendees}/{event.capacity}</span>
                              </div>
                              
                              <button 
                                onClick={(e) => handleDeleteEvent(event._id, e)}
                                className="text-gray-500 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-gray-800"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <CalendarView events={filteredEvents} onEventClick={setAdminSelectedEvent} />
                  )
                )}
              </div>
            )}

            {activeTab === 'applications' && (
              <div className="max-w-6xl mx-auto">
                 <h2 className="text-2xl font-bold mb-6">Application Management</h2>
                 <div className="bg-[#1c2128] rounded-xl border border-gray-800 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                            <tr>
                                <th className="p-4 font-medium">User</th>
                                <th className="p-4 font-medium">Event</th>
                                <th className="p-4 font-medium">Contact</th>
                                <th className="p-4 font-medium">Status</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {applications.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500">No applications found.</td>
                                </tr>
                            ) : (
                                applications.map(app => (
                                    <tr key={app.id} className="hover:bg-gray-800/30">
                                        <td className="p-4">
                                            <div className="font-bold text-white">{app.userName}</div>
                                            <div className="text-xs text-gray-500">{app.userEmail}</div>
                                        </td>
                                        <td className="p-4 text-sm text-gray-300">{app.eventTitle}</td>
                                        <td className="p-4 text-sm text-gray-400">{app.userPhone || 'N/A'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full uppercase tracking-wide ${
                                                app.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                                                app.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>
                                                {app.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {/* Pending Actions */}
                                                {app.status === 'pending' && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleApplicationAction(app.id, 'confirmed')}
                                                            className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded transition-colors"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button 
                                                            onClick={() => handleApplicationAction(app.id, 'rejected')}
                                                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}

                                                {/* Confirmed Actions */}
                                                {app.status === 'confirmed' && (
                                                    <>
                                                       <button 
                                                            onClick={() => openRescheduleModal(app.eventId, app.eventTitle, '')}
                                                            className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 text-xs rounded transition-colors"
                                                            title="Reschedule Event Date"
                                                        >
                                                            <i className="fas fa-calendar-alt"></i> Date
                                                        </button>
                                                        <button 
                                                            onClick={() => handleApplicationAction(app.id, 'rejected')}
                                                            className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 text-xs rounded transition-colors"
                                                            title="Revoke Approval"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}

                                                {/* Rejected Actions */}
                                                {app.status === 'rejected' && (
                                                    <>
                                                        <button 
                                                            onClick={() => openRescheduleModal(app.eventId, app.eventTitle, '')}
                                                            className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 text-xs rounded transition-colors"
                                                            title="Reschedule Event Date"
                                                        >
                                                            <i className="fas fa-calendar-alt"></i> Date
                                                        </button>
                                                        <button 
                                                            onClick={() => handleApplicationAction(app.id, 'confirmed')}
                                                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                                                            title="Re-Approve"
                                                        >
                                                            Approve
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                 </div>
              </div>
            )}

            {activeTab === 'backend' && (
              <div className="max-w-4xl mx-auto pt-4 h-full">
                <BackendConfig />
              </div>
            )}
          </div>

          {/* Create Modal */}
          {isModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-[#1c2128] rounded-2xl w-full max-w-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                  <h2 className="text-xl font-bold text-white">Create New Event</h2>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-start gap-3">
                    <i className="fas fa-sparkles text-primary mt-1"></i>
                    <div>
                      <h4 className="text-sm font-bold text-primary mb-1">AI Powered</h4>
                      <p className="text-xs text-gray-300">Enter a title and category, then click <strong>AI Fill</strong> to automatically generate a professional description and suggest logistics.</p>
                    </div>
                  </div>
                  <EventForm 
                    onSubmit={handleCreateEvent} 
                    onCancel={() => setIsModalOpen(false)}
                    isLoading={formSubmitting}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Reschedule Modal */}
          {rescheduleModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-[#1c2128] p-6 rounded-xl border border-gray-700 w-full max-w-sm">
                    <h3 className="text-lg font-bold mb-1">Reschedule Event</h3>
                    <p className="text-xs text-gray-400 mb-4">Event: {rescheduleModal.eventTitle}</p>
                    <label className="block text-sm text-gray-300 mb-2">New Date & Time</label>
                    <input 
                        type="datetime-local" 
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-2 text-white mb-4"
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setRescheduleModal(null)} className="flex-1 py-2 bg-gray-800 rounded text-gray-300">Cancel</button>
                        <button onClick={handleRescheduleSubmit} className="flex-1 py-2 bg-primary text-white rounded">Update</button>
                    </div>
                </div>
            </div>
          )}

          {/* Details Modal */}
          {adminSelectedEvent && (
            <EventDetailsModal 
              event={adminSelectedEvent} 
              onClose={() => setAdminSelectedEvent(null)} 
            />
          )}

        </main>
      </div>
    );
  }

  // Fallback (should typically not reach here if logic is correct)
  return <div>Access Denied</div>;
}

export default App;