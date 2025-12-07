
export type RegistrationStatus = 'none' | 'pending' | 'confirmed' | 'rejected';

export interface IEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  category: string;
  attendees: number;
  capacity: number;
  imageUrl?: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'future';
  registrationStatus?: RegistrationStatus; // UI state for the current user
}

export type EventFormData = Omit<IEvent, '_id' | 'attendees' | 'registrationStatus'>;

export interface NavItem {
  label: string;
  icon: string;
  id: string;
}

// For the backend code viewer
export interface CodeSnippet {
  filename: string;
  language: string;
  code: string;
}

export interface IUser {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role: 'user' | 'admin';
}

export interface IApplication {
  id: string;
  eventId: string;
  eventTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  status: RegistrationStatus;
  timestamp: string;
}
