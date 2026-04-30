FROM node:22-alpine AS frontend

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM php:8.3-apache

RUN docker-php-ext-install pdo pdo_mysql \
    && a2enmod headers

WORKDIR /var/www/html

COPY --from=frontend /app/dist/ ./
COPY api ./api

RUN chown -R www-data:www-data /var/www/html/api

EXPOSE 80
