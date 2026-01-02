# Pushup Tracker 2026

A mobile-first web app for tracking pushups and competing on a leaderboard, built with Next.js, Tailwind CSS, and Supabase.

## Features

- **Authentication**: Sign up and login with email/password
- **Dashboard**: Track pushups with an intuitive counter interface
- **Leaderboard**: View rankings with monthly totals, daily totals, and max sets
- **Mobile-First Design**: Apple-style aesthetic optimized for mobile devices

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your `.env.local` file with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The app expects the following Supabase tables:

- `profiles`: User profiles with `first_name` and `last_name`
- `pushup_logs`: Pushup submissions with `user_id`, `count`, and `created_at`

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase
- Lucide React (Icons)


