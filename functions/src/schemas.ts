import { z } from 'zod';
import type { QuizQuestion } from './types.js';

export const QuestionTypeSchema = z.enum([
  'multiple_choice',
  'short_answer',
  'true_false',
  'matching',
  'scenario',
]);

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const ImageModeSchema = z.enum(['none', 'upload', 'generate']);

export const SourceReferenceSchema = z.object({
  materialId: z.string().min(1).max(160),
  fileName: z.string().min(1).max(255),
  page: z.number().int().positive().optional(),
  slide: z.number().int().positive().optional(),
  sectionTitle: z.string().max(300).optional(),
});

export const QuizQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  type: QuestionTypeSchema,
  question: z.string().min(3).max(4000),
  choices: z.array(z.string().min(1).max(500)).min(2).max(8).optional(),
  correctAnswer: z.string().min(1).max(1000),
  explanation: z.string().min(1).max(4000),
  hints: z.array(z.string().min(1).max(1000)).max(5),
  difficulty: DifficultySchema,
  learningObjective: z.string().max(500).optional(),
  sourceReference: SourceReferenceSchema.optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  needsReview: z.boolean(),
  visual: z
    .object({
      mode: ImageModeSchema,
      assetId: z.string().max(160).optional(),
      altText: z.string().max(1000).optional(),
      purpose: z.string().max(1000).optional(),
      status: z.enum(['pending', 'ready', 'rejected']).optional(),
    })
    .optional(),
});

export const GeneratedQuizSchema = z.object({
  title: z.string().min(1).max(300),
  instructions: z.string().max(2000).optional(),
  learningObjectives: z.array(z.string().min(1).max(500)).max(10),
  questions: z.array(QuizQuestionSchema).min(1).max(30),
});

export const CreateMaterialSchema = z.object({
  classroomId: z.string().min(1).max(160),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(150),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});

export const CreateQuizJobSchema = z.object({
  classroomId: z.string().min(1).max(160),
  title: z.string().max(300).optional(),
  prompt: z.string().max(4000).default(''),
  materialIds: z.array(z.string().min(1).max(160)).max(5).default([]),
  questionCount: z.number().int().min(1).max(30),
  subject: z.string().max(200).optional(),
  level: z.string().max(100).optional(),
  language: z.string().max(80).default('English'),
  difficulty: DifficultySchema.default('medium'),
  questionTypes: z.array(QuestionTypeSchema).min(1).max(5).default(['multiple_choice', 'short_answer']),
  learningObjectives: z.array(z.string().max(500)).max(10).default([]),
  imageMode: ImageModeSchema.default('none'),
  imageCount: z.number().int().min(0).max(5).default(0),
});

export const EnhanceStandaloneQuestionSchema = z.object({
  question: z.string().min(3).max(4000),
  answer: z.string().max(1000).default('Teacher review required.'),
  language: z.string().max(80).default('English'),
});

export const UpdateDraftSchema = z.object({
  draftId: z.string().min(1).max(160),
  title: z.string().min(1).max(300).optional(),
  instructions: z.string().max(2000).optional(),
  questions: z.array(QuizQuestionSchema).min(1).max(30).optional(),
  status: z.enum(['draft', 'ready_for_review']).optional(),
});

export const PublishDraftSchema = z.object({ draftId: z.string().min(1).max(160) });

export const AttemptSchema = z.object({
  quizId: z.string().min(1).max(160),
  answers: z.record(z.string(), z.string().max(2000)),
});

export const VisualSchema = z.object({
  draftId: z.string().min(1).max(160),
  questionId: z.string().min(1).max(100),
  purpose: z.string().min(3).max(1000),
  level: z.string().max(100).default('general education'),
});

export const TransformQuestionSchema = z.object({
  draftId: z.string().min(1).max(160),
  questionId: z.string().min(1).max(100),
  operation: z.enum(['simplify', 'translate', 'add_alt_text']),
  language: z.string().max(80).optional(),
});

export function normalizeQuestion(question: QuizQuestion): QuizQuestion {
  const choices = question.choices?.map((choice) => choice.trim()).filter(Boolean);
  const normalized = {
    ...question,
    question: question.question.trim(),
    correctAnswer: question.correctAnswer.trim(),
    explanation: question.explanation.trim(),
    hints: question.hints.map((hint) => hint.trim()).filter(Boolean),
    ...(choices?.length ? { choices } : {}),
  };
  if (normalized.type === 'multiple_choice' && !normalized.choices?.includes(normalized.correctAnswer)) {
    return { ...normalized, needsReview: true, confidence: 'low' };
  }
  return normalized;
}

export function validateQuestionSet(questions: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<string>();
  return questions.map((question) => {
    const normalized = normalizeQuestion(question);
    const key = normalized.question.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return { ...normalized, needsReview: true, confidence: 'low' };
    seen.add(key);
    return normalized;
  });
}
