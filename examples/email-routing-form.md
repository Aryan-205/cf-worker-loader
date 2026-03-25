# Example: Email Routing Form

A multi-step form that collects a user's email, runs a script to detect the email provider, and routes them to a provider-specific page.

## Use Case

> A company wants to collect user emails and show different instructions depending on whether the user has a Gmail, Outlook, or other email provider. After showing the instructions, the form submission is completed.

## Flow Diagram

```
┌───────┐      ┌──────────────┐      ┌────────────────────┐
│ START │ ───▸ │ Email Page   │ ───▸ │ Detect Provider    │
└───────┘      │ (collect     │      │ (script)           │
               │  email)      │      │                    │
               └──────────────┘      └──────┬─────┬───────┘
                                            │     │
                              ┌─────────────┘     └──────────────┐
                              ▼                                  ▼
                    ┌──────────────────┐              ┌──────────────────┐
                    │  Gmail Page      │              │  Other Page      │
                    │  (Gmail setup    │              │  (generic setup  │
                    │   instructions)  │              │   instructions)  │
                    └────────┬─────────┘              └────────┬─────────┘
                             │                                 │
                             └────────────┬────────────────────┘
                                          ▼
                                    ┌───────────┐
                                    │  SUCCESS  │
                                    └───────────┘
```

## Setup Steps

### 1. Create a Script — "Detect Email Provider"

In the admin panel, create a script with the following source code:

```javascript
export async function execute(ctx, hook) {
  // Grab email from the first page's form data
  const pages = Object.values(ctx.formData);
  const email = pages
    .map((p) => p.email)
    .find((e) => typeof e === "string" && e.includes("@"));

  if (!email) {
    hook.log("warn", "No email found in form data");
    hook.setOutputNode("other");
    return;
  }

  const domain = email.split("@")[1]?.toLowerCase();
  hook.log("info", `Detected domain: ${domain}`);

  // Store the domain for later use
  await hook.setStoreData("email_domain", domain);

  // Route based on provider
  if (domain === "gmail.com" || domain === "googlemail.com") {
    hook.setOutputNode("gmail");
  } else {
    hook.setOutputNode("other");
  }
}
```

### 2. Create a Form — "Email Routing Demo"

- **Name**: `Email Routing Demo`
- **Slug**: `email-routing`

#### Pages

| Page         | Fields                                                                 |
|--------------|------------------------------------------------------------------------|
| **Email**    | `email` (type: email, required, label: "Your Email", placeholder: "you@example.com") |
| **Gmail**    | `gmail_setup` (type: checkbox, label: "I've enabled 2FA on Gmail")     |
| **Other**    | `provider_name` (type: text, label: "Your email provider name")        |

### 3. Build the Flow

In the **Flow Builder**, create this flow:

1. **Start** → connects to **Email** page
2. **Email** page → `onSubmit` connects to **Detect Provider** script node
3. **Detect Provider** script node:
   - Set **outputs** to: `gmail`, `other`
   - Connect output `gmail` → **Gmail** page
   - Connect output `other` → **Other** page
4. **Gmail** page → `onSubmit` connects to **Success** end node
5. **Other** page → `onSubmit` connects to **Success** end node

### 4. Test It

Navigate to `http://localhost:4000/fill/email-routing` and:

1. Enter `john@gmail.com` → should route to the **Gmail** page
2. Enter `john@yahoo.com` → should route to the **Other** page

---

## API Payload Reference

### Form creation (`POST /api/forms`)

```json
{
  "name": "Email Routing Demo",
  "slug": "email-routing",
  "pages": [
    {
      "id": "page-email",
      "title": "Enter your email",
      "fields": [
        {
          "id": "field-email",
          "name": "email",
          "label": "Your Email",
          "type": "email",
          "placeholder": "you@example.com",
          "validation": { "required": true }
        }
      ]
    },
    {
      "id": "page-gmail",
      "title": "Gmail Setup",
      "fields": [
        {
          "id": "field-gmail-2fa",
          "name": "gmail_setup",
          "label": "I've enabled 2FA on Gmail",
          "type": "checkbox"
        }
      ]
    },
    {
      "id": "page-other",
      "title": "Other Provider",
      "fields": [
        {
          "id": "field-provider",
          "name": "provider_name",
          "label": "Your email provider name",
          "type": "text",
          "placeholder": "e.g. Yahoo, ProtonMail"
        }
      ]
    }
  ]
}
```

### Script Hook API (available in `hook`)

| Method | Description |
|--------|-------------|
| `hook.setOutputNode(name)` | Route to a named output (must match flow outputs) |
| `hook.setStoreData(key, value)` | Persist data to session KV store |
| `hook.getStoreData(key)` | Read from session KV store |
| `hook.setError(status, key, msg)` | Return an error response |
| `hook.setFieldError(formId, field, msg)` | Set a field-level validation error |
| `hook.setRedirect(url, status)` | Redirect the user |
| `hook.setResponse(payload, status)` | Send a custom JSON response |
| `hook.log(level, msg, meta)` | Log a message (`debug`, `info`, `warn`, `error`) |

### Script Context (available in `ctx`)

| Property | Description |
|----------|-------------|
| `ctx.session_id` | Unique session identifier |
| `ctx.formId` | The form's database ID |
| `ctx.formData` | All collected form data, keyed by page ID |
| `ctx.forms` | Form metadata (pages, fields) |
| `ctx.store` | Read-only session store (`get`, `list`) |
