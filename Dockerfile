FROM registry.access.redhat.com/ubi9/nodejs-22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM registry.access.redhat.com/ubi9/nginx-126
COPY --from=build /app/dist /opt/app-root/src
COPY deploy/nginx-http.conf /opt/app-root/etc/nginx.d/kubernaut.conf
COPY deploy/nginx-server.conf /opt/app-root/etc/nginx.default.d/kubernaut.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
