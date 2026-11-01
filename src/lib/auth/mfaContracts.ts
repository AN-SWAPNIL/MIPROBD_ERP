import { z } from "zod";
export const sessionSecuritySchema = z.object({ assurance: z.enum(["aal1", "aal2"]), enrolled: z.boolean(), required: z.boolean() });
export const mfaStatusSchema = z.object({ security: sessionSecuritySchema, factors: z.array(z.object({ id: z.uuid(), name: z.string(), status: z.enum(["verified", "unverified"]) })) });
export const mfaEnrollmentSchema = z.object({ id: z.uuid(), qrCode: z.string().startsWith("data:image/svg+xml;"), secret: z.string(), uri: z.string().startsWith("otpauth://") });
export const mfaChallengeSchema = z.object({ id: z.uuid() });
export const mfaEnrollInput = z.object({ currentPassword: z.string().min(6).max(128), name: z.string().trim().min(2).max(60) }).strict();
export const mfaChallengeInput = z.object({ factorId: z.uuid() }).strict();
export const mfaVerifyInput = mfaChallengeInput.extend({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export const mfaRemoveInput = mfaChallengeInput.extend({ reason: z.string().trim().min(5).max(500) }).strict();
