import type { AiUserContext } from '../domain/types';

// ============================================================
// Application-layer ports (outbound interfaces implemented by
// infrastructure: hashing, tokens, AI provider, speech).
// ============================================================

export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenPayload {
  sub: string;
  email: string;
}

export interface ITokenService {
  issue(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<TokenPayload | null>;
}

/** One command the AI wants to run — executed by the application layer, never touching the DB directly (BRD §7). */
export interface AiAction {
  type: string;
  [key: string]: unknown;
}

export interface AiInterpretation {
  intent: string;
  actions: AiAction[];
}

export interface InterpretInput {
  message: string;
  context: AiUserContext;
}

export interface AnswerQuestionInput {
  question: string;
  dataJson: string;
  userName: string;
}

export interface SmallTalkInput {
  message: string;
  userName: string;
}

export interface IAiAssistantService {
  /** Turn natural Egyptian Arabic into structured intents/actions (JSON). */
  interpret(input: InterpretInput): Promise<AiInterpretation>;
  /** Answer a data-backed question using ONLY the provided snapshot. */
  answerQuestion(input: AnswerQuestionInput): Promise<string>;
  /** Casual chit-chat reply (no data involved). */
  smallTalk(input: SmallTalkInput): Promise<string>;
}

export interface ISpeechToTextService {
  transcribe(audioBase64: string): Promise<string>;
}
