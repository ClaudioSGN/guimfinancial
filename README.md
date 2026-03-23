GuimFinancial is a web app built with Next.js.

## Getting Started

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Auth Redirects (Password Recovery)

Password recovery links should point to a public URL, not localhost.

Set one of these env vars:

- `NEXT_PUBLIC_AUTH_REDIRECT_URL=https://your-public-domain.com`
- or `NEXT_PUBLIC_APP_URL=https://your-public-domain.com`

The app will use `<your-url>/reset-password` as the recovery redirect target.
If neither is set and the app runs on localhost, Supabase falls back to your
project Auth Site URL and configured Redirect URLs.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
