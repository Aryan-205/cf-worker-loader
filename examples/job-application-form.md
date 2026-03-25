# Example: Job Application Form

A multi-step job application form with **4 pages** and **3 scripts** demonstrating validation, conditional routing, and data enrichment.

## Use Case

> A company collects job applications through a multi-step form. Scripts validate the applicant's email domain, check their experience level to route them to the right track, and log the final submission.

## Flow Diagram

```
                                              ┌────────────────┐
                                         ┌──▸ │ Senior Track   │ ──┐
                                         │    │ (Page 3a)      │   │
┌───────┐    ┌────────────┐    ┌───────────────────┐           │   │
│ START │──▸ │ Basic Info  │──▸ │ Validate Email    │           │   │
└───────┘    │ (Page 1)   │    │ (Script 1)        │           │   │
             └────────────┘    └──────┬────────────┘           │   │
                                      │                        │   │
                            ┌─────────┘                        │   │
                            ▼                                  │   │
                  ┌────────────────┐    ┌───────────────────┐  │   │
                  │ Experience     │──▸ │ Route by Level    │  │   │
                  │ (Page 2)      │    │ (Script 2)        │──┘   │
                  └────────────────┘   └──────┬────────────┘      │
                                              │                   │
                                              ▼                   │
                                    ┌────────────────┐            │
                                    │ Junior Track   │            │
                                    │ (Page 3b)      │ ──┐        │
                                    └────────────────┘   │        │
                                                         │        │
                                                         ▼        ▼
                                                  ┌───────────────────┐
                                                  │ Submit & Log      │
                                                  │ (Script 3)        │
                                                  └────────┬──────────┘
                                                           │
                                                    ┌──────┴──────┐
                                                    ▼             ▼
                                              ┌─────────┐  ┌─────────┐
                                              │ SUCCESS │  │ FAILURE │
                                              └─────────┘  └─────────┘
```

---

## Pages (4)

### Page 1 — Basic Info

| Field        | Type   | Label              | Required | Placeholder             |
|--------------|--------|--------------------|----------|-------------------------|
| `full_name`  | text   | Full Name          | ✓        | John Doe                |
| `email`      | email  | Email Address      | ✓        | john@company.com        |
| `phone`      | tel    | Phone Number       |          | +1 (555) 000-0000       |

### Page 2 — Experience

| Field            | Type   | Label                         | Required | Placeholder                |
|------------------|--------|-------------------------------|----------|----------------------------|
| `years_exp`      | number | Years of Experience           | ✓        | e.g. 5                     |
| `current_role`   | text   | Current Role / Title          | ✓        | e.g. Software Engineer     |
| `linkedin`       | url    | LinkedIn Profile              |          | https://linkedin.com/in/…  |

### Page 3a — Senior Track

| Field            | Type     | Label                              | Required |
|------------------|----------|------------------------------------|----------|
| `leadership`     | textarea | Describe your leadership experience | ✓        |
| `salary_expect`  | number   | Expected Salary (USD)              | ✓        |
| `notice_period`  | text     | Notice Period                      |          |

### Page 3b — Junior Track

| Field            | Type     | Label                               | Required |
|------------------|----------|-------------------------------------|----------|
| `motivation`     | textarea | Why do you want to join us?         | ✓        |
| `portfolio`      | url      | Portfolio / GitHub URL              |          |
| `available_date` | date     | Earliest Available Start Date      | ✓        |

---

## Scripts (3)

### Script 1 — Validate Email

Checks that the applicant's email isn't from a disposable/free provider. Routes to `valid` or `invalid` output.

**Outputs:** `valid`, `invalid`

```javascript
export async function execute(ctx, hook) {
  const email = Object.values(ctx.formData)
    .map((p) => p.email)
    .find((e) => typeof e === "string" && e.includes("@"));

  if (!email) {
    hook.log("error", "No email provided");
    hook.setOutputNode("invalid");
    return;
  }

  const domain = email.split("@")[1]?.toLowerCase();

  // Block disposable email providers
  const blocked = [
    "tempmail.com", "throwaway.email", "mailinator.com",
    "guerrillamail.com", "yopmail.com", "trashmail.com",
  ];

  if (blocked.includes(domain)) {
    hook.log("warn", `Blocked disposable email domain: ${domain}`);
    hook.setError(400, "disposable_email", "Please use a non-disposable email address.");
    hook.setOutputNode("invalid");
    return;
  }

  // Store normalized email
  await hook.setStoreData("applicant_email", email.toLowerCase());
  await hook.setStoreData("email_domain", domain);
  hook.log("info", `Email validated: ${email}`);
  hook.setOutputNode("valid");
}
```

### Script 2 — Route by Experience Level

Reads the years of experience and routes to `senior` or `junior` track.

**Outputs:** `senior`, `junior`

