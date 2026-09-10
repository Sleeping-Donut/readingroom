# SolidJS Ecosystem

## Validation ([valibot](https://valibot.dev))

Valibot is a tree-shakeable, modular schema validation library. It uses functional piping (`v.pipe`) instead of object-chaining.It's small tree-shakable nature makes it ideal for SolidJS.

### Schema Definition & Inferred Types

Define schemas using composition. Extract TypeScript types directly with `v.InferInput` or `v.InferOutput`.

```ts
// schemas/user.ts
import * as v from "valibot";

export const SignupSchema = v.object({
  email: v.pipe(
    v.string("Email is required"),
    v.nonEmpty("Email cannot be empty"),
    v.email("Invalid email address")
  ),
  password: v.pipe(
    v.string("Password is required"),
    v.minLength(8, "Password must be at least 8 characters")
  )
});

// Infer TypeScript types
export type SignupInput = v.InferInput<typeof SignupSchema>;
export type SignupOutput = v.InferOutput<typeof SignupSchema>;
```

### Full Pipeline: Client Validation + Server Action Boundary

For complete end-to-end security, perform client-side pre-validation (to give immediate UI feedback) and server-side validation inside the action (to prevent malicious/bypassed submissions).

#### Server Function & Action Layer

```ts
// features/auth/api.ts
"use server";

import * as v from "valibot";
import { SignupSchema } from "./schemas";

export async function signupServerRPC(formData: FormData) {
  // 1. Convert FormData to plain object
  const rawData = Object.fromEntries(formData);

  // 2. Validate on the server boundary
  const result = v.safeParse(SignupSchema, rawData);

  if (!result.success) {
    // Flatten issues into a simple field -> message mapping
    const fieldErrors = v.flatten(result.issues).nested;
    return { success: false, errors: fieldErrors };
  }

  // 3. Process valid, typed data (result.output)
  const user = await db.user.create({ data: result.output });
  return { success: true, user };
}
```

```ts
// features/auth/actions.ts
import { action } from "solid-js";
import { signupServerRPC } from "./api";

export const signupAction = action(function* (formData: FormData) {
  // Client action wrapper for UI transition tracking
  const response = yield signupServerRPC(formData);
  return response;
});
```

#### UI Component with Client Pre-Validation

```ts
// features/auth/SignupForm.tsx
import { createSignal } from "solid-js";
import { useSubmission } from "solid-js";
import * as v from "valibot";
import { SignupSchema } from "./schemas";
import { signupAction } from "./actions";

export function SignupForm() {
  const submission = useSubmission(signupAction);
  const [clientErrors, setClientErrors] = createSignal<Record<string, string[]>>({});

  const handleSubmit = (e: SubmitEvent) => {
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const rawData = Object.fromEntries(formData);

    // Immediate Client Validation
    const result = v.safeParse(SignupSchema, rawData);

    if (!result.success) {
      e.preventDefault(); // Stop network request if client validation fails
      setClientErrors(v.flatten(result.issues).nested || {});
      return;
    }

    setClientErrors({}); // Clear errors if client check passes
  };

  // Combine server errors with client errors
  const getFieldError = (field: string) => {
    const serverResult = submission.result;
    const serverError = serverResult && !serverResult.success ? serverResult.errors?.[field]?.[0] : null;
    const clientError = clientErrors()[field]?.[0];

    return clientError || serverError;
  };

  return (
    <form action={signupAction} method="post" onSubmit={handleSubmit}>
      <div>
        <input name="email" type="email" placeholder="Email" />
        <Show when={getFieldError("email")}>
          <p class="error">{getFieldError("email")}</p>
        </Show>
      </div>

      <div>
        <input name="password" type="password" placeholder="Password" />
        <Show when={getFieldError("password")}>
          <p class="error">{getFieldError("password")}</p>
        </Show>
      </div>

      <button type="submit" disabled={submission.pending}>
        {submission.pending ? "Creating account..." : "Sign Up"}
      </button>
    </form>
  );
}
```

### Valibot Helper Patterns

#### Parsing Helper: `v.safeParse` vs `v.parse`

| Function | Return Type | Use Case |
| :--- | :--- | :--- |
| `v.safeParse(schema, input)` | `{ success: true, output } | { success: false, issues }` | Form validation & UI feedback (does not throw) |
| `v.parse(schema, input)` | `Output` | API responses / internal assertions (throws `ValiError` on failure) |

### Extracting & Formatting Errors

Use `v.flatten()` to transform Valibot's raw issues array into a nested object matching form field names:

```ts
const result = v.safeParse(SignupSchema, rawData);

if (!result.success) {
  // Returns: { email: ["Invalid email address"], password: ["Too short"] }
  const fieldErrors = v.flatten(result.issues).nested; 
}
```

