import { z } from 'zod';

// Co-located zod schemas for the pre-auth forms (D-C2/D-C3, R-09). Login and
// Signup had no feature folder of their own; `auth` is the natural home (it
// already holds AuthProvider). Behavior parity:
//
//  - Login: email required + valid email; password required (was native
//    `required` + `type="email"`). The component still maps a failed sign-in
//    to the localized `t('errors.invalidCredentials')` toast/message — that is
//    a server-side auth error, not a form-validation error, and is unchanged.
//  - Signup: display_name optional (was unvalidated); email required + valid;
//    password min 8 (was the explicit `password.length < 8` guard that
//    rendered `t('errors.weakPassword')`). The "email already in use" branch
//    is a server error and remains handled in the component.
export const loginFormSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const signupFormSchema = z.object({
  displayName: z.string(),
  email: z.string().min(1).email(),
  password: z.string().min(8),
});

export type SignupFormValues = z.infer<typeof signupFormSchema>;
