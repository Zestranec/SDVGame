FROM golang:1.21-alpine AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o server ./cmd/server

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /build/server ./server
COPY config.yml ./

ENV PORT=80
ENV CONFIG_FILE=/app/config.yml

EXPOSE 80

CMD ["./server"]