## Forms ([formish](https://formisch.dev/) + valibot)

Formisch provides fine-grained, signal-based form state management. When paired with Valibot, it handles form binding, validation, field-level arrays, and submission state without re-rendering the whole form.

### Basic Form Setup & Field Binding

Use `useForm` with a Valibot schema to automatically infer field names, types, and validation rules.

```ts
import { useForm, Field } from "@formisch/solid";
import * as v from "valibot";

const SignupSchema = v.object({
  email: v.pipe(v.string(), v.email("Invalid email address")),
  password: v.pipe(v.string(), v.minLength(8, "Minimum 8 characters"))
});

export function SignupForm() {
  const [form, { Form, Field }] = useForm({
    schema: SignupSchema,
    initialValues: { email: "", password: "" }
  });

  const handleSubmit = (values: v.InferOutput<typeof SignupSchema>) => {
    // values are fully typed and pre-validated
    console.log("Valid submission:", values);
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Field name="email">
        {(field, props) => (
          <div>
            <input {...props} type="email" placeholder="Email" />
            <Show when={field.error}><p class="error">{field.error}</p></Show>
          </div>
        )}
      </Field>

      <Field name="password">
        {(field, props) => (
          <div>
            <input {...props} type="password" placeholder="Password" />
            <Show when={field.error}><p class="error">{field.error}</p></Show>
          </div>
        )}
      </Field>

      <button type="submit" disabled={form.submitting}>
        {form.submitting ? "Submitting..." : "Submit"}
      </button>
    </Form>
  );
}
```

### Integration with Solid Server Actions

To run client validation via Formisch before passing execution to a Solid server action, invoke the action inside Formisch's `onSubmit` handler.

```ts
import { useForm, Field } from "@formisch/solid";
import { signupAction } from "./actions"; // Solid action wrapper
import { SignupSchema } from "./schemas";

export function ServerSignupForm() {
  const [form, { Form, Field }] = useForm({ schema: SignupSchema });

  const handleSubmit = async (values: v.InferOutput<typeof SignupSchema>) => {
    // Convert typed object back to FormData for action consumption if needed
    const formData = new FormData();
    Object.entries(values).forEach(([k, v]) => formData.append(k, v));

    // Execute Solid client/server action transition
    await signupAction(formData);
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Field name="email">
        {(field, props) => (
          <div>
            <input {...props} type="email" />
            <Show when={field.error}><p class="error">{field.error}</p></Show>
          </div>
        )}
      </Field>

      <button type="submit" disabled={form.submitting}>Submit</button>
    </Form>
  );
}
```

### Dynamic Field Arrays (`useFieldArray`)

Manage repeating or dynamic list inputs (e.g., adding tags, URLs, or multiple contacts) using `useFieldArray`.

```ts
import { useForm, useFieldArray } from "@formisch/solid";
import * as v from "valibot";

const ProfileSchema = v.object({
  username: v.string(),
  urls: v.array(v.pipe(v.string(), v.url("Must be a valid URL")))
});

export function DynamicForm() {
  const [form, { Form, Field }] = useForm({
    schema: ProfileSchema,
    initialValues: { username: "", urls: [""] }
  });

  const urls = useFieldArray(form, "urls");

  return (
    <Form onSubmit={(values) => console.log(values)}>
      <Field name="username">
        {(_, props) => <input {...props} placeholder="Username" />}
      </Field>

      <h4>Website Links</h4>
      <For each={urls.fields}>
        {(field, index) => (
          <Field name={`urls.${index()}`}>
            {(fieldItem, props) => (
              <div>
                <input {...props} type="url" placeholder="https://" />
                <button type="button" onClick={() => urls.remove(index())}>
                  Remove
                </button>
                <Show when={fieldItem.error}>
                  <p class="error">{fieldItem.error}</p>
                </Show>
              </div>
            )}
          </Field>
        )}
      </For>

      <button type="button" onClick={() => urls.append("")}>
        + Add URL
      </button>
      <button type="submit">Save Profile</button>
    </Form>
  );
}
```

## Media & Assets ([solid-image](https://github.com/solidjs/solid-image))

solid-image provides an optimized image primitive for SolidJS applications, delivering automatic layout sizing, lazy loading, and responsive srcset generation to prevent Layout Shift (CLS).

### Basic Usage

Use `<Image>` as a drop-in replacement for `<img>` to automatically handle responsive sizing and performance defaults.

```ts
import { Image } from "solid-image";

export function HeroBanner() {
  return (
    <Image
      src="/assets/hero.jpg"
      alt="Hero Banner"
      width={1200}
      height={600}
      loading="lazy"      // Auto-defaults to lazy loading
      placeholder="blur"  // Displays blur/low-res placeholder while loading
    />
  );
}
```

