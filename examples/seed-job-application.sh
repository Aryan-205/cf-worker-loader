#!/usr/bin/env bash
#
# Provisions the "Job Application" example flow:
#   3 scripts + 1 form (4 pages) + flow wiring
#
# Usage:
#   chmod +x examples/seed-job-application.sh
#   ./examples/seed-job-application.sh
#
# Requires: curl, jq
# Backend must be running on localhost:3000

set -euo pipefail

API="http://localhost:3000/api"

echo "━━━ Creating scripts ━━━"

# ── Script 1: Validate Email ──────────────────────────────────────────────

SCRIPT1=$(curl -s "$API/scripts" \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "Validate Email",
  "source": "export async function execute(ctx, hook) {\n  const email = Object.values(ctx.formData)\n    .map((p) => p.email)\n    .find((e) => typeof e === \"string\" && e.includes(\"@\"));\n\n  if (!email) {\n    hook.log(\"error\", \"No email provided\");\n    hook.setOutputNode(\"invalid\");\n    return;\n  }\n\n  const domain = email.split(\"@\")[1]?.toLowerCase();\n  const blocked = [\"tempmail.com\", \"throwaway.email\", \"mailinator.com\", \"guerrillamail.com\", \"yopmail.com\"];\n\n  if (blocked.includes(domain)) {\n    hook.log(\"warn\", \"Blocked disposable email: \" + domain);\n    hook.setError(400, \"disposable_email\", \"Please use a non-disposable email address.\");\n    hook.setOutputNode(\"invalid\");\n    return;\n  }\n\n  await hook.setStoreData(\"applicant_email\", email.toLowerCase());\n  await hook.setStoreData(\"email_domain\", domain);\n  hook.log(\"info\", \"Email validated: \" + email);\n  hook.setOutputNode(\"valid\");\n}"
}')

SCRIPT1_ID=$(echo "$SCRIPT1" | jq -r '._id')
echo "✓ Script 1 (Validate Email): $SCRIPT1_ID"

# ── Script 2: Route by Experience Level ───────────────────────────────────

SCRIPT2=$(curl -s "$API/scripts" \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "Route by Level",
  "source": "export async function execute(ctx, hook) {\n  const expPage = Object.values(ctx.formData).find((p) => p.years_exp !== undefined);\n  const years = Number(expPage?.years_exp ?? 0);\n\n  hook.log(\"info\", \"Applicant has \" + years + \" years of experience\");\n  await hook.setStoreData(\"years_experience\", years);\n  await hook.setStoreData(\"current_role\", expPage?.current_role ?? \"Unknown\");\n\n  if (years >= 5) {\n    hook.log(\"info\", \"Routing to senior track\");\n    hook.setOutputNode(\"senior\");\n  } else {\n    hook.log(\"info\", \"Routing to junior track\");\n    hook.setOutputNode(\"junior\");\n  }\n}"
}')

SCRIPT2_ID=$(echo "$SCRIPT2" | jq -r '._id')
echo "✓ Script 2 (Route by Level): $SCRIPT2_ID"

# ── Script 3: Submit & Log ────────────────────────────────────────────────

SCRIPT3=$(curl -s "$API/scripts" \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "Submit Application",
  "source": "export async function execute(ctx, hook) {\n  try {\n    const allData = {};\n    for (const [pageId, fields] of Object.entries(ctx.formData)) {\n      Object.assign(allData, fields);\n    }\n\n    const email = await hook.getStoreData(\"applicant_email\");\n    const years = await hook.getStoreData(\"years_experience\");\n    const role = await hook.getStoreData(\"current_role\");\n\n    const application = {\n      email,\n      years_experience: years,\n      current_role: role,\n      track: Number(years) >= 5 ? \"senior\" : \"junior\",\n      submitted_at: new Date().toISOString(),\n      ...allData,\n    };\n\n    await hook.setStoreData(\"application\", application);\n    hook.log(\"info\", \"Application submitted\", { application });\n    hook.setResponse({ message: \"Application received!\", application });\n    hook.setOutputNode(\"done\");\n  } catch (err) {\n    hook.log(\"error\", \"Submission failed: \" + err.message);\n    hook.setError(500, \"submission_failed\", \"Something went wrong.\");\n    hook.setOutputNode(\"error\");\n  }\n}"
}')

