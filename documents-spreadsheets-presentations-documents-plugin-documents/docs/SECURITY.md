# Security Notes

## Реализовано

- JWT хранится только в HttpOnly cookie.
- Срок жизни сессии: 15 минут.
- Пароль проверяется regex-правилом: минимум 8 символов, 1 цифра, 1 спецсимвол.
- Хеширование паролей: Node.js `scrypt` с уникальной солью.
- Login rate limit: 5 запросов за 10 секунд с одного IP.
- Базовые security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Игровые действия пишутся в audit log.
- Повторное голосование быстрее 0.2 секунды отклоняется.

## Перед продакшеном

- Использовать HTTPS/WSS и `COOKIE_SECURE=true`.
- Вынести `JWT_SECRET` в секреты окружения.
- Подключить Google reCAPTCHA v3: сервер должен проверять токен через `RECAPTCHA_SECRET`.
- Заменить JSON-хранилище на PostgreSQL + Redis.
- Добавить CSRF-токен для POST-запросов, если cookie будет использоваться кросс-сайтово.
- Добавить строгий CSP после финализации списка внешних ресурсов.
- Подключить централизованный ban store для античита вместо in-memory map.
- Добавить CAPTCHA/rate limit на регистрацию и friend request.
- Добавить модерацию пользовательских сообщений чата, когда чат будет расширен.

