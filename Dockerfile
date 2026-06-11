FROM registry.access.redhat.io/ubi9/nodejs-22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM registry.access.redhat.io/ubi9/nginx-126
COPY --from=build /app/dist /opt/app-root/src
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
