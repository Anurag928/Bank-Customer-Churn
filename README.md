# Bank Customer Churn Prediction - Phase 2

Production-ready Phase 2 app with Flask backend, local email/password auth, XGBoost inference, profile stats, and Vercel deployment support.

## Features

- Email/password auth with hashed passwords
- Protected routes: Home, Predict, History, Profile
- Informational Home (hero + explanation + realistic FAQs + contact)
- Prediction page with real XGBoost inference
- History page (user-only, filter/search/sort, latest first)
- Profile page (user-only stats and recent predictions)
- Vercel serverless entry with deploy-safe fallback for CSV logging

## Required environment variables

- `SECRET_KEY`
- `MONGODB_URI`
- `MONGODB_DB_NAME` (optional, default `bank_churn_app`)
- `DATASET_PATH` (optional, default `data/bank_churn.csv`)
- `MODEL_PATH` (optional, default `model/xgb_model.pkl`)
- `CSV_LOG_PATH` (optional, default `prediction_history.csv`)
- `MAIL_SERVER` (optional, default `smtp.gmail.com`)
- `MAIL_PORT` (optional, default `587`)
- `MAIL_USE_TLS` (optional, default `true`)
- `MAIL_USERNAME` (set to `bankchurnpredictor@gmail.com`)
- `MAIL_PASSWORD` (Gmail app password)
- `MAIL_DEFAULT_SENDER` (optional, defaults to `MAIL_USERNAME`)
- `PASSWORD_RESET_TOKEN_TTL_MINUTES` (optional, default `15`)
- `ADMIN_ID` (optional, default `AADM057`)
- `ADMIN_EMAIL` (optional, default `gudaanurag6@gmail.com`)
- `ADMIN_PASSWORD` (required in production)
- `ADMIN_USER_SESSION_ID` (optional, default `admin-fixed`)

## Local setup

1. Create and activate a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root and fill the required values.
4. Train model:
   ```bash
   python train_model.py
   ```
5. Run app:
   ```bash
   python app.py
   ```

## Vercel deployment

1. Push this project to GitHub.
2. Import repo in Vercel.
3. Set build settings for Python project (handled by `vercel.json`).
4. Add required environment variables in Vercel dashboard.
5. Deploy.

Serverless entry point is `api/index.py`.

## Dataset & training

Training script reads dataset from:

```python
DATASET_PATH = os.getenv("DATASET_PATH", "data/bank_churn.csv")
```

Required columns:

- CreditScore
- Age
- Tenure
- Balance
- HasCrCard
- IsActiveMember
- EstimatedSalary
- Exited
