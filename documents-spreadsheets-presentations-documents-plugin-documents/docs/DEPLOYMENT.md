# Deployment

## Local

```bash
npm start
```

## Docker

```bash
docker compose up --build
```

The current app process uses the built-in demo store. PostgreSQL and Redis are included so the production persistence layer can be switched in without changing the external API.

## Recommended production topology

- CDN / static cache for `/styles.css` and `/app.js`.
- Nginx or managed load balancer with TLS termination.
- Node app replicas behind sticky sessions or Redis WebSocket adapter.
- PostgreSQL 16 for users, sessions, votes, trades, audit logs.
- Redis 7 for live `game_state:{roomCode}` with TTL 3600 seconds.
- Loki/Grafana or ELK for audit/event logs.
- Prometheus metrics for active sockets, request latency, vote latency, room count.

