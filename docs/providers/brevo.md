# Brevo Real Email Provider Adapter

The **Brevo Email Provider Adapter** integrates official transactional email capabilities into the AI Business Agent platform via the provider-independent **Level 3 Communication Gateway**.

---

## 1. Provider Overview

* **Provider**: Brevo (formerly Sendinblue)
* **API Version**: Transactional Email API v3 (`POST https://api.brevo.com/v3/smtp/email`)
* **Plan**: Free Plan
* **API Cost**: **₹0 / $0** (No credit card required)
* **Daily Quota**: Up to **300 emails/day** on Free plan
* **Official Reference**: [Brevo Transactional Email Documentation](https://developers.brevo.com/reference/sendtransacemail)

---

## 2. Capabilities Matrix

| Capability | Supported | Notes |
| :--- | :--- | :--- |
| `send` | **Yes** | Real transactional email dispatch via Brevo REST API v3 |
| `deliveryStatus` | **Yes** | Real-time carrier delivery status tracked via Brevo webhooks |
| `readStatus` | **Yes** | Open tracking pixel events (`opened`, `unique_opened`, `clicks`) via Brevo webhooks |
| `inboundMessages` | **No** | Inbound parsing requires dedicated custom MX domain routing |
| `attachments` | **No** | Text and formatted HTML drafts supported in current milestone |

---

## 3. Configuration & Environment Variables

Configure credentials in `.env` (or set environment variables on your server):

```env
# Active Communication Provider ("local" or "brevo")
COMMUNICATION_PROVIDER=brevo
EMAIL_PROVIDER=brevo

# Brevo Transactional Email Credentials
BREVO_API_KEY=xkeysib-your-real-brevo-api-key-here
BREVO_SENDER_EMAIL=verified.sender@yourdomain.com
BREVO_SENDER_NAME=Your Name / Company

# Optional: Shared secret for webhook security verification
BREVO_WEBHOOK_SECRET=your-secure-webhook-secret
```

### Safe Default
If `BREVO_API_KEY` is not provided or `COMMUNICATION_PROVIDER=local`, the system automatically defaults to the **₹0 Local Simulator Provider**, ensuring local development and tests never break or fail to start.

---

## 4. How to Obtain Credentials & Setup Sender

1. Sign up for a free account at [brevo.com](https://www.brevo.com/) (Free plan, ₹0, no credit card required).
2. Go to **Settings &rarr; Senders, Domains & Dedicated IPs &rarr; Senders**.
3. Add and verify your sender email address (e.g. `you@yourdomain.com`).
4. Navigate to **SMTP & API &rarr; API Keys** (`https://app.brevo.com/settings/keys/api`).
5. Click **Generate a new API key**, name it `ai-business-agent`, and copy the key into `.env` as `BREVO_API_KEY`.

---

## 5. Webhook Setup & Real-Time Tracking

To receive real delivery and open tracking notifications:

1. In the Brevo dashboard, navigate to **Transactional &rarr; Settings &rarr; Webhook** (`https://app.brevo.com/settings/webhooks`).
2. Add a new webhook URL:
   ```text
   https://your-domain.com/api/communication/webhook/brevo
   ```
3. Select events to monitor:
   - **Delivered** (`delivered`) &rarr; updates status to `DELIVERED`
   - **Opened** (`opened`, `unique_opened`) &rarr; updates status to `READ`
   - **Bounces / Blocked** (`hard_bounce`, `soft_bounce`, `blocked`) &rarr; updates status to `FAILED`
   - **Replies** (`reply`, `inbound`) &rarr; updates status to `REPLIED`
4. Add custom header in Brevo webhook settings:
   - Header Name: `X-Brevo-Webhook-Secret`
   - Header Value: Value matching `BREVO_WEBHOOK_SECRET` in `.env`

---

## 6. Security & Credential Protection

- **Zero Credential Exposure**: `BREVO_API_KEY` is strictly confined to server-side HTTPS requests and never returned in API payloads, logs, error responses, or frontend components.
- **Fail-Closed Webhook Verification**: If `BREVO_WEBHOOK_SECRET` is configured in production, any unauthenticated or mismatched webhook request is rejected with `401 Unauthorized`.
- **RBAC Enforcement**: Only users with the `communication.send` permission (roles `ADMIN` and `SALES`) can trigger email sends. Restricted roles (e.g. `VIEWER`) are denied with `403 Forbidden`.
- **Approval Safety**: AI drafts must be explicitly `APPROVED` by a human user before dispatch.
- **Opt-Out Safety**: Leads and clients marked with `communicationOptOut: true` are blocked from sending.

---

## 7. How to Switch Providers

Switching between providers is 100% configuration-driven:

### To use Local Simulator (Default ₹0):
```env
COMMUNICATION_PROVIDER=local
```

### To use Brevo Real Email:
```env
COMMUNICATION_PROVIDER=brevo
```

No code, database migrations, or business logic modifications are needed.
