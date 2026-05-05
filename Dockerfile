# ==========================================
# STAGE 1: Build the React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY powder-frontend/package*.json ./
RUN npm ci

COPY powder-frontend/ .
RUN npm run build

# ==========================================
# STAGE 2: Setup the FastAPI Backend
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# SECURITY: Create a dedicated non-root user and group
RUN groupadd -r powdergroup && useradd -r -g powdergroup -u 1000 powderuser

# Install Python dependencies
COPY powder-backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY powder-backend/ ./powder-backend/

# Copy the built React app from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/powder-backend/frontend_dist

# SECURITY: Transfer ownership of the app directory to the non-root user
# This allows the app to write to the SQLite DB and Vault directory
RUN chown -R powderuser:powdergroup /app

# SECURITY: Switch to the non-root user
USER powderuser

EXPOSE 8000

# Set the working directory so Python finds the correct local paths
WORKDIR /app/powder-backend

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]