```javascript
export async function execute(ctx, hook) {
  const expPage = Object.values(ctx.formData).find((p) => p.years_exp !== undefined);
  const years = Number(expPage?.years_exp ?? 0);

  hook.log("info", `Applicant has ${years} years of experience`);

  // Store for later reference
  await hook.setStoreData("years_experience", years);
  await hook.setStoreData("current_role", expPage?.current_role ?? "Unknown");

  if (years >= 5) {
    hook.log("info", "Routing to senior track");
    hook.setOutputNode("senior");
  } else {
    hook.log("info", "Routing to junior track");
    hook.setOutputNode("junior");
  }
}
```

### Script 3 — Submit & Log Application

Aggregates all form data, logs the submission, and stores the final record. Routes to `done` or `error`.

**Outputs:** `done`, `error`

```javascript
export async function execute(ctx, hook) {
  try {
    // Aggregate all form data
    const allData = {};
    for (const [pageId, fields] of Object.entries(ctx.formData)) {
      Object.assign(allData, fields);
    }

    // Retrieve stored metadata
    const email = await hook.getStoreData("applicant_email");
    const years = await hook.getStoreData("years_experience");
    const role = await hook.getStoreData("current_role");

    const application = {
      email,
      years_experience: years,
      current_role: role,
      track: Number(years) >= 5 ? "senior" : "junior",
      submitted_at: new Date().toISOString(),
      ...allData,
    };

    // Persist the final application
    await hook.setStoreData("application", application);

    hook.log("info", "Application submitted successfully", { application });
    hook.setResponse({ message: "Application received!", application });
    hook.setOutputNode("done");
  } catch (err) {
    hook.log("error", `Submission failed: ${err.message}`);
    hook.setError(500, "submission_failed", "Something went wrong. Please try again.");
    hook.setOutputNode("error");
  }
}
```

---

## Flow Builder Wiring

| Step                  | Type   | Connects to                                      |
|-----------------------|--------|--------------------------------------------------|
| **Start**             | start  | → Page 1 (Basic Info)                            |
| **Page 1** (Basic)    | page   | `onSubmit` → Script 1 (Validate Email)           |
| **Script 1** (Email)  | script | output `valid` → Page 2, output `invalid` → Failure End |
| **Page 2** (Exp)      | page   | `onSubmit` → Script 2 (Route by Level)           |
| **Script 2** (Route)  | script | output `senior` → Page 3a, output `junior` → Page 3b |
| **Page 3a** (Senior)  | page   | `onSubmit` → Script 3 (Submit)                   |
| **Page 3b** (Junior)  | page   | `onSubmit` → Script 3 (Submit)                   |
| **Script 3** (Submit) | script | output `done` → Success End, output `error` → Failure End |

---

## API Payload

### `POST /api/forms`

```json
{
  "name": "Job Application",
  "slug": "job-application",
  "pages": [
    {
      "id": "page-basic",
      "title": "Basic Information",
      "fields": [
        { "id": "f-name", "name": "full_name", "label": "Full Name", "type": "text", "placeholder": "John Doe", "validation": { "required": true } },
        { "id": "f-email", "name": "email", "label": "Email Address", "type": "email", "placeholder": "john@company.com", "validation": { "required": true } },
        { "id": "f-phone", "name": "phone", "label": "Phone Number", "type": "tel", "placeholder": "+1 (555) 000-0000" }
      ]
    },
    {
      "id": "page-experience",
      "title": "Experience",
      "fields": [
        { "id": "f-years", "name": "years_exp", "label": "Years of Experience", "type": "number", "placeholder": "e.g. 5", "validation": { "required": true } },
        { "id": "f-role", "name": "current_role", "label": "Current Role / Title", "type": "text", "placeholder": "e.g. Software Engineer", "validation": { "required": true } },
        { "id": "f-linkedin", "name": "linkedin", "label": "LinkedIn Profile", "type": "url", "placeholder": "https://linkedin.com/in/..." }
      ]
    },
    {
      "id": "page-senior",
      "title": "Senior Track",
      "fields": [
        { "id": "f-leadership", "name": "leadership", "label": "Describe your leadership experience", "type": "textarea", "validation": { "required": true } },
        { "id": "f-salary", "name": "salary_expect", "label": "Expected Salary (USD)", "type": "number", "validation": { "required": true } },
        { "id": "f-notice", "name": "notice_period", "label": "Notice Period", "type": "text" }
      ]
    },
    {
      "id": "page-junior",
      "title": "Junior Track",
      "fields": [
        { "id": "f-motivation", "name": "motivation", "label": "Why do you want to join us?", "type": "textarea", "validation": { "required": true } },
        { "id": "f-portfolio", "name": "portfolio", "label": "Portfolio / GitHub URL", "type": "url" },
        { "id": "f-available", "name": "available_date", "label": "Earliest Available Start Date", "type": "date", "validation": { "required": true } }
      ]
    }
  ]
}
```

### Test Scenarios

| Input Email            | Years | Expected Route               |
|------------------------|-------|------------------------------|
| `alice@company.com`    | 8     | Page 1 → Page 2 → **Senior Track** → Submit → Success |
| `bob@startup.io`       | 2     | Page 1 → Page 2 → **Junior Track** → Submit → Success |
| `spam@mailinator.com`  | —     | Page 1 → **Failure** (blocked email)                    |
