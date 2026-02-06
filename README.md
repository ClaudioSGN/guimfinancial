GuimFinancial is a Tauri + Next.js desktop app.

## Getting Started

Run the web dev server (for UI development):

```bash
npm run dev
```

Run the desktop app in dev mode:

```bash
npm run tauri:dev
```

## Build (MSI)

The production build uses static export (`out/`) and bundles an MSI via Tauri:

```bash
npm run tauri:build
```

## Updater (Signing)

To generate updater artifacts (`bundle.createUpdaterArtifacts: true`), set:

- `TAURI_SIGNING_PRIVATE_KEY` = path to your private key file (keep it secret)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = your key password (if any)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
