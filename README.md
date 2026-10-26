# Cloudy Playz Website

A dark, responsive website starter with:
- Signup and login (bcrypt password hashing)
- User dashboard
- Admin dashboard and recent-user list
- Minecraft Java server status
- Optional Razorpay checkout integration
- Mobile-responsive layout

## Requirements

Install Node.js 20 or newer from https://nodejs.org/ . Check it in Command Prompt:

```bash
node -v
npm -v
```

## Run locally on Windows

1. Extract this ZIP.
2. Open the extracted `cloudy-playz-website` folder.
3. Copy `.env.example` to a new file named `.env`.
4. Edit `.env` in Notepad. Set `SESSION_SECRET` to a long random string and `ADMIN_EMAIL` to the email address you want to use for the first admin account.
5. Optional: set `MINECRAFT_SERVER_HOST` and `MINECRAFT_SERVER_PORT` to your Java server address.
6. Open Command Prompt in this folder. In File Explorer, click the address bar, type `cmd`, and press Enter.
7. Run:

```bash
npm install
npm start
```

8. Open http://localhost:3000 in your browser.
9. Sign up using the email set in `ADMIN_EMAIL` to create the initial admin account. Other accounts become normal users.

## Payments (optional)

This starter uses Razorpay. Create an account at https://razorpay.com/ and use its **Test Mode** keys first. Put the key ID and secret in `.env`, then restart the server. Never put the key secret in `public/app.js` or commit `.env` to GitHub.

Important: the example verifies Razorpay's signature, but does not yet save orders to a database, reconcile webhooks, or fulfil purchases. Do not use it to deliver paid ranks/items until those production checks are implemented and tested. For a real business, configure refund/support details and comply with applicable laws and provider requirements.

## Deployment checklist

Before putting this on the public internet:
- Use HTTPS.
- Set `NODE_ENV=production` and a strong, unique `SESSION_SECRET`.
- Set a real `ADMIN_EMAIL`; create the first admin account before allowing public signup, or temporarily disable public signup afterward.
- Use a persistent database (PostgreSQL/SQLite with proper backups) instead of the starter JSON file.
- Use a durable session store (Redis/database) instead of the file session store for multi-instance production.
- Add CSRF protection, account verification, password reset, audit logs, and admin role-management safeguards.
- Add Razorpay webhooks and server-side order/amount/ownership validation before fulfilling any paid order.
- Keep `.env`, `data/`, session files, and secrets out of public/static directories and source control.

## Notes

- Server status is for Minecraft **Java Edition** and uses the public mcsrvstat.us status service.
- The current status is refreshed when the page opens, on the Refresh button, and every 60 seconds.
- This is a starter project, not a fully audited production payment/account system.
