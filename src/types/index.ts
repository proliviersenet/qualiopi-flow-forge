
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'formateur' | 'client';
  profileImage?: string;
}

export interface Formation {
  id: string;
  title: string;
  description: string;
  duration: string;
  price?: number;
  formatorId: string;
  createdAt: string;
  status: 'draft' | 'published' | 'archived';
  modules?: Module[];
  clients?: string[];
}

export interface Module {
  id: string;
  title: string;
  description: string;
  documents: Document[];
}

export interface Document {
  id: string;
  title: string;
  type: 'cours' | 'support' | 'evaluation' | 'emargement' | 'attestation' | 'autre';
  url: string;
  createdAt: string;
}

export interface Questionnaire {
  id: string;
  title: string;
  formationId: string;
  questions: Question[];
  type: 'satisfaction' | 'evaluation' | 'prerequis';
}

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'radio' | 'checkbox' | 'scale';
  options?: string[];
}

export interface Response {
  id: string;
  questionnaireId: string;
  userId: string;
  answers: Answer[];
  submittedAt: string;
}

export interface Answer {
  questionId: string;
  value: string | string[];
}

export interface Emargement {
  id: string;
  sessionId: string;
  userId: string;
  signature?: string;
  date: string;
  status: 'pending' | 'signed' | 'missed';
}

export interface Session {
  id: string;
  formationId: string;
  title: string;
  date: string;
  duration: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  emargements?: Emargement[];
}
