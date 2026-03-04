# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /adhd-backend ./cmd/server

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.19

WORKDIR /app

COPY --from=builder /adhd-backend /adhd-backend

EXPOSE 80

ENV PORT=80
ENV RNG_URL=http://localhost:4002/api
ENV ENABLE_GOD_MODE=0

ENTRYPOINT ["/adhd-backend"]