SCRIPT3_ID=$(echo "$SCRIPT3" | jq -r '._id')
echo "✓ Script 3 (Submit Application): $SCRIPT3_ID"

echo ""
echo "━━━ Creating form ━━━"

# ── Form: Job Application (4 pages) ──────────────────────────────────────

FORM=$(curl -s "$API/forms" \
  -H 'Content-Type: application/json' \
  -d '{
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
}')

FORM_ID=$(echo "$FORM" | jq -r '._id')
echo "✓ Form (Job Application): $FORM_ID"

echo ""
echo "━━━ Wiring flow ━━━"

# ── Update form with flow array ───────────────────────────────────────────

curl -s -X PUT "$API/forms/$FORM_ID" \
  -H 'Content-Type: application/json' \
  -d "$(cat <<EOF
{
  "scripts": [
    { "scriptId": "$SCRIPT1_ID", "event": "onSubmit", "order": 0 },
    { "scriptId": "$SCRIPT2_ID", "event": "onSubmit", "order": 1 },
    { "scriptId": "$SCRIPT3_ID", "event": "onSubmit", "order": 2 }
  ],
  "flow": [
    {
      "id": "step-start",
      "type": "start",
      "next": "step-page-basic",
      "position": { "x": 0, "y": 150 }
    },
    {
      "id": "step-page-basic",
      "type": "page",
      "pageId": "page-basic",
      "onSubmit": "step-validate-email",
      "position": { "x": 200, "y": 150 }
    },
    {
      "id": "step-validate-email",
      "type": "script",
      "scriptId": "$SCRIPT1_ID",
      "event": "onSubmit",
      "outputs": ["valid", "invalid"],
      "outputTargets": {
        "valid": "step-page-experience",
        "invalid": "step-end-failure"
      },
      "position": { "x": 420, "y": 150 }
    },
    {
      "id": "step-page-experience",
      "type": "page",
      "pageId": "page-experience",
      "onSubmit": "step-route-level",
      "position": { "x": 640, "y": 150 }
    },
    {
      "id": "step-route-level",
      "type": "script",
      "scriptId": "$SCRIPT2_ID",
      "event": "onSubmit",
      "outputs": ["senior", "junior"],
      "outputTargets": {
        "senior": "step-page-senior",
        "junior": "step-page-junior"
      },
      "position": { "x": 860, "y": 150 }
    },
    {
      "id": "step-page-senior",
      "type": "page",
      "pageId": "page-senior",
      "onSubmit": "step-submit",
      "position": { "x": 1080, "y": 50 }
    },
    {
      "id": "step-page-junior",
      "type": "page",
      "pageId": "page-junior",
      "onSubmit": "step-submit",
      "position": { "x": 1080, "y": 280 }
    },
    {
      "id": "step-submit",
      "type": "script",
      "scriptId": "$SCRIPT3_ID",
      "event": "onSubmit",
      "outputs": ["done", "error"],
      "outputTargets": {
        "done": "step-end-success",
        "error": "step-end-failure"
      },
      "position": { "x": 1300, "y": 150 }
    },
    {
      "id": "step-end-success",
      "type": "end",
      "outcome": "success",
      "position": { "x": 1520, "y": 80 }
    },
    {
      "id": "step-end-failure",
      "type": "end",
      "outcome": "failure",
      "position": { "x": 1520, "y": 280 }
    }
  ]
}
EOF
)" | jq .

echo ""
echo "━━━ Done! ━━━"
echo ""
echo "  Form ID:    $FORM_ID"
echo "  Script 1:   $SCRIPT1_ID  (Validate Email)"
echo "  Script 2:   $SCRIPT2_ID  (Route by Level)"
echo "  Script 3:   $SCRIPT3_ID  (Submit Application)"
echo ""
echo "  Fill it at: http://localhost:4000/fill/job-application"
echo ""
