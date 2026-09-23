# Loarn frontend

React and Vite frontend for the Loarn Application API.

## Run locally

From this directory:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

The Vite development server proxies `/api` requests to `http://localhost:3000`, so start the backend in a separate terminal first:

```powershell
cd ..
npm start
```

## Connected flows

- Register at `POST /api/users`
- Verify with an OTP at `POST /api/users/verify-otp`
- Sign in at `POST /api/users/login`
- View and edit the current profile at `/api/users/me`
- View the admin directory at `GET /api/users` when the JWT role is `admin`
