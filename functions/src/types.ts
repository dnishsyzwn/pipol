export type UserRole = 'teacher' | 'student';
export type QuizStatus = 'draft' | 'ready_for_review' | 'published' | 'archived';
export type QuestionType = 'multiple_choice' | 'short_answer' | 'true_false' | 'matching' | 'scenario';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ImageMode = 'none' | 'upload' | 'generate';
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SourceReference = {
  materialId: string;
  fileName: string;
  page?: number;
  slide?: number;
  sectionTitle?: string;
};

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  question: string;
  choices?: string[];
  correctAnswer: string;
  explanation: string;
  hints: string[];
  difficulty: Difficulty;
  topic: string;
  subtopic?: string;
  skills: string[];
  tagIds: string[];
  taggingConfidence: 'high' | 'medium' | 'low';
  learningObjective?: string;
  sourceReference?: SourceReference;
  confidence: 'high' | 'medium' | 'low';
  needsReview: boolean;
  visual?: {
    mode: ImageMode;
    assetId?: string;
    altText?: string;
    purpose?: string;
    status?: 'pending' | 'ready' | 'rejected';
  };
};

export type QuizDraft = {
  id: string;
  ownerId: string;
  classroomId: string;
  title: string;
  instructions?: string;
  subject?: string;
  level?: string;
  language: string;
  status: QuizStatus;
  questions: QuizQuestion[];
  createdAt: unknown;
  updatedAt: unknown;
  publishedAt?: unknown;
};
