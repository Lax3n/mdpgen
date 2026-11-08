/** Messages échangés entre le script de contenu, le service worker et les pages de l'extension. */

export type FieldKind = 'creation' | 'login' | 'unknown';

export interface FillRequest {
  type: 'mdpgen:fill';
  password: string;
  submit: boolean;
}
export interface FillResponse {
  filled: boolean;
  submitted: boolean;
  fields: number;
  host: string;
  origin: string;
  /** Identifiant trouvé dans le formulaire (email ou nom d'utilisateur), vide sinon. */
  username: string;
}

export interface ProbeRequest {
  type: 'mdpgen:probe';
}
export interface ProbeResponse {
  hasField: true;
  kind: FieldKind;
  host: string;
  maxLength: number | null;
  rules: string | null;
}

export interface ConfirmRequest {
  type: 'mdpgen:confirm-request';
  password: string;
  submit: boolean;
  host: string;
}
export interface ConfirmRequestResponse {
  requestId: string;
}

export interface ConfirmInfoRequest {
  type: 'mdpgen:confirm-info';
  requestId: string;
}
export interface ConfirmInfoResponse {
  host: string;
  submit: boolean;
}

export interface ConfirmVerified {
  type: 'mdpgen:confirm-verified';
  requestId: string;
}
export interface ConfirmCancel {
  type: 'mdpgen:confirm-cancel';
  requestId: string;
}
/** Service worker → script de contenu : la demande Touch ID s'est terminée sans remplissage. */
export interface ConfirmCancelled {
  type: 'mdpgen:confirm-cancelled';
}

export interface RememberRequest {
  type: 'mdpgen:remember';
  password: string;
  host: string;
}
export interface ForgetRequest {
  type: 'mdpgen:forget';
}
export interface OpenOptionsRequest {
  type: 'mdpgen:open-options';
}
/** Script de contenu → service worker : un formulaire portant notre mot de passe vient d'être envoyé. */
export interface FormSubmitted {
  type: 'mdpgen:form-submitted';
  origin: string;
  username: string;
  password: string;
}
/** Pages de l'extension → service worker : l'enregistrement en attente a été traité ou ignoré. */
export interface PendingSaveClear {
  type: 'mdpgen:pending-save-clear';
}

export type Message =
  | FillRequest
  | ProbeRequest
  | ConfirmRequest
  | ConfirmInfoRequest
  | ConfirmVerified
  | ConfirmCancel
  | ConfirmCancelled
  | RememberRequest
  | ForgetRequest
  | OpenOptionsRequest
  | FormSubmitted
  | PendingSaveClear;

export interface ErrorResponse {
  error: string;
}

/** Dernier mot de passe proposé, en mémoire de session seulement (chrome.storage.session). */
export interface LastPassword {
  password: string;
  host: string;
  at: number;
  expiresAt: number;
}
export const LAST_KEY = 'last';

export function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && typeof (value as ErrorResponse).error === 'string';
}

export async function sendToBackground<T>(message: Message): Promise<T> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (isErrorResponse(response)) throw new Error(response.error);
  return response as T;
}

export async function readLastPassword(): Promise<LastPassword | null> {
  const stored = await chrome.storage.session.get(LAST_KEY);
  const last = stored[LAST_KEY] as LastPassword | undefined;
  if (!last || typeof last.password !== 'string') return null;
  if (Date.now() > last.expiresAt) {
    await chrome.storage.session.remove(LAST_KEY);
    return null;
  }
  return last;
}
