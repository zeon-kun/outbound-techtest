# Smart Feedback Portal

**Submitter**: Muhammad Rafif Tri Risqullah

**Email**: rafif.zeon@gmail.com

**Production Link**: https://outbound.jeong.cloud

> A customer feedback management system with automated AI-powered classification using Next.js, Supabase, and n8n.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
  - [Database Schema](#database-schema)
  - [Row Level Security (RLS) Policies](#row-level-security-rls-policies)
- [n8n Workflow Setup](#n8n-workflow-setup)
  - [Workflow Configuration](#workflow-configuration)
  - [Importing the Workflow](#importing-the-workflow)
- [Running the Application](#running-the-application)
- [How It Works](#how-it-works)
  - [Submission Flow](#submission-flow)
  - [Classification Logic](#classification-logic)
  - [Update Mechanism](#update-mechanism)
- [Project Structure](#project-structure)
- [API Routes](#api-routes)
- [Demo](#demo)
- [License](#license)

---

## Overview

The Smart Feedback Portal is a full-stack application that allows users to submit feedback, which is then automatically classified by category and priority using AI. The system integrates Next.js for the frontend, Supabase for authentication and database, and n8n for workflow automation.

**Key Highlights:**

- Real-time feedback submission and tracking
- AI-powered classification using Groq AI via n8n
- Automated workflow processing
- Clean, professional UI with Paste-inspired design
- Secure user authentication and data isolation

---

## Features

- **User Authentication** - Email/password login with Supabase Auth
- **Feedback Submission** - Simple form to submit feedback with title and description
- **Auto-Classification** - AI analyzes feedback and assigns category (Bug/Feature Request/General) and priority (High/Low)
- **Status Tracking** - Visual indicators for Pending/Processed status
- **Auto-Update** - Feedback list updates automatically after processing via polling mechanism
- **Debug Tools** - Manual webhook trigger for testing and development
- **Secure** - Row-level security ensures users only see their own feedback
- **Professional Logging** - Comprehensive console logs for debugging

---

## Tech Stack

**Frontend:**

- Next.js 16.1.5 (App Router)
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui components
- Sonner (toast notifications)
- Lucide React (icons)

**Backend:**

- Supabase (Authentication, Database, Realtime)
- PostgreSQL (Database)
- Row Level Security (RLS)

**Automation:**

- n8n (Workflow automation)
- Groq AI (Text classification via llama-3.1-8b-instant)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v20.x or higher
- **Bun**: Latest version (or npm/yarn/pnpm)
- **Supabase Account**: [Sign up here](https://supabase.com)
- **n8n Instance**: Self-hosted or cloud ([n8n.io](https://n8n.io))
- **Groq API Key**: [Get free API key](https://console.groq.com)

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/outbound-techtest.git
cd outbound-techtest
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values (see [Environment Variables](#environment-variables) section).

---

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# n8n Webhook Configuration
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-domain.com/webhook/feedback
NEXT_PUBLIC_N8N_WEBHOOK_USER=your_webhook_username
NEXT_PUBLIC_N8N_WEBHOOK_PASSWORD=your_webhook_password

# Application URL
NEXT_PUBLIC_URL=http://localhost:3000
```

**How to get these values:**

**Supabase:**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to Settings → API
4. Copy `Project URL` and `anon/public` key

**n8n Webhook:**

1. Create a webhook node in your n8n workflow
2. Copy the webhook URL from the node
3. Set up Basic Authentication in n8n webhook settings
4. Use the credentials you configured

---

## Database Setup

### Database Schema

The application uses a single `feedback` table with the following structure:

**Table: `feedback`**

| Column        | Type        | Constraints                             | Description                          |
| ------------- | ----------- | --------------------------------------- | ------------------------------------ |
| `id`          | uuid        | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier                    |
| `user_id`     | uuid        | FOREIGN KEY (auth.users), NOT NULL      | Reference to authenticated user      |
| `title`       | text        | NOT NULL                                | Feedback title                       |
| `description` | text        | NOT NULL                                | Feedback description                 |
| `category`    | text        | NULL                                    | Classification category (set by n8n) |
| `priority`    | text        | NULL                                    | Priority level (set by n8n)          |
| `status`      | text        | DEFAULT 'Pending'                       | Processing status                    |
| `created_at`  | timestamptz | DEFAULT now()                           | Creation timestamp                   |

**SQL to create the table:**

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  priority TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for better query performance
CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
```

### Row Level Security (RLS) Policies

The application implements Row Level Security to ensure users can only access their own feedback.

**Enable RLS:**

```sql
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
```

**Create Policies:**

```sql
-- Policy: Users can view their own feedback
CREATE POLICY "select_own_feedback"
ON feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can insert their own feedback
CREATE POLICY "insert_own_feedback"
ON feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role (n8n) can update any feedback
CREATE POLICY "service_role_update"
ON feedback
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);
```

**RLS Policy Screenshot:**

[Insert screenshot of RLS policies from Supabase Dashboard here]

**Verification:**

To verify your policies are correctly set up, run:

```sql
SELECT * FROM pg_policies WHERE tablename = 'feedback';
```

---

## n8n Workflow Setup

### Workflow Configuration

The n8n workflow consists of the following nodes:

1. **Webhook (Trigger)** - Receives feedback data from Next.js
2. **Groq Chat Model** - AI classification using llama-3.1-8b-instant
3. **Code** - Parses AI response and extracts classification
4. **Supabase** - Updates feedback with category and priority
5. **Respond to Webhook** - Sends success response back to Next.js

**Workflow Diagram:**

```
Webhook → Groq AI → Code Parser → Supabase Update → Response
```

### Importing the Workflow

**Step 1: Import Workflow JSON**

1. Open your n8n instance
2. Click "Add workflow"
3. Click the three dots menu → "Import from File"
4. Select the `n8n-workflow.json` file from the `/workflows` directory

**Step 2: Configure Credentials**

**Groq API:**

1. In the Groq Chat Model node, click on "Credentials"
2. Add new credentials
3. Enter your Groq API key from [console.groq.com](https://console.groq.com)

**Supabase:**

1. In the Supabase node, click on "Credentials"
2. Add new credentials
3. Enter your Supabase Project URL
4. Enter your Supabase **Service Role Key** (not anon key)
   - Found in: Supabase Dashboard → Settings → API → `service_role` key

**Step 3: Configure Webhook Authentication**

1. Click on the Webhook node
2. Under "Authentication", select "Basic Auth"
3. Set username and password (must match `.env.local` values)
4. Copy the webhook URL

**Step 4: Activate Workflow**

1. Toggle the workflow to "Active"
2. Test using the Debug button in the Next.js application

---

## Running the Application

### Development Mode

```bash
bun run dev
```

The application will be available at `http://localhost:3000`

### Production Build

```bash
bun run build
bun run start
```

### Initial Setup Steps

1. Navigate to `http://localhost:3000`
2. You will be redirected to `/login`
3. Click "Sign up" to create an account
4. Enter your email and password
5. Log in with your credentials
6. Submit feedback to test the workflow

---

## How It Works

### Submission Flow

1. **User submits feedback** via the dashboard form
2. **Next.js creates record** in Supabase with `status: "Pending"`
3. **Auto-trigger n8n** - Next.js immediately calls n8n webhook with feedback data
4. **n8n processes** - Workflow analyzes text and determines classification
5. **Update database** - n8n updates Supabase with results and sets `status: "Processed"`
6. **Polling updates UI** - Next.js polls Supabase every 2-3 seconds to check for updates
7. **User sees result** - UI updates automatically with category and priority badges

### Classification Logic

The AI classification uses the following rules:

**Keywords Detection:**

```
Bug (High Priority):
- Keywords: urgent, broken, error, crash, bug, not working, failed

Feature Request (Low Priority):
- Keywords: feature, enhancement, suggestion, would like, request

General (Low Priority):
- Default category for everything else
```

**Code Node Logic (Simplified):**

```javascript
const description = feedback.description.toLowerCase();
const urgentKeywords = ["urgent", "broken", "error", "crash", "bug"];

if (urgentKeywords.some((kw) => description.includes(kw))) {
  return { category: "Bug", priority: "High" };
} else {
  return { category: "General", priority: "Low" };
}
```

### Update Mechanism

The application uses **polling** instead of WebSockets/Realtime for simplicity:

1. After webhook triggers, start polling
2. Check database every 2-3 seconds (up to 5 attempts)
3. Update UI when `status` changes to `"Processed"`
4. Display toast notification with classification results

**Note:** For production, this could be enhanced with WebSockets or Server-Sent Events for true real-time updates.

---

## Project Structure

```
outbound-techtest/
├── app/
│   ├── login/
│   │   └── page.tsx              # Login page
│   ├── register/
│   │   └── page.tsx              # Registration page
│   ├── dashboard/
│   │   └── page.tsx              # Main dashboard (feedback form + list)
│   ├── layout.tsx                # Root layout with Sonner toaster
│   └── globals.css               # Global styles
├── components/
│   └── ui/                       # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       └── //etc. fetch from shadcn
├── lib/
│   └── supabase.ts               # Supabase client configuration
│   └── utils.ts                  # Utility
├── workflows/
│   └── n8n-workflow.json         # n8n workflow export
├── .env.local                    # Environment variables (create this)
├── .env.example                  # Environment variables template
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── //etc other config from next
└── README.md
```

---

## API Routes

The application does not use custom API routes. All data operations go directly through Supabase client:

**Supabase Operations:**

- `supabase.auth.signUp()` - User registration
- `supabase.auth.signInWithPassword()` - User login
- `supabase.auth.signOut()` - User logout
- `supabase.from('feedback').insert()` - Create feedback
- `supabase.from('feedback').select()` - Fetch feedback
- `supabase.from('feedback').update()` - Update feedback (via n8n service role)

**External Webhook:**

- `POST` to n8n webhook URL - Triggers workflow automation

---

## Demo

### Screenshots

**Login Page:**
[Insert screenshot]

**Dashboard - Submit Feedback:**
[Insert screenshot]

**Dashboard - Feedback List with Status:**
[Insert screenshot]

**Debug Modal:**
[Insert screenshot]

**Console Logs:**
[Insert screenshot showing professional logging]

### Video Demo

[Optional: Insert Loom/YouTube link showing the real-time update in action]

**Demo Flow:**

1. User logs in
2. Submits feedback with keywords like "urgent error"
3. Status shows "Pending" with pulse animation
4. After 2-3 seconds, status changes to "Processed"
5. Category badge shows "Bug", Priority badge shows "High"
6. Toast notification appears with classification results

---

## License

This project is created as a technical assessment for Outbound. All rights reserved.
