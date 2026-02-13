export interface Lesson {
  title: string;
  description: string;
}

export interface Module {
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  topic: string;
  title: string;
  description: string;
  modules: Module[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  isStreaming?: boolean;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

export type ViewState = 'landing' | 'course' | 'quiz';

export interface AppState {
  currentView: ViewState;
  courses: Course[];
  activeCourseId: string | null;
  activeModuleIndex: number | null;
  activeLessonIndex: number | null;
  chatHistory: Message[];
  activeQuiz: Quiz | null;
  isLoading: boolean;
